import test from "node:test";
import assert from "node:assert/strict";
import { createGracefulShutdown } from "./graceful-shutdown.js";

test("gracefulShutdown closes workers/server before Mongoose and Redis and ignores duplicate signals", async () => {
    const order = [];
    const exits = [];
    const shutdown = createGracefulShutdown({
        server: {
            listening: true,
            closeIdleConnections() { order.push("idle"); },
            close(cb) { order.push("http"); cb(); },
        },
        getIO: () => ({ close(cb) { order.push("io"); cb(); } }),
        closeNotificationWorker: async () => { order.push("notif"); },
        closeCreditReconciliationWorker: async () => { order.push("recon"); },
        closeCampaignWorker: async () => { order.push("campaignWorker"); },
        campaignQueue: { async close() { order.push("campaignQueue"); } },
        mongooseConnection: { readyState: 1, async close() { order.push("mongo"); } },
        redisClient: { status: "ready", async quit() { order.push("redis"); } },
        exit: (code) => exits.push(code),
        logger: { log() {}, error() {} },
    });

    await Promise.all([shutdown("SIGTERM"), shutdown("SIGINT")]);

    assert.deepEqual(exits, [0]);
    assert.ok(order.indexOf("http") < order.indexOf("mongo"));
    assert.ok(order.indexOf("campaignWorker") < order.indexOf("redis"));
    assert.equal(order.filter(item => item === "mongo").length, 1);
});

test("gracefulShutdown disconnects Redis if quit throws and exits cleanly when shutdown succeeds", async () => {
    let disconnected = false;
    const exits = [];
    const shutdown = createGracefulShutdown({
        server: { listening: false },
        mongooseConnection: { readyState: 0, async close() { assert.fail("Should not close disconnected Mongo"); } },
        redisClient: {
            status: "connecting",
            async quit() { throw new Error("Not connected"); },
            disconnect() { disconnected = true; },
        },
        exit: (code) => exits.push(code),
        logger: { log() {}, error() {} },
    });

    await shutdown("SIGINT");
    assert.equal(disconnected, true);
    assert.deepEqual(exits, [0]);
});
