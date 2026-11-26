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

test("uses ready Redis client for counting and falls back to memory if Redis errors", async () => {
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
});

test("auth login and forgot-password limiters enforce per-account and per-IP ceilings", async () => {
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
    app.post("/login", loginRateLimiter, (_req, res) => res.json({ ok: true }));
    app.post("/forgot", forgotPasswordRateLimiter, (_req, res) => res.json({ ok: true }));
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();

    try {
        const base = `http://127.0.0.1:${port}`;
        for (let i = 0; i < 10; i++) {
            const res = await fetch(`${base}/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.10" },
                body: JSON.stringify({ email: "alice@example.test", password: "wrong" }),
            });
            assert.equal(res.status, 200);
        }
        const blockedAlice = await fetch(`${base}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.10" },
            body: JSON.stringify({ email: "alice@example.test", password: "wrong" }),
        });
        assert.equal(blockedAlice.status, 429);

        const bobRes = await fetch(`${base}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.10" },
            body: JSON.stringify({ email: "bob@example.test", password: "wrong" }),
        });
        assert.equal(bobRes.status, 200);

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
