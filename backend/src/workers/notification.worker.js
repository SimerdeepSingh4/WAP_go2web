import { randomUUID } from "node:crypto";
import webpush from "web-push";
import { Notification, NotificationEvent, PushDelivery, PushSubscription, NotificationPreference } from "../models/notification.model.js";
import userModel from "../models/user.model.js";
import walletModel from "../models/wallet.model.js";
import sessionModel from "../models/session.model.js";
import { deliverEvent, canDeliverNotification } from "../services/notification.service.js";
import { roleBase } from "../helpers/notification-policy.js";
import { getIO } from "../services/socket.service.js";

let timer, expiryTimer, running, expiryRunning, stopping = false;
const retention = () => new Date(Date.now() + 7 * 86400000);
export function pushConfigured() { return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT); }

async function claim(model) {
    const now = new Date();
    return model.findOneAndUpdate({ $or: [
        { state: "pending", availableAt: { $lte: now } },
        { state: "processing", lockUntil: { $lt: now } },
    ] }, { $set: { state: "processing", lease: randomUUID(), lockUntil: new Date(Date.now() + 60000) }, $inc: { attempts: 1 } }, { returnDocument: "after", sort: { createdAt: 1 } }).lean();
}

async function finish(model, job, state, error) {
    const retry = state === "failed" && job.attempts < 8;
    await model.updateOne({ _id: job._id, lease: job.lease }, { $set: {
        state: retry ? "pending" : state,
        availableAt: new Date(Date.now() + Math.min(3600000, 2000 * 2 ** job.attempts)),
        error: error ? String(error.message || "Delivery failed").slice(0, 300) : null,
        ...(["done", "sent", "skipped"].includes(state) ? { expiresAt: retention() } : {}),
    }, $unset: { lease: "", lockUntil: "" } });
    if (state === "failed" && !retry && job.kind !== "operations") {
        const eventKey = `notification-delivery-failure:${new Date().toISOString().slice(0, 10)}`;
        await NotificationEvent.updateOne({ eventKey }, { $setOnInsert: { kind: "operations", data: {} } }, { upsert: true });
    }
}

export async function sendPush(job) {
    const subscription = await PushSubscription.findById(job.subscriptionId).select("+subscription").lean();
    const notification = await Notification.findById(job.notificationId).lean();
    if (!subscription || !notification || notification.archivedAt || notification.readAt || notification.expiresAt <= new Date()) return "skipped";
    if (String(subscription.userId) !== String(job.userId)) return "skipped";
    const session = await sessionModel.findOne({ _id: subscription.sessionId, userId: job.userId, expiresAt: { $gt: new Date() } }).lean();
    const user = await userModel.findById(job.userId).lean();
    if (!session || !user || user.status !== "active" || (user.expiresAt && new Date(user.expiresAt) <= new Date())) {
        await PushSubscription.deleteOne({ _id: subscription._id }); return "skipped";
    }
    if (!await canDeliverNotification(notification, user)) return "skipped";
    const sockets = await getIO().in(`user:${user._id}`).fetchSockets();
    if (sockets.some((socket) => String(socket.data.sessionId) === String(subscription.sessionId) && socket.data.notificationVisible)) return "skipped";
    const preference = await NotificationPreference.findOne({ userId: user._id }).lean();
    if (preference && !preference.pushCategories.includes(notification.category)) return "skipped";
    try {
        // Lock-screen previews deliberately contain no balances, phone numbers,
        // campaign messages or account names.
        await webpush.sendNotification(subscription.subscription, JSON.stringify({
            id: String(notification._id), userId: String(user._id), title: "New dashboard notification",
            body: "Open your notification centre to view the update.", href: `${roleBase(user.role)}/notifications`,
        }), { TTL: 3600, timeout: 10000, urgency: "normal" });
        return "sent";
    } catch (error) {
        if ([404, 410].includes(error.statusCode)) { await PushSubscription.deleteOne({ _id: subscription._id }); return "skipped"; }
        throw error;
    }
}

export async function processNotificationWork() {
    if (running || stopping) return;
    running = (async () => {
        for (let i = 0; i < 10 && !stopping; i++) {
            const event = await claim(NotificationEvent);
            if (!event) break;
            try { await deliverEvent(event); await finish(NotificationEvent, event, "done"); }
            catch (error) { await finish(NotificationEvent, event, "failed", error); }
        }
        if (pushConfigured()) for (let i = 0; i < 5 && !stopping; i++) {
            const job = await claim(PushDelivery);
            if (!job) break;
            try { await finish(PushDelivery, job, await sendPush(job)); }
            catch (error) { await finish(PushDelivery, job, "failed", error); }
        }
    })();
    try { await running; } catch (error) { console.error("Notification worker:", error.message); }
    finally { running = null; }
}

async function scanExpiry() {
    if (expiryRunning || stopping) return;
    expiryRunning = (async () => {
        const now = new Date(), soon = new Date(Date.now() + 7 * 86400000);
        for (const [kind, model] of [["wallet", walletModel], ["account", userModel]]) {
            const cursor = model.find({ expiresAt: { $lte: soon, $gt: new Date(Date.now() - 7 * 86400000) } }).select("_id userId expiresAt").lean().cursor();
            for await (const item of cursor) {
                if (stopping) break;
                const expired = new Date(item.expiresAt) <= now;
                const eventKey = `expiry:${kind}:${item._id}:${new Date(item.expiresAt).toISOString()}:${expired ? "expired" : "soon"}`;
                await NotificationEvent.updateOne({ eventKey }, { $setOnInsert: { kind: "expiry", data: { userId: kind === "wallet" ? item.userId : item._id, expired } } }, { upsert: true });
            }
        }
    })();
    try { await expiryRunning; } catch (error) { console.error("Notification expiry scan:", error.message); }
    finally { expiryRunning = null; }
}

export async function startNotificationWorker() {
    stopping = false;
    await Promise.all([Notification, NotificationEvent, NotificationPreference, PushSubscription, PushDelivery].map((model) => model.init()));
    if (pushConfigured()) webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    timer = setInterval(() => void processNotificationWork(), 1000);
    expiryTimer = setInterval(() => void scanExpiry(), 60000);
    timer.unref(); expiryTimer.unref();
    void processNotificationWork(); void scanExpiry();
}

export async function closeNotificationWorker() {
    stopping = true; clearInterval(timer); clearInterval(expiryTimer);
    await Promise.allSettled([running, expiryRunning].filter(Boolean));
}
