import test from "node:test";
import assert from "node:assert/strict";

Object.assign(process.env, {
  MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:1/unused",
  JWT_SECRET: process.env.JWT_SECRET || "test-jwt-secret",
  REDIS_HOST: process.env.REDIS_HOST || "127.0.0.1",
  REDIS_PORT: process.env.REDIS_PORT || "6379",
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || "test-only",
  DOTENV_CONFIG_QUIET: "true",
});

const { Types } = await import("mongoose");
const { default: ReviewPin } = await import("../models/reviewPin.model.js");
const { resolvePin, deletePin } = await import("./reviewPin.controller.js");

const pinId = new Types.ObjectId().toString();
const userId = new Types.ObjectId();
const tenantId = new Types.ObjectId();
const request = (overrides = {}) => ({
    params: { id: pinId },
    user: { _id: userId, role: "User", resellerId: tenantId },
    body: { resolvedByName: "  Alex Reviewer  " },
    ...overrides,
});
const response = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
});

test("an owner can retry deletion after the pin is gone", async t => {
    let pin = { _id: pinId, page: "/user" };
    t.mock.method(ReviewPin, "findOneAndDelete", async filter => {
        assert.deepEqual(filter, { _id: pinId, createdByUserId: userId });
        const deleted = pin;
        pin = null;
        return deleted;
    });
    t.mock.method(ReviewPin, "exists", async () => null);
    for (const message of ["Pin deleted.", "Pin already deleted."]) {
        const res = response();
        await deletePin(request(), res);
        assert.equal(res.statusCode, 200);
        assert.deepEqual(res.body, { success: true, message });
    }
});

test("an existing pin owned by another user cannot be deleted", async t => {
    t.mock.method(ReviewPin, "findOneAndDelete", async filter => {
        assert.deepEqual(filter, { _id: pinId, createdByUserId: userId });
        return null;
    });
    t.mock.method(ReviewPin, "exists", async () => ({ _id: pinId }));
    const res = response();
    await deletePin(request(), res);
    assert.equal(res.statusCode, 403);
});

test("resolution records a trimmed name, authenticated user and server date/time", async t => {
    const res = response();
    const before = Date.now();
    t.mock.method(ReviewPin, "findOneAndUpdate", async (query, update, options) => {
        assert.equal(query._id, pinId);
        assert.equal(query.tenantId, tenantId);
        assert.deepEqual(query.status, { $ne: "resolved" });
        assert.equal(update.$set.resolvedByName, "Alex Reviewer");
        assert.equal(update.$set.resolvedByUserId, userId);
        assert(update.$set.resolvedAt instanceof Date);
        assert(update.$set.resolvedAt.getTime() >= before);
        assert.deepEqual(options, { new: true, runValidators: true });
        return { _id: pinId, ...update.$set };
    });
    await resolvePin(request({ body: { resolvedByName: "  Alex Reviewer  ", resolvedByUserId: "spoofed", resolvedAt: "2000-01-01" } }), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.pin.status, "resolved");
});

test("invalid IDs and blank, non-text or oversized names are rejected before database access", async t => {
    t.mock.method(ReviewPin, "findOneAndUpdate", () => assert.fail("Unexpected database access"));
    for (const req of [
        request({ params: { id: "invalid" } }),
        ...["", "   ", {}, "x".repeat(121)].map(resolvedByName => request({ body: { resolvedByName } })),
    ]) {
        const res = response();
        await resolvePin(req, res);
        assert.equal(res.statusCode, 400);
    }
});

test("a different tenant cannot resolve or read the pin", async t => {
    const res = response();
    t.mock.method(ReviewPin, "findOneAndUpdate", async query => {
        assert.equal(query.tenantId, tenantId);
        return null;
    });
    t.mock.method(ReviewPin, "findOne", async scope => {
        assert.deepEqual(scope, { _id: pinId, tenantId });
        return null;
    });
    await resolvePin(request(), res);
    assert.equal(res.statusCode, 404);
});

test("Super Admin can resolve any visible pin without a tenant filter", async t => {
    const res = response();
    t.mock.method(ReviewPin, "findOneAndUpdate", async (query, update) => {
        assert.equal(Object.hasOwn(query, "tenantId"), false);
        return { _id: pinId, ...update.$set };
    });
    await resolvePin(request({ user: { _id: userId, role: "Super Admin" } }), res);
    assert.equal(res.statusCode, 200);
});

test("resellers are scoped to their own tenant", async t => {
    const res = response();
    t.mock.method(ReviewPin, "findOneAndUpdate", async (query, update) => {
        assert.equal(query.tenantId, userId);
        return { _id: pinId, ...update.$set };
    });
    await resolvePin(request({ user: { _id: userId, role: "Reseller" } }), res);
    assert.equal(res.statusCode, 200);
});

test("repeated or concurrent resolution preserves the original resolver and timestamp", async t => {
    const first = { _id: pinId, status: "resolved", resolvedByName: "Original reviewer", resolvedAt: new Date("2026-11-17T06:15:00Z") };
    const res = response();
    t.mock.method(ReviewPin, "findOneAndUpdate", async query => {
        assert.deepEqual(query.status, { $ne: "resolved" });
        return null;
    });
    t.mock.method(ReviewPin, "findOne", async () => first);
    await resolvePin(request(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.pin, first);
});

test("database failures return a retryable error without claiming success", async t => {
    const res = response();
    t.mock.method(console, "error", () => {});
    t.mock.method(ReviewPin, "findOneAndUpdate", async () => { throw new Error("Database unavailable"); });
    await resolvePin(request(), res);
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
});
