const WINDOW_MS = 15 * 60 * 1000;
const REDIS_TIMEOUT_MS = 1500;
const MAX_MEMORY_ENTRIES = 10000;

const RATE_LIMIT_LUA = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  return { current, tonumber(ARGV[1]) }
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`;

let sharedRedisClient = null;

/**
 * Registers the shared ioredis client for distributed rate limiting.
 */
export function setRateLimitRedisClient(client) {
    sharedRedisClient = client || null;
}

function clientIp(req) {
    return req.ip || req.socket?.remoteAddress || "unknown";
}

function accountIdentifier(req) {
    return String(req.body?.email || req.body?.username || "").trim().toLowerCase();
}

function createMemoryCounter(now = Date.now) {
    const store = new Map();

    function prune(currentTime) {
        for (const [key, entry] of store.entries()) {
            if (currentTime >= entry.resetAt) store.delete(key);
        }
        while (store.size >= MAX_MEMORY_ENTRIES) {
            const oldestKey = store.keys().next().value;
            if (oldestKey === undefined) break;
            store.delete(oldestKey);
        }
    }

    return {
        increment(key, windowMs) {
            const currentTime = now();
            const existing = store.get(key);
            if (!existing || currentTime >= existing.resetAt) {
                if (store.size >= MAX_MEMORY_ENTRIES) prune(currentTime);
                const resetAt = currentTime + windowMs;
                store.set(key, { count: 1, resetAt });
                return { count: 1, ttlMs: windowMs };
            }
            existing.count += 1;
            return { count: existing.count, ttlMs: Math.max(1, existing.resetAt - currentTime) };
        },
        reset(key) {
            store.delete(key);
        },
    };
}

async function withRedisTimeout(operation) {
    let timer;
    try {
        return await Promise.race([
            operation(),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error("Rate limit Redis timeout")), REDIS_TIMEOUT_MS);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

async function incrementRedis(redis, key, windowMs) {
    return withRedisTimeout(async () => {
        if (typeof redis.eval === "function") {
            const [count, ttl] = await redis.eval(RATE_LIMIT_LUA, 1, key, String(windowMs));
            return { count: Number(count), ttlMs: Math.max(1, Number(ttl) || windowMs) };
        }
        const count = Number(await redis.incr(key));
        if (count === 1) {
            await redis.pexpire(key, windowMs);
            return { count, ttlMs: windowMs };
        }
        let ttlMs = Number(await redis.pttl(key));
        if (!Number.isFinite(ttlMs) || ttlMs < 0) {
            await redis.pexpire(key, windowMs);
            ttlMs = windowMs;
        }
        return { count, ttlMs: Math.max(1, ttlMs) };
    });
}

async function deleteRedis(redis, key) {
    return withRedisTimeout(() => redis.del(key));
}

/**
 * Creates an Express fixed-window rate limiter backed by Redis when ready,
 * with an automatic bounded in-memory fallback when Redis is unavailable.
 */
export function createRateLimiter({
    prefix,
    windowMs = WINDOW_MS,
    max,
    message = "Too many attempts. Please try again later.",
    keyGenerator = (req) => clientIp(req),
    getRedis = () => sharedRedisClient,
    now = Date.now,
    resetOnSuccess = false,
}) {
    const memoryCounter = createMemoryCounter(now);

    return async function rateLimiter(req, res, next) {
        const keySuffix = keyGenerator(req);
        if (!keySuffix) return next();

        const key = `${prefix}:${keySuffix}`;
        let result = null;
        const redis = getRedis?.();
        if (redis && redis.status === "ready") {
            try {
                result = await incrementRedis(redis, key, windowMs);
            } catch (err) {
                console.warn(`Rate limiter falling back to memory for ${prefix}:`, err.message);
            }
        }
        if (!result) {
            result = memoryCounter.increment(key, windowMs);
        }

        const remaining = Math.max(0, max - result.count);
        const resetSeconds = Math.max(1, Math.ceil(result.ttlMs / 1000));
        res.set("RateLimit-Limit", String(max));
        res.set("RateLimit-Remaining", String(remaining));
        res.set("RateLimit-Reset", String(resetSeconds));

        if (result.count > max) {
            res.set("Retry-After", String(resetSeconds));
            return res.status(429).json({
                success: false,
                message,
                code: "RATE_LIMIT_EXCEEDED",
            });
        }

        if (resetOnSuccess) {
            // Reset before sending the 2xx response so an immediate retry does not race Redis DEL or memory cleanup.
            const originalEnd = res.end;
            let resetHandled = false;
            res.end = function rateLimitResetEnd(...args) {
                if (resetHandled) return originalEnd.apply(res, args);
                resetHandled = true;
                res.end = originalEnd;
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    memoryCounter.reset(key);
                    if (!res.headersSent) {
                        res.set("RateLimit-Remaining", String(max));
                    }
                    const activeRedis = getRedis?.();
                    if (activeRedis && activeRedis.status === "ready" && typeof activeRedis.del === "function") {
                        deleteRedis(activeRedis, key)
                            .catch((err) => console.warn(`Rate limiter reset failed for ${prefix}:`, err.message))
                            .finally(() => originalEnd.apply(res, args));
                        return res;
                    }
                }
                return originalEnd.apply(res, args);
            };
        }

        return next();
    };
}

export const loginRateLimiter = [
    createRateLimiter({
        prefix: "rl:auth:login:ip",
        windowMs: WINDOW_MS,
        max: 30,
        message: "Too many login attempts from this network. Please wait a few minutes and try again.",
        keyGenerator: (req) => clientIp(req),
    }),
    createRateLimiter({
        prefix: "rl:auth:login:acct",
        windowMs: WINDOW_MS,
        max: 5,
        resetOnSuccess: true,
        message: "Too many failed login attempts for this account. Please wait a few minutes and try again.",
        keyGenerator: (req) => {
            const id = accountIdentifier(req);
            return id ? `${clientIp(req)}:${id}` : null;
        },
    }),
];

export const forgotPasswordRateLimiter = [
    createRateLimiter({
        prefix: "rl:auth:forgot:ip",
        windowMs: WINDOW_MS,
        max: 10,
        message: "Too many password reset requests. Please wait a few minutes and try again.",
        keyGenerator: (req) => clientIp(req),
    }),
    createRateLimiter({
        prefix: "rl:auth:forgot:acct",
        windowMs: WINDOW_MS,
        max: 3,
        message: "A password reset request was already submitted recently for this account. Please wait before trying again.",
        keyGenerator: (req) => accountIdentifier(req) || null,
    }),
];
