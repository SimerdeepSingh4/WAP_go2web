import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { createRateLimiter } from "./rate-limit.middleware.js";

async function withServer(middleware, handler, run) {
    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());
    app.post("/test", middleware, handler);
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
        return await run(`http://127.0.0.1:${port}/test`);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

test("blocks requests above limit with 429 headers and resets after the window expires", async () => {
    let clock = 1_000_000;
    const limiter = createRateLimiter({
        prefix: "test:mem",
        windowMs: 60_000,
        max: 2,
        message: "Slow down",
        now: () => clock,
    });

    await withServer(
        limiter,
        (_req, res) => res.json({ ok: true }),
        async url => {
            const first = await fetch(url, { method: "POST" });
            assert.equal(first.status, 200);
            assert.equal(first.headers.get("RateLimit-Limit"), "2");
            assert.equal(first.headers.get("RateLimit-Remaining"), "1");

            const second = await fetch(url, { method: "POST" });
            assert.equal(second.status, 200);
            assert.equal(second.headers.get("RateLimit-Remaining"), "0");

            const blocked = await fetch(url, { method: "POST" });
            assert.equal(blocked.status, 429);
            assert.equal(blocked.headers.get("Retry-After"), "60");
            assert.deepEqual(await blocked.json(), {
                success: false,
                message: "Slow down",
                code: "RATE_LIMIT_EXCEEDED",
            });

            clock += 60_000;
            const afterReset = await fetch(url, { method: "POST" });
            assert.equal(afterReset.status, 200);
            assert.equal(afterReset.headers.get("RateLimit-Remaining"), "1");
        }
    );
});

test("uses ready Redis client for counting, resets on 2xx when enabled, and falls back to memory if Redis errors", async () => {
    const counts = new Map();
    let failRedis = false;
    const mockRedis = {
        status: "ready",
        async eval(_script, _numKeys, key, windowMs) {
            if (failRedis) throw new Error("Redis down");
            const next = (counts.get(key) || 0) + 1;
            counts.set(key, next);
            return [next, Number(windowMs)];
        },
        async del(key) {
            if (failRedis) throw new Error("Redis down");
            return counts.delete(key) ? 1 : 0;
        },
    };

    const limiter = createRateLimiter({
        prefix: "test:redis",
        windowMs: 30_000,
        max: 1,
        getRedis: () => mockRedis,
    });

    await withServer(
        limiter,
        (_req, res) => res.json({ ok: true }),
        async url => {
            const ok = await fetch(url, { method: "POST" });
            assert.equal(ok.status, 200);
            assert.equal(counts.size, 1);

            const limited = await fetch(url, { method: "POST" });
            assert.equal(limited.status, 429);

            failRedis = true;
            const fallback = await fetch(url, { method: "POST" });
            assert.equal(fallback.status, 200);
        }
    );

    failRedis = false;
    counts.clear();
    const resetLimiter = createRateLimiter({
        prefix: "test:redis:reset",
        windowMs: 30_000,
        max: 2,
        resetOnSuccess: true,
        getRedis: () => mockRedis,
    });

    await withServer(
        resetLimiter,
        (req, res) => res.status(req.body?.fail ? 400 : 200).json({ ok: !req.body?.fail }),
        async url => {
            const post = (fail) => fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fail }),
            });

            const failedOnce = await post(true);
            assert.equal(failedOnce.status, 400);
            assert.equal(counts.get("test:redis:reset:::ffff:127.0.0.1") ?? counts.get("test:redis:reset:127.0.0.1"), 1);

            const succeeded = await post(false);
            assert.equal(succeeded.status, 200);
            assert.equal(succeeded.headers.get("RateLimit-Remaining"), "2");
            assert.equal(counts.size, 0);

            assert.equal((await post(true)).status, 400);
            assert.equal((await post(true)).status, 400);
            assert.equal((await post(false)).status, 429);
        }
    );
});

test("auth login and forgot-password limiters enforce per-(IP + account) failure lockouts, 200 resets, and per-IP ceilings", async () => {
    Object.assign(process.env, {
        MONGO_URI: "mongodb://127.0.0.1/rate-limit-test",
        JWT_SECRET: "rate-limit-test-secret",
        REDIS_HOST: "127.0.0.1",
        REDIS_PORT: "6379",
        REDIS_PASSWORD: "test",
        AUDIT_SIGNING_KEY: "rate-limit-test-audit-key-at-least-32-bytes",
    });
    const { loginRateLimiter, forgotPasswordRateLimiter } = await import("./rate-limit.middleware.js");

    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());
    app.post("/login", loginRateLimiter, (req, res) => {
        if (req.body?.password === "secret") return res.status(200).json({ ok: true });
        return res.status(400).json({ ok: false });
    });
    app.post("/forgot", forgotPasswordRateLimiter, (_req, res) => res.json({ ok: true }));
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    try {
        const base = `http://127.0.0.1:${port}`;
        const loginAs = (ip, body) => fetch(`${base}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
            body: JSON.stringify(body),
        });

        // 4 failed attempts followed by a 200 login should clear the failure counter.
        for (let i = 0; i < 4; i++) {
            assert.equal((await loginAs("203.0.113.10", { email: "alice@example.test", password: "wrong" })).status, 400);
        }
        const recovered = await loginAs("203.0.113.10", { email: "alice@example.test", password: "secret" });
        assert.equal(recovered.status, 200);
        assert.equal(recovered.headers.get("RateLimit-Remaining"), "5");

        // Normal repeated 200 logins on the same IP + account never trip the 5-failure lockout.
        for (let i = 0; i < 7; i++) {
            assert.equal((await loginAs("203.0.113.10", { email: "alice@example.test", password: "secret" })).status, 200);
        }

        // 5 consecutive failures are permitted by middleware (handler returns 400), and the 6th is blocked with 429.
        for (let i = 0; i < 5; i++) {
            assert.equal((await loginAs("203.0.113.10", { email: "alice@example.test", password: "wrong" })).status, 400);
        }
        const blockedAlice = await loginAs("203.0.113.10", { email: "alice@example.test", password: "wrong" });
        assert.equal(blockedAlice.status, 429);

        // Another account on the same IP and the same account from a different IP are still allowed.
        const bobRes = await loginAs("203.0.113.10", { email: "bob@example.test", password: "secret" });
        assert.equal(bobRes.status, 200);
        const aliceOtherIp = await loginAs("203.0.113.11", { email: "alice@example.test", password: "secret" });
        assert.equal(aliceOtherIp.status, 200);

        // Broader per-IP ceiling remains 30 attempts per 15 minutes across distinct accounts.
        for (let i = 0; i < 30; i++) {
            assert.equal((await loginAs("203.0.113.50", { email: `spray-${i}@example.test`, password: "wrong" })).status, 400);
        }
        const blockedIp = await loginAs("203.0.113.50", { email: "spray-31@example.test", password: "wrong" });
        assert.equal(blockedIp.status, 429);

        for (let i = 0; i < 3; i++) {
            const res = await fetch(`${base}/forgot`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Forwarded-For": `203.0.113.${20 + i}` },
                body: JSON.stringify({ username: "target-admin" }),
            });
            assert.equal(res.status, 200);
        }
        const blockedForgot = await fetch(`${base}/forgot`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.29" },
            body: JSON.stringify({ username: "target-admin" }),
        });
        assert.equal(blockedForgot.status, 429);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
});
