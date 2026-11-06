import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
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
import Workflow from "./src/models/campaign-workflow.model.js";
import Chunks from "./src/models/campaignSpreadsheet.model.js";
import Session from "./src/models/session.model.js";
import { AuditEvent, AuditHead } from "./src/models/audit.model.js";
import { NotificationEvent } from "./src/models/notification.model.js";
import { appendAudit, verifyAuditStream, validAuditHash, redactAudit, auditContext, auditRequestContext, auditAuthenticatedRequest } from "./src/services/audit.service.js";
import { runCampaignWorkflow, acceptCampaignCompletion } from "./src/services/campaign-workflow.service.js";
import { normalizeProviderResults, verifyProviderSignature, dispatchToProvider } from "./src/helpers/campaign-provider.js";
import webhookRouter from "./src/routes/campaign-webhook.routes.js";

let replica;
before(async () => {
    process.env.AUDIT_SIGNING_KEY = "isolated-test-audit-key-at-least-32-bytes";
    process.env.CAMPAIGN_WORKFLOW_ENABLED = "true";
    process.env.CAMPAIGN_PROVIDER_URL = "https://sender.example.test/campaigns";
    process.env.CAMPAIGN_PROVIDER_TOKEN = "test-only-provider-token";
    process.env.CAMPAIGN_CALLBACK_URL = "https://app.example.test/api/webhooks/campaigns/completion";
    process.env.CAMPAIGN_WEBHOOK_SECRET = "isolated-test-webhook-key-at-least-32-bytes";
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    await mongoose.connect(replica.getUri(), { dbName: "enterprise_isolated_test" });
    process.env.MONGO_URI = replica.getUri(); process.env.JWT_SECRET = "isolated-test-jwt-secret";
    process.env.REDIS_HOST = "127.0.0.1"; process.env.REDIS_PORT = "6379"; process.env.REDIS_PASSWORD = "unused-in-tests";
    await Promise.all([Campaign, User, Wallet, Transaction, Workflow, Chunks, AuditEvent, AuditHead, NotificationEvent, Session].map((model) => model.init()));
});
after(async () => { await mongoose.disconnect(); if (replica) await replica.stop(); });

