import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createHash } from "node:crypto";
import jwt from "jsonwebtoken";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Campaign from "./src/models/campaign.model.js";
import User from "./src/models/user.model.js";
import Wallet from "./src/models/wallet.model.js";
import Transaction from "./src/models/transaction.model.js";
import Session from "./src/models/session.model.js";
import { AuditEvent, AuditHead } from "./src/models/audit.model.js";
import { NotificationEvent } from "./src/models/notification.model.js";
import { appendAudit, verifyAuditStream, validAuditHash, redactAudit, auditContext, auditRequestContext, auditAuthenticatedRequest } from "./src/services/audit.service.js";

let replica;
before(async () => {
    process.env.AUDIT_SIGNING_KEY = "isolated-test-audit-key-at-least-32-bytes";
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    await mongoose.connect(replica.getUri(), { dbName: "enterprise_isolated_test" });
    process.env.MONGO_URI = replica.getUri(); process.env.JWT_SECRET = "isolated-test-jwt-secret";
    process.env.REDIS_HOST = "127.0.0.1"; process.env.REDIS_PORT = "6379"; process.env.REDIS_PASSWORD = "unused-in-tests";
    await Promise.all([Campaign, User, Wallet, Transaction, AuditEvent, AuditHead, NotificationEvent, Session].map((model) => model.init()));
});
after(async () => { await mongoose.disconnect(); if (replica) await replica.stop(); });

async function fixture() {
    const user = await User.create({ username: "Client user", email: `${randomUUID()}@example.test`, password: "TestPassword123!", role: "User", ratePerMsg: 2 });
    const session = await mongoose.startSession();
    let campaign;
    try {
        await session.withTransaction(async () => {
            await Wallet.create([{ userId: user._id, balance: 100 }], { session });
            await Transaction.create([{ type: "ALLOCATE", amount: 100, toUser: user._id, performedBy: user._id, balanceAfterTo: 100 }], { session });
            const wallet = await Wallet.findOneAndUpdate({ userId: user._id }, { $inc: { balance: -6 } }, { returnDocument: "after", session });
            [campaign] = await Campaign.create([{
                userId: user._id, campaignTitle: "Manual campaign record", messageBody: "Hello",
                originalRecipients: ["919876543210", "919876543211", "919876543210"],
                recipients: [{ phoneNumber: "919876543210" }, { phoneNumber: "919876543211" }],
                totalRecipients: 3, creditsDeducted: 6, rateSnapshot: 2, status: "pending",
            }], { session });
            await Transaction.create([{ campaignId: campaign._id, type: "DEDUCT", amount: 6, fromUser: user._id, toUser: user._id, performedBy: user._id, balanceAfterFrom: wallet.balance, balanceAfterTo: wallet.balance }], { session });
        });
    } finally { await session.endSession(); }
    return { user, campaign,
        approve: async () => { const live = await Campaign.findById(campaign._id); live.status = "ongoing"; await live.save(); },
        balance: async () => (await Wallet.findOne({ userId: user._id })).balance,
    };
}

test("audit signatures detect edits and redact credentials even inside arrays", () => {
    const value = redactAudit({ password: "secret", tokenHash: "secret", details: [{ password: "secret", amount: 2 }] });
    assert.equal(value.password, "[redacted]");
    assert.equal(value.tokenHash, "[redacted]");
    assert.equal(value.details.count, 1);
    assert.ok(!JSON.stringify(value).includes('"secret"'));
});

test("model audit captures actor, IP, expiry changes and a verifiable chain", async () => {
    const f = await fixture();
    const req = { user: { _id: f.user._id, role: "Reseller", username: "Manager" }, originalAdmin: { id: "original-admin", token: "never-store-the-preview-token" }, isImpersonation: true, auditRequestId: "request-123", method: "PATCH", originalUrl: "/api/users/example?token=do-not-record", ip: "192.0.2.10", get: () => "test-agent" };
    await auditContext.run({ req }, async () => {
        const user = await User.findById(f.user._id);
        user.expiresAt = new Date("2030-01-01"); user.username = "Changed name";
        await user.save();
    });
    const event = await AuditEvent.findOne({ stream: `user:${f.user._id}`, action: "user.updated" }).lean();
    assert.equal(event.actor.role, "Reseller");
    assert.equal(event.actor.originalAdmin.id, "original-admin");
    assert.equal(event.actor.originalAdmin.token, "[redacted]");
    assert.equal(event.request.ip, "192.0.2.10");
    assert.equal(event.request.path, "/api/users/example");
    assert.equal(event.data.before.username, "Client user");
    assert.equal(event.data.after.username, "Changed name");
    assert.equal(event.data.after.expiresAt, "2030-01-01T00:00:00.000Z");
    assert.equal(event.data.after.password, undefined); // Passwords are excluded from user queries.
    const created = await AuditEvent.findOne({ stream: `user:${f.user._id}`, action: "user.created" }).lean();
    assert.equal(created.data.after.password, "[redacted]");
    assert.equal(validAuditHash(event), true);
    assert.equal((await verifyAuditStream(`user:${f.user._id}`)).valid, true);
    assert.equal(validAuditHash({ ...event, action: "forged" }), false);
});

