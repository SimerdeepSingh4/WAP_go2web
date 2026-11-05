import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("Clear all archives only the caller's active inbox, preserves history, and is safe to repeat", async () => {
    const older = new Date("2026-11-01T00:00:00Z");
    const records = [
        { recipientId: "user-a", recipientRole: "User", archivedAt: null },
        { recipientId: "user-a", recipientRole: "User", archivedAt: null },
        { recipientId: "user-a", recipientRole: "User", archivedAt: older },
        { recipientId: "user-b", recipientRole: "User", archivedAt: null },
    ];
    const handlers = new Map(), sent = [];
    const router = { use() {}, get() {}, put() {}, post() {}, delete() {}, patch(path, handler) { handlers.set(path, handler); } };
    const dependencies = {
        express: { Router: () => router },
        "node:crypto": { createHash() {} },
        mongoose: { default: { isValidObjectId() { return true; } } },
        "../middlewares/auth.middleware.js": { protect() {}, blockInPreviewMode: () => () => {} },
        "../models/notification.model.js": { Notification: { updateMany: async (filter, update) => {
            let modifiedCount = 0;
            for (const record of records) if (Object.entries(filter).every(([key, value]) => record[key] === value)) { Object.assign(record, update.$set); modifiedCount++; }
            return { modifiedCount };
        } }, NotificationEvent: {}, NotificationPreference: {}, PushSubscription: {}, PushDelivery: {} },
        "../services/notification.service.js": { notificationScope: async (user) => ({ recipientId: user._id, recipientRole: user.role }) },
        "../helpers/notification-policy.js": { notificationCategories: [], isAllowedPushEndpoint() {} },
        "../workers/notification.worker.js": { pushConfigured() {} },
        "../services/socket.service.js": { notifyUser: (...args) => sent.push(args) },
    };
    const context = vm.createContext({ console, Date });
    const module = new vm.SourceTextModule(await readFile(new URL("./src/routes/notification.routes.js", import.meta.url), "utf8"), { context });
    await module.link(async (name) => {
        const exports = dependencies[name];
        return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
    });
    await module.evaluate();
    const call = async () => {
        const res = { json(body) { this.body = body; }, status(code) { this.code = code; return this; } };
        await handlers.get("/archive-all")({ user: { _id: "user-a", role: "User" } }, res);
        return res.body;
    };
    assert.equal((await call()).cleared, 2);
    assert.equal(records.length, 4);
    assert(records[0].archivedAt instanceof Date);
    assert(records[1].archivedAt instanceof Date);
    assert.equal(records[2].archivedAt, older);
    assert.equal(records[3].archivedAt, null);
    assert.equal(sent[0][0], "user-a");
    assert.equal((await call()).cleared, 0);
});