async function fixture() {
    const user = await User.create({ username: "Workflow User", email: `${randomUUID()}@example.test`, password: "TestPassword123!", role: "User", ratePerMsg: 2 });
    const session = await mongoose.startSession();
    let campaign;
    try {
        await session.withTransaction(async () => {
            await Wallet.create([{ userId: user._id, balance: 100 }], { session });
            await Transaction.create([{ type: "ALLOCATE", amount: 100, toUser: user._id, performedBy: user._id, balanceAfterTo: 100 }], { session });
            const wallet = await Wallet.findOneAndUpdate({ userId: user._id }, { $inc: { balance: -6 } }, { returnDocument: "after", session });
            [campaign] = await Campaign.create([{
                userId: user._id, campaignTitle: "Durable delivery", messageBody: "Hello",
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
        completion: async () => ({ campaignId: String(campaign._id), dispatchKey: (await Workflow.findById(campaign._id)).dispatchKey, jobId: "provider-job-1", results: [{ rowNumber: 1, status: "read" }, { rowNumber: 2, status: "failed" }] }),
    };
}
const makeDue = (id) => Workflow.updateOne({ _id: id }, { $set: { nextRunAt: new Date(0) } });

test("audit signatures detect edits and redact credentials even inside arrays", () => {
    const value = redactAudit({ password: "secret", tokenHash: "secret", details: [{ password: "secret", amount: 2 }] });
    assert.equal(value.password, "[redacted]");
    assert.equal(value.tokenHash, "[redacted]");
    assert.equal(value.details.count, 1);
    assert.ok(!JSON.stringify(value).includes('"secret"'));
});

test("model audit captures actor, IP, expiry changes and a verifiable chain", async () => {
    const f = await fixture();
    const req = { user: { _id: f.user._id, role: "Reseller", username: "Manager" }, originalAdmin: "original-admin", isImpersonation: true, auditRequestId: "request-123", method: "PATCH", originalUrl: "/api/users/example?token=do-not-record", ip: "192.0.2.10", get: () => "test-agent" };
    await auditContext.run({ req }, async () => {
        const user = await User.findById(f.user._id);
        user.expiresAt = new Date("2030-01-01"); user.username = "Changed name";
        await user.save();
    });
    const event = await AuditEvent.findOne({ stream: `user:${f.user._id}`, action: "user.updated" }).lean();
    assert.equal(event.actor.role, "Reseller");
    assert.equal(event.actor.originalAdmin, "original-admin");
    assert.equal(event.request.ip, "192.0.2.10");
    assert.equal(event.request.path, "/api/users/example");
    assert.equal(event.data.before.username, "Workflow User");
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

test("pending approval cannot dispatch and approval leaves a durable outbox without Redis", async () => {
    const f = await fixture();
    assert.equal((await Workflow.findById(f.campaign._id)).stage, "pending_approval");
    await runCampaignWorkflow(f.campaign._id, () => assert.fail("pending must not dispatch"));
    assert.equal(await f.balance(), 94);
    await f.approve();
    assert.equal((await Workflow.findById(f.campaign._id)).stage, "ready");
    assert.equal(await f.balance(), 94);
});

test("future schedules survive recovery, rescheduling, and a stale immediate job", async () => {
    const f = await fixture();
    let campaign = await Campaign.findById(f.campaign._id);
    campaign.schedule = "later"; campaign.scheduledTime = new Date(Date.now() + 3600000);
    await campaign.save(); await f.approve();
    assert.ok((await Workflow.findById(campaign._id)).nextRunAt > new Date());
    await runCampaignWorkflow(campaign._id, () => assert.fail("future campaign must not dispatch"));
    await makeDue(campaign._id); // A stale BullMQ job must still recheck the schedule.
    assert.equal((await runCampaignWorkflow(campaign._id, () => assert.fail("stale job"))).scheduled, true);
    campaign = await Campaign.findById(campaign._id);
    campaign.scheduledTime = new Date(Date.now() + 7200000); await campaign.save();
    assert.equal((await Workflow.findById(campaign._id)).nextRunAt.getTime(), campaign.scheduledTime.getTime());
    campaign.status = "paused"; await campaign.save();
    assert.equal((await Workflow.findById(campaign._id)).stage, "pending_approval");
});

test("a reservation mismatch stops dispatch without moving credits", async () => {
    const f = await fixture(); await f.approve();
    const campaign = await Campaign.findById(f.campaign._id); campaign.creditsDeducted = 8; await campaign.save();
    await assert.rejects(runCampaignWorkflow(campaign._id, () => assert.fail("invalid reservation")), /does not reconcile/);
    assert.equal(await f.balance(), 94);
});

test("query updates and account deletion produce transactional audit events", async () => {
    const user = await User.create({ username: "Delete me", email: `${randomUUID()}@example.test`, password: "TestPassword123!", role: "User" });
    await User.updateOne({ _id: user._id }, { $set: { expiresAt: new Date("2031-01-01") } });
    await user.deleteOne();
    const events = await AuditEvent.find({ stream: `user:${user._id}` }).sort({ sequence: 1 }).lean();
    assert.deepEqual(events.map((event) => event.action), ["user.created", "user.updated", "user.deleted"]);
    assert.equal((await verifyAuditStream(`user:${user._id}`)).valid, true);
});

test("dispatch retries after an ambiguous network failure reuse the same provider key", async () => {
    const f = await fixture(); await f.approve();
    const keys = [];
    await assert.rejects(runCampaignWorkflow(f.campaign._id, async (_campaign, workflow) => { keys.push(workflow.dispatchKey); throw new Error("Network connection lost after provider accepted"); }), /Network/);
    assert.equal((await Workflow.findById(f.campaign._id)).stage, "ready");
    await makeDue(f.campaign._id);
    await runCampaignWorkflow(f.campaign._id, async (_campaign, workflow) => { keys.push(workflow.dispatchKey); return "provider-job-1"; });
    assert.equal(keys[0], keys[1]);
    assert.equal((await Workflow.findById(f.campaign._id)).stage, "waiting_webhook");
    assert.equal(await f.balance(), 94);
    await assert.rejects(Campaign.findByIdAndUpdate(f.campaign._id, { status: "failed" }), /in progress/);
});

test("expired worker leases resume while live leases prevent concurrent dispatch", async () => {
    const f = await fixture(); await f.approve();
    await Workflow.updateOne({ _id: f.campaign._id }, { $set: { lease: "dead-worker", leaseUntil: new Date(Date.now() + 60000) } });
    assert.equal((await runCampaignWorkflow(f.campaign._id, () => assert.fail("live lease"))).skipped, true);
    await Workflow.updateOne({ _id: f.campaign._id }, { $set: { leaseUntil: new Date(0) } });
    await runCampaignWorkflow(f.campaign._id, async () => "provider-job-1");
    assert.equal((await Workflow.findById(f.campaign._id)).stage, "waiting_webhook");
});

test("a lost dispatch response still accepts completion and blocks premature cancellation", async () => {
    const f = await fixture(); await f.approve();
    await assert.rejects(runCampaignWorkflow(f.campaign._id, async () => { throw new Error("Lost response"); }), /Lost response/);
    const workflow = await Workflow.findById(f.campaign._id);
    assert.ok(workflow.dispatchStartedAt);
    assert.equal(workflow.lease, undefined);
    await assert.rejects(Campaign.findByIdAndUpdate(f.campaign._id, { status: "failed" }), /in progress/);
    assert.equal((await acceptCampaignCompletion(await f.completion())).accepted, true);
    await runCampaignWorkflow(f.campaign._id);
    assert.equal((await Workflow.findById(f.campaign._id)).stage, "completed");
    assert.equal(await f.balance(), 98);
});

test("completion rejects missing, duplicate, foreign, and non-terminal rows", async () => {
    const f = await fixture();
    for (const results of [[], [{ rowNumber: 1, status: "read" }, { rowNumber: 1, status: "failed" }], [{ rowNumber: 1, status: "queued" }, { rowNumber: 2, status: "failed" }], [{ rowNumber: 1, status: "read" }, { rowNumber: 999, status: "failed" }]]) {
        assert.throws(() => normalizeProviderResults(f.campaign, results), /Completion/);
    }
});

test("webhook completion, refund, and publication survive rollback and replay exactly once", async () => {
    const f = await fixture(); await f.approve();
    await runCampaignWorkflow(f.campaign._id, async () => "provider-job-1");
    const payload = await f.completion();
    const accepted = await Promise.all([acceptCampaignCompletion(payload), acceptCampaignCompletion(payload)]);
    assert.equal(accepted.filter((item) => item.duplicate).length, 1);
    await assert.rejects(acceptCampaignCompletion({ ...payload, results: [{ rowNumber: 1, status: "failed" }, { rowNumber: 2, status: "failed" }] }), /different completion/);
    const originalSave = Campaign.prototype.save;
    Campaign.prototype.save = async function (...args) { if (this.status === "completed") throw new Error("Simulated crash before report commit"); return originalSave.apply(this, args); };
    try { await assert.rejects(runCampaignWorkflow(f.campaign._id), /Simulated crash/); }
    finally { Campaign.prototype.save = originalSave; }
    assert.equal(await f.balance(), 94);
    assert.equal(await Transaction.countDocuments({ campaignId: f.campaign._id, type: "REFUND" }), 0);
    assert.equal((await Campaign.findById(f.campaign._id)).publishedSpreadsheet, null);
    assert.equal((await Workflow.findById(f.campaign._id)).stage, "settling");
    await makeDue(f.campaign._id);
    const result = await runCampaignWorkflow(f.campaign._id);
    assert.equal(result.refund, 4); // Failed recipient + the repeated entry.
    assert.equal(await f.balance(), 98);
    assert.equal((await Workflow.findById(f.campaign._id)).stage, "completed");
    assert.ok((await Campaign.findById(f.campaign._id)).publishedSpreadsheet.publishedAt);
    assert.equal(await Transaction.countDocuments({ campaignId: f.campaign._id, type: "REFUND" }), 1);
    assert.equal((await runCampaignWorkflow(f.campaign._id)).skipped, true);
    assert.equal((await acceptCampaignCompletion(payload)).duplicate, true);
    assert.equal((await verifyAuditStream(`campaign:${f.campaign._id}`)).valid, true);
});

test("a completion arriving before the provider response is not overwritten", async () => {
    const f = await fixture(); await f.approve();
    await runCampaignWorkflow(f.campaign._id, async () => { await acceptCampaignCompletion(await f.completion()); return "provider-job-1"; });
    assert.equal((await Workflow.findById(f.campaign._id)).stage, "settling");
    await runCampaignWorkflow(f.campaign._id);
    assert.equal((await Workflow.findById(f.campaign._id)).stage, "completed");
});

test("webhook HMAC requires the exact body and a recent timestamp", () => {
    const body = Buffer.from('{"test":true}');
    const now = Date.now(), timestamp = String(Math.floor(now / 1000));
    const secret = process.env.CAMPAIGN_WEBHOOK_SECRET;
    const signature = createHmac("sha256", secret).update(`${timestamp}.`).update(body).digest("hex");
    assert.equal(verifyProviderSignature(body, timestamp, signature, secret, now), true);
    assert.equal(verifyProviderSignature(Buffer.from('{}'), timestamp, signature, secret, now), false);
    assert.equal(verifyProviderSignature(body, timestamp, signature, secret, now + 301000), false);
    assert.equal(verifyProviderSignature(body, timestamp, "bad", secret, now), false);
});

test("provider dispatch uses HTTPS, stable idempotency, and original unique row IDs", async () => {
    const f = await fixture(); const workflow = await Workflow.findById(f.campaign._id);
    const originalFetch = globalThis.fetch;
    let request;
    globalThis.fetch = async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ jobId: "test-provider-job" }) }; };
    try {
        assert.equal(await dispatchToProvider(f.campaign, workflow), "test-provider-job");
        assert.equal(request.options.headers["Idempotency-Key"], workflow.dispatchKey);
        assert.equal(request.options.redirect, "error");
        const payload = JSON.parse(request.options.body);
        assert.deepEqual(payload.recipients.map((row) => row.rowNumber), [1, 2]);
        assert.equal(payload.callbackUrl, process.env.CAMPAIGN_CALLBACK_URL);
        const endpoint = process.env.CAMPAIGN_PROVIDER_URL;
        process.env.CAMPAIGN_PROVIDER_URL = "http://sender.example.test";
        try { await assert.rejects(dispatchToProvider(f.campaign, workflow), /HTTPS/); }
        finally { process.env.CAMPAIGN_PROVIDER_URL = endpoint; }
    } finally { globalThis.fetch = originalFetch; }
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
        const response = await fetch(root + "?limit=2", { headers: { Authorization: `Bearer ${await tokenFor("Super Admin")}` } });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).items.length, 2);
    } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("HTTP mutation responses wait for durable audit outcomes and unsigned webhooks are rejected", async () => {
    const app = express(); app.use(auditRequestContext);
    app.use("/webhook", webhookRouter);
    app.use(express.json());
    app.post("/action", (req, _res, next) => { req.user = { _id: new mongoose.Types.ObjectId(), role: "Super Admin" }; next(); }, auditAuthenticatedRequest, (_req, res) => res.json({ success: true }));
    const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    try {
        const root = `http://127.0.0.1:${server.address().port}`;
        const response = await fetch(root + "/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "never-store-this", amount: 4 }) });
        assert.equal(response.status, 200);
        const events = await AuditEvent.find({ stream: `request:${response.headers.get("x-request-id")}` }).sort({ sequence: 1 }).lean();
        assert.deepEqual(events.map((event) => event.action), ["request.started", "request.finished"]);
        assert.equal(events[0].data.input.password, "[redacted]");
        assert.equal(events[1].data.outcome, "success");
        assert.equal((await fetch(root + "/webhook/completion", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 401);
        const f = await fixture(); await f.approve(); await runCampaignWorkflow(f.campaign._id, async () => "provider-job-1");
        const payload = JSON.stringify(await f.completion()), timestamp = String(Math.floor(Date.now() / 1000));
        const signature = createHmac("sha256", process.env.CAMPAIGN_WEBHOOK_SECRET).update(`${timestamp}.${payload}`).digest("hex");
        const headers = { "Content-Type": "application/json", "X-Campaign-Timestamp": timestamp, "X-Campaign-Signature": signature };
        assert.equal((await fetch(root + "/webhook/completion", { method: "POST", headers, body: payload })).status, 202);
        assert.equal((await fetch(root + "/webhook/completion", { method: "POST", headers, body: payload })).status, 202);
        assert.equal((await Workflow.findById(f.campaign._id)).stage, "settling");
    } finally { await new Promise((resolve) => server.close(resolve)); }
});