test("audit records reject changes, deletion, and bulk writes", async () => {
    await appendAudit({ stream: "test:immutable", action: "test.created", data: { value: 1 } });
    const event = await AuditEvent.findOne({ stream: "test:immutable" });
    event.action = "forged";
    await assert.rejects(event.save(), /append-only/);
    await assert.rejects(AuditEvent.updateOne({ _id: event._id }, { action: "forged" }), /cannot be updated/);
    await assert.rejects(AuditEvent.deleteMany({ stream: "test:immutable" }), /cannot be updated/);
    await assert.rejects(event.deleteOne(), /cannot be/);
    await assert.rejects(AuditEvent.bulkWrite([{ deleteOne: { filter: { _id: event._id } } }]), /cannot be updated/);
});

test("verification detects a deleted tail even when the remaining events are valid", async () => {
    await appendAudit({ stream: "test:truncated", action: "one" });
    await appendAudit({ stream: "test:truncated", action: "two" });
    assert.equal((await verifyAuditStream("test:truncated")).valid, true);
    // Deliberate raw database tampering in the isolated test database only.
    await AuditEvent.collection.deleteOne({ stream: "test:truncated", sequence: 2 });
    assert.equal((await verifyAuditStream("test:truncated")).valid, false);
});

test("an aborted wallet operation leaves neither financial nor audit changes", async () => {
    const f = await fixture();
    const before = await AuditEvent.countDocuments({ stream: `wallet:${(await Wallet.findOne({ userId: f.user._id }))._id}` });
    const session = await mongoose.startSession(); session.startTransaction();
    try {
        await Wallet.findOneAndUpdate({ userId: f.user._id }, { $inc: { balance: 10 } }, { returnDocument: "after", session });
        await session.abortTransaction();
    } finally { await session.endSession(); }
    assert.equal(await f.balance(), 94);
    assert.equal(await AuditEvent.countDocuments({ stream: `wallet:${(await Wallet.findOne({ userId: f.user._id }))._id}` }), before);
});

test("query updates and account deletion produce transactional audit events", async () => {
    const user = await User.create({ username: "Delete me", email: `${randomUUID()}@example.test`, password: "TestPassword123!", role: "User" });
    await User.updateOne({ _id: user._id }, { $set: { expiresAt: new Date("2031-01-01") } });
    await user.deleteOne();
    const events = await AuditEvent.find({ stream: `user:${user._id}` }).sort({ sequence: 1 }).lean();
    assert.deepEqual(events.map((event) => event.action), ["user.created", "user.updated", "user.deleted"]);
    assert.equal((await verifyAuditStream(`user:${user._id}`)).valid, true);
});

test("manual campaign decisions persist without creating automatic refunds", async () => {
    const f = await fixture();
    await f.approve();
    let campaign = await Campaign.findById(f.campaign._id);
    assert.equal(campaign.status, "ongoing");
    campaign.status = "failed"; await campaign.save();
    campaign = await Campaign.findById(f.campaign._id);
    assert.equal(campaign.status, "failed");
    assert.equal(campaign.publishedSpreadsheet, null);
    assert.equal(await f.balance(), 94);
    assert.equal(await Transaction.countDocuments({ campaignId: campaign._id, type: "REFUND" }), 0);
    assert.equal((await verifyAuditStream(`campaign:${campaign._id}`)).valid, true);
});

