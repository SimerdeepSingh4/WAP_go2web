import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { once } from "node:events";
import test, { before, after } from "node:test";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";
import webpush from "web-push";
import config from "./src/config/config.js";
import User from "./src/models/user.model.js";
import Wallet from "./src/models/wallet.model.js";
import Transaction from "./src/models/transaction.model.js";
import Session from "./src/models/session.model.js";
import { Notification, NotificationEvent, NotificationPreference, PushSubscription, PushDelivery } from "./src/models/notification.model.js";
import router from "./src/routes/notification.routes.js";
import { deliverEvent } from "./src/services/notification.service.js";
import { initSocket } from "./src/services/socket.service.js";
import { sendPush, processNotificationWork } from "./src/workers/notification.worker.js";

// This suite creates its own database. It never starts a notification worker,
// touches application accounts or contacts a browser push provider.
const database = "notification_test_" + randomUUID().replaceAll("-", "").slice(0, 16);
let server, io, root, admin, reseller, user, other, wallet;
async function tokenFor(account) {
    const token = jwt.sign({ userId: account._id.toString(), jti: randomUUID() }, config.JWT_SECRET, { expiresIn: "1h" });
    await Session.create({ userId: account._id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600000) });
    return token;
}
async function request(account, path, method = "GET", body) {
    const token = await tokenFor(account);
    const result = await fetch(root + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: result.status, body: await result.json() };
}
before(async () => {
    await mongoose.connect(config.MONGO_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
    await Promise.all([User, Wallet, Transaction, Session, Notification, NotificationEvent, NotificationPreference, PushSubscription, PushDelivery].map((model) => model.init()));
    admin = await User.create({ username: "Test Admin", email: "notify-admin@example.test", password: "TestPassword123!", role: "Super Admin" });
    reseller = await User.create({ username: "Test Reseller", email: "notify-reseller@example.test", password: "TestPassword123!", role: "Reseller", createdBy: admin._id });
    user = await User.create({ username: "Test User", email: "notify-user@example.test", password: "TestPassword123!", role: "User", createdBy: reseller._id, resellerId: reseller._id });
    other = await User.create({ username: "Other User", email: "notify-other@example.test", password: "TestPassword123!", role: "User", createdBy: admin._id });
    wallet = await Wallet.create({ userId: user._id, balance: 100, resellerId: reseller._id });
    const app = express(); app.use(express.json()); app.use("/api/notifications", router);
    server = app.listen(0, "127.0.0.1"); await once(server, "listening");
    root = `http://127.0.0.1:${server.address().port}/api/notifications`;
});
after(async () => {
    if (io) await new Promise((resolve) => io.close(resolve));
    else if (server) await new Promise((resolve) => server.close(resolve));
    try {
        if (mongoose.connection.readyState === 1 && mongoose.connection.name === database && database.startsWith("notification_test_")) await mongoose.connection.dropDatabase();
    } finally { await mongoose.disconnect(); }
});

test("rolled-back credits leave neither a ledger entry nor an outbox event", async () => {
    const id = new mongoose.Types.ObjectId();
    const session = await mongoose.startSession(); session.startTransaction();
    try {
        await Wallet.findOneAndUpdate({ _id: wallet._id }, { $inc: { balance: 20 } }, { returnDocument: 'after', session });
        await Transaction.create([{ _id: id, toUser: user._id, amount: 20, type: "REFUND", performedBy: admin._id }], { session });
        await session.abortTransaction();
    } finally { await session.endSession(); }
    assert.equal(await Transaction.countDocuments({ _id: id }), 0);
    assert.equal(await NotificationEvent.countDocuments({ eventKey: `transaction:${id}` }), 0);
    assert.equal((await Wallet.findById(wallet._id)).balance, 100);
});

test("committed credit events survive delivery retries without duplicate notifications", async () => {
    const id = new mongoose.Types.ObjectId();
    const session = await mongoose.startSession(); session.startTransaction();
    try {
        await Wallet.findOneAndUpdate({ _id: wallet._id }, { $inc: { balance: 20 } }, { returnDocument: 'after', session });
        await Transaction.create([{ _id: id, toUser: user._id, amount: 20, type: "REFUND", performedBy: admin._id }], { session });
        assert.equal(await NotificationEvent.countDocuments({ eventKey: `transaction:${id}` }), 0);
        await session.commitTransaction();
    } finally { await session.endSession(); }
    const event = await NotificationEvent.findOne({ eventKey: `transaction:${id}` }).lean();
    assert.ok(event);
    await deliverEvent(event); await deliverEvent(event);
    assert.equal(await Notification.countDocuments({ eventId: event.eventKey }), 3);
    assert.equal((await Wallet.findById(wallet._id)).balance, 120);
    assert.match((await Notification.findOne({ eventId: event.eventKey, recipientId: user._id })).body, /20 credits were returned/);
});

test("save and wallet update without an explicit session still persist their outbox atomically", async () => {
    const tx = await Transaction.create({ toUser: other._id, type: "REQUEST", amount: 10, performedBy: other._id });
    assert.equal(await NotificationEvent.countDocuments({ eventKey: `transaction:${tx._id}` }), 1);
    await Wallet.findOneAndUpdate({ _id: wallet._id }, { $inc: { balance: -80 } }, { returnDocument: 'after' });
    const event = await NotificationEvent.findOne({ kind: "wallet", "data.userId": user._id, "data.balance": 40 }).lean();
    assert.equal(event.data.previous.balance, 120);
});

test("notification list and mutations are private to the authenticated recipient", async () => {
    const own = await request(user, "");
    assert.equal(own.status, 200);
    assert.equal(own.body.items.length, 1);
    assert.equal(own.body.unreadCount, 1);
    const id = own.body.items[0]._id;
    assert.equal((await request(other, `/${id}`, "PATCH", { read: true })).status, 404);
    assert.equal((await request(other, "")).body.items.length, 0);
    await request(reseller, "/read-all", "PATCH");
    assert.equal((await request(user, "")).body.unreadCount, 1);
    assert.equal((await request(user, `/${id}`, "PATCH", { read: true })).status, 200);
    assert.equal((await request(user, "")).body.unreadCount, 0);
    await request(user, `/${id}`, "PATCH", { archived: true });
    assert.equal((await request(user, "")).body.items.length, 0);
    assert.equal((await request(user, "?archived=true")).body.items.length, 1);
});

test("reassigned users disappear from the former reseller's notification history", async () => {
    const before = await request(reseller, "");
    assert.equal(before.body.items.length, 1);
    user.resellerId = admin._id; await user.save();
    assert.equal((await request(reseller, "")).body.items.length, 0);
    assert.equal((await request(reseller, `/${before.body.items[0]._id}`, "PATCH", { read: false })).status, 404);
});

test("operational delivery tools are admin-only and preference validation is scoped", async () => {
    assert.equal((await request(user, "/operations")).status, 403);
    assert.equal((await request(admin, "/operations")).status, 200);
    assert.equal((await request(user, "/preferences", "PUT", { lowBalanceThreshold: -1, pushCategories: ["credits"] })).status, 400);
    assert.equal((await request(user, "/preferences", "PUT", { lowBalanceThreshold: 50, pushCategories: ["credits"] })).status, 200);
    assert.equal((await request(user, "/preferences")).body.lowBalanceThreshold, 50);
    assert.equal((await request(other, "/preferences")).body.lowBalanceThreshold, 100);
});

test("browser delivery retries transient failures, protects previews, and removes expired subscriptions", async () => {
    io = initSocket(server);
    await NotificationEvent.updateMany({}, { $set: { state: "done" } });
    const token = await tokenFor(user);
    const session = await Session.findOne({ tokenHash: createHash("sha256").update(token).digest("hex") });
    const subscription = await PushSubscription.create({ endpointHash: randomUUID(), userId: user._id, sessionId: session._id, subscription: { endpoint: "https://fcm.googleapis.com/fcm/send/test-only", keys: { p256dh: "test", auth: "test" } } });
    const notification = await Notification.create({ recipientId: user._id, recipientRole: "User", eventId: randomUUID(), category: "credits", title: "Sensitive balance 999", body: "Private account information", href: "/user/credits" });
    const job = await PushDelivery.create({ notificationId: notification._id, subscriptionId: subscription._id, userId: user._id });
    const original = webpush.sendNotification;
    let calls = 0, captured;
    try {
        webpush.sendNotification = async () => { calls++; throw Object.assign(new Error("Temporary push service failure"), { statusCode: 503 }); };
        await processNotificationWork();
        let delivery = await PushDelivery.findById(job._id);
        assert.equal(delivery.state, "pending");
        assert.equal(delivery.attempts, 1);
        assert.equal(calls, 1);
        await PushDelivery.updateOne({ _id: job._id }, { $set: { availableAt: new Date(0) } });
        webpush.sendNotification = async (_, payload) => { calls++; captured = JSON.parse(payload); };
        await processNotificationWork();
        delivery = await PushDelivery.findById(job._id);
        assert.equal(delivery.state, "sent");
        assert.equal(calls, 2);
        assert.equal(captured.userId, user._id.toString());
        assert.ok(!JSON.stringify(captured).includes("999"));
        assert.ok(!JSON.stringify(captured).includes("Private account"));
        await Notification.updateOne({ _id: notification._id }, { $set: { readAt: new Date() } });
        assert.equal(await sendPush(job), "skipped");
        assert.equal(calls, 2);
        await Notification.updateOne({ _id: notification._id }, { $set: { readAt: null } });
        webpush.sendNotification = async () => { throw Object.assign(new Error("Expired subscription"), { statusCode: 410 }); };
        assert.equal(await sendPush(job), "skipped");
        assert.equal(await PushSubscription.countDocuments({ _id: subscription._id }), 0);
    } finally { webpush.sendNotification = original; }
});
