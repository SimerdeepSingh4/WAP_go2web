import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import express from "express";
import jwt from "jsonwebtoken";

// These tests use only a temporary MongoDB and local HTTP server.
Object.assign(process.env, { MONGO_URI: "mongodb://127.0.0.1/media-limit-test", JWT_SECRET: "media-upload-limits-test-secret", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379", REDIS_PASSWORD: "test", AUDIT_SIGNING_KEY: "media-upload-test-audit-key-at-least-32-bytes" });
const { default: settingsRouter } = await import("../routes/settings.routes.js");
const { default: User } = await import("../models/user.model.js");
const { default: Session } = await import("../models/session.model.js");
const { default: Settings } = await import("../models/platformSettings.model.js");
const { AuditEvent, AuditHead } = await import("../models/audit.model.js");
const { NotificationEvent } = await import("../models/notification.model.js");
const { protect, authorizeRoles, blockInPreviewMode } = await import("../middlewares/auth.middleware.js");
const { updateAccountMediaUploadLimits } = await import("../controllers/media-upload-limits.controller.js");
const { uploadFiles } = await import("../middlewares/upload.middleware.js");

let mongo, server, origin;
const accounts = {}, tokens = {}, sessionIds = {};
before(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    // Existing unrelated white-label indexes are not needed by these fixtures.
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    await Promise.all([User.init(), Session.init(), Settings.init(), AuditHead.init(), AuditEvent.init(), NotificationEvent.init()]);
    for (const role of ["Super Admin", "Reseller", "User"]) {
        const account = { _id: new mongoose.Types.ObjectId(), username: role, email: `${role.replace(/ /g, "")}@example.test`, role, password: "test-only-password", status: "active", maxVideoSizeMB: 9 };
        await User.collection.insertOne(account);
        accounts[role] = account;
        const token = jwt.sign({ userId: String(account._id) }, process.env.JWT_SECRET);
        const session = await Session.create({ userId: account._id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) });
        sessionIds[role] = String(session._id);
        tokens[role] = token;
    }
    const app = express();
    app.use(express.json());
    app.use("/api/settings", settingsRouter);
    app.patch("/api/users/:id/media-limits", protect, authorizeRoles("Super Admin"), blockInPreviewMode("Upload limits"), updateAccountMediaUploadLimits);
    app.post("/api/test-upload", protect, uploadFiles, (req, res) => res.json({ success: true, size: Object.values(req.files).flat()[0].size }));
    server = createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await mongoose.disconnect();
    await mongo?.stop();
});

async function request(path, { role = "Super Admin", method = "GET", limits } = {}) {
    const response = await fetch(origin + path, { method, headers: { Cookie: `token=${tokens[role]}`, "Content-Type": "application/json", "X-Expected-Account": String(accounts[role]._id), "X-Expected-Session": sessionIds[role] }, body: limits === undefined ? undefined : JSON.stringify({ mediaUploadLimits: limits }) });
    return { status: response.status, body: await response.json() };
}
const endpoint = "/api/settings/media-limits";
const accountEndpoint = role => `/api/users/${accounts[role]._id}/media-limits`;

test("existing accounts with the old 9 MB video default receive 3 MB for every type", async () => {
    const response = await request(endpoint, { role: "User" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.effective, { imageMB: 3, videoMB: 3, pdfMB: 3 });
});

test("only Super Admin may change global or per-account limits", async () => {
    for (const role of ["User", "Reseller"]) {
        assert.equal((await request(endpoint, { role, method: "PUT", limits: { imageMB: 8, videoMB: 8, pdfMB: 8 } })).status, 403);
        assert.equal((await request(accountEndpoint("User"), { role, method: "PATCH", limits: { imageMB: 8 } })).status, 403);
    }
    assert.equal(await Settings.countDocuments(), 0);
});

test("platform defaults persist, overrides apply independently to users and resellers, and reset restores inheritance", async () => {
    assert.equal((await request(endpoint, { method: "PUT", limits: { imageMB: 4, videoMB: 5, pdfMB: 6 } })).status, 200);
    assert.equal((await Settings.findById("platform").lean()).mediaUploadLimits.videoMB, 5);
    for (const role of ["User", "Reseller"]) {
        assert.equal((await request(accountEndpoint(role), { method: "PATCH", limits: { imageMB: 2, videoMB: null, pdfMB: 7 } })).status, 200);
        assert.deepEqual((await request(endpoint, { role })).body.effective, { imageMB: 2, videoMB: 5, pdfMB: 7 });
    }
    await request(endpoint, { method: "PUT", limits: { imageMB: 8, videoMB: 9, pdfMB: 10 } });
    assert.deepEqual((await request(endpoint, { role: "User" })).body.effective, { imageMB: 2, videoMB: 9, pdfMB: 7 });
    assert.equal((await request(accountEndpoint("User"), { method: "PATCH", limits: { imageMB: null, videoMB: null, pdfMB: null } })).status, 200);
    assert.deepEqual((await request(endpoint, { role: "User" })).body.effective, { imageMB: 8, videoMB: 9, pdfMB: 10 });
});

test("invalid limits fail without changing persisted settings", async () => {
    assert.equal((await request(endpoint, { method: "PUT", limits: { imageMB: 0, videoMB: 5, pdfMB: 6 } })).status, 400);
    assert.equal((await request(accountEndpoint("User"), { method: "PATCH", limits: { videoMB: 101 } })).status, 400);
    assert.equal((await Settings.findById("platform").lean()).mediaUploadLimits.imageMB, 8);
    assert.equal((await User.findById(accounts.User._id)).mediaUploadLimits.videoMB, null);
});

test("multipart uploads enforce each effective limit, including aliases, with an inclusive boundary", async () => {
    await request(endpoint, { method: "PUT", limits: { imageMB: 3, videoMB: 3, pdfMB: 3 } });
    const mb = 1024 * 1024;
    async function upload(field, name, type, size, prefix = Buffer.from("%PDF-1.7\n")) {
        const data = Buffer.alloc(size); prefix.copy(data);
        const form = new FormData(); form.set(field, new Blob([data], { type }), name);
        const response = await fetch(origin + "/api/test-upload", { method: "POST", headers: { Cookie: `token=${tokens.User}`, "X-Expected-Account": String(accounts.User._id), "X-Expected-Session": sessionIds.User }, body: form, signal: AbortSignal.timeout(10000) });
        return { status: response.status, body: await response.json() };
    }
    for (const [field, name, type] of [["image", "image.png", "image/png"], ["video", "video.mp4", "video/mp4"], ["pdf", "report.pdf", "application/pdf"]]) {
        const response = await upload(field, name, type, 3 * mb + 1);
        assert.equal(response.status, 413, JSON.stringify(response));
        assert.equal(response.body.code, "LIMIT_FILE_SIZE");
    }
    assert.equal((await upload("documents", "report.pdf", "application/pdf", 3 * mb)).status, 200);
    await request(accountEndpoint("User"), { method: "PATCH", limits: { pdfMB: 4 } });
    assert.equal((await upload("document", "report.pdf", "application/pdf", 3 * mb + 1)).status, 200);
    assert.equal((await upload("document", "report.pdf", "application/pdf", 4 * mb + 1)).status, 413);
    assert.equal(await User.countDocuments(), 3);
});