test("old audit signatures remain verifiable after configured key rotation", async () => {
    const oldKey = process.env.AUDIT_SIGNING_KEY, oldId = process.env.AUDIT_KEY_ID;
    const oldVerifyKeys = process.env.AUDIT_VERIFY_KEYS_JSON;
    await appendAudit({ stream: "test:rotation", action: "before.rotation" });
    try {
        process.env.AUDIT_VERIFY_KEYS_JSON = JSON.stringify({ [oldId || "v1"]: oldKey });
        process.env.AUDIT_KEY_ID = "v2"; process.env.AUDIT_SIGNING_KEY = "isolated-test-new-signing-key-32-bytes";
        await appendAudit({ stream: "test:rotation", action: "after.rotation" });
        assert.equal((await verifyAuditStream("test:rotation")).valid, true);
    } finally {
        process.env.AUDIT_SIGNING_KEY = oldKey;
        if (oldId === undefined) delete process.env.AUDIT_KEY_ID; else process.env.AUDIT_KEY_ID = oldId;
        if (oldVerifyKeys === undefined) delete process.env.AUDIT_VERIFY_KEYS_JSON; else process.env.AUDIT_VERIFY_KEYS_JSON = oldVerifyKeys;
    }
});

test("HTTP actions wait for an audit outcome and fail closed if signing is unavailable", async () => {
    const app = express(); app.use(auditRequestContext); app.use(express.json());
    let handled = 0;
    app.post("/action", (req, _res, next) => { req.user = { _id: new mongoose.Types.ObjectId(), role: "Super Admin" }; next(); }, auditAuthenticatedRequest, (_req, res) => { handled++; res.json({ success: true }); });
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
        const root = `http://127.0.0.1:${server.address().port}/action`;
        const response = await fetch(root, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "never-store-this", amount: 4 }) });
        assert.equal(response.status, 200);
        const events = await AuditEvent.find({ stream: `request:${response.headers.get("x-request-id")}` }).sort({ sequence: 1 }).lean();
        assert.deepEqual(events.map((event) => event.action), ["request.started", "request.finished"]);
        assert.equal(events[0].data.input.password, "[redacted]");
        assert.equal(events[1].data.outcome, "success");
        const signingKey = process.env.AUDIT_SIGNING_KEY;
        try {
            delete process.env.AUDIT_SIGNING_KEY;
            assert.equal((await fetch(root, { method: "POST" })).status, 503);
            assert.equal(handled, 1);
        } finally { process.env.AUDIT_SIGNING_KEY = signingKey; }
    } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("audit API requires super-admin access and rejects preview sessions", async () => {
    const { default: enterpriseRouter } = await import("./src/routes/enterprise.routes.js");
    const app = express(); app.use(auditRequestContext); app.use("/enterprise", enterpriseRouter);
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    async function tokenFor(role, preview = false) {
        const user = await User.create({ username: "Audit API test", email: `${randomUUID()}@example.test`, password: "TestPassword123!", role });
        const token = jwt.sign({ userId: String(user._id), isPreview: preview, jti: randomUUID() }, process.env.JWT_SECRET, { expiresIn: "1h" });
        await Session.create({ userId: user._id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) });
        return token;
    }
    try {
        const root = `http://127.0.0.1:${server.address().port}/enterprise/audit`;
        assert.equal((await fetch(root)).status, 401);
        for (const role of ["User", "Reseller"]) assert.equal((await fetch(root, { headers: { Authorization: `Bearer ${await tokenFor(role)}` } })).status, 403);
        assert.equal((await fetch(root, { headers: { Authorization: `Bearer ${await tokenFor("Super Admin", true)}` } })).status, 403);
        const adminHeaders = { Authorization: `Bearer ${await tokenFor("Super Admin")}` };
        const response = await fetch(root + "?limit=2", { headers: adminHeaders });
        assert.equal(response.status, 200);
        const page = await response.json();
        assert.equal(page.items.length, 2);
        assert.ok(page.items.every((item) => !item.action.startsWith("request.")));
        const older = await (await fetch(root + `?limit=2&before=${page.nextCursor}`, { headers: adminHeaders })).json();
        assert.ok(older.items.every((item) => !page.items.some((first) => first._id === item._id)));
        const literal = await (await fetch(root + "?search=" + encodeURIComponent(".*"), { headers: adminHeaders })).json();
        assert.equal(literal.items.length, 0);
    } finally { await new Promise((resolve) => server.close(resolve)); }
});
