import { Router } from "express";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { protect, blockInPreviewMode } from "../middlewares/auth.middleware.js";
import { Notification, NotificationEvent, NotificationPreference, PushSubscription, PushDelivery } from "../models/notification.model.js";
import { notificationScope } from "../services/notification.service.js";
import { isAllowedPushEndpoint, notificationCategories } from "../helpers/notification-policy.js";
import { pushConfigured } from "../workers/notification.worker.js";
import { notifyUser } from "../services/socket.service.js";

const router = Router();
const route = (handler) => async (req, res) => { try { await handler(req, res); } catch (error) { console.error("Notifications:", error.message); res.status(500).json({ success: false, message: "Could not update notifications. Please try again." }); } };
router.use(protect);

router.get("/", route(async (req, res) => {
    const scope = await notificationScope(req.user);
    const filter = { ...scope, archivedAt: req.query.archived === "true" ? { $ne: null } : null };
    if (req.query.unread === "true") filter.readAt = null;
    if (notificationCategories.includes(req.query.category)) filter.category = req.query.category;
    if (req.query.search) {
        const query = String(req.query.search).slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$and = [{ $or: [{ title: { $regex: query, $options: "i" } }, { body: { $regex: query, $options: "i" } }] }];
    }
    const page = Math.min(10000, Math.max(1, Math.trunc(Number(req.query.page)) || 1));
    const limit = Math.min(50, Math.max(1, Math.trunc(Number(req.query.limit)) || 20));
    const [items, total, unreadCount, inboxCount] = await Promise.all([
        Notification.find(filter)
            .populate("subjectUserId", "username email role")
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Notification.countDocuments(filter), Notification.countDocuments({ ...scope, archivedAt: null, readAt: null }),
        Notification.countDocuments({ ...scope, archivedAt: null }),
    ]);
    res.json({ items, unreadCount, inboxCount, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
}));

router.get("/preferences", route(async (req, res) => {
    const preference = await NotificationPreference.findOne({ userId: req.user._id }).lean();
    res.json({ lowBalanceThreshold: preference?.lowBalanceThreshold ?? 100, pushCategories: preference?.pushCategories ?? notificationCategories, pushAvailable: pushConfigured(), publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null });
}));

router.use(blockInPreviewMode("Notification changes"));
router.put("/preferences", route(async (req, res) => {
    const { lowBalanceThreshold, pushCategories } = req.body;
    if (!Number.isFinite(lowBalanceThreshold) || lowBalanceThreshold < 0 || lowBalanceThreshold > 100000000 || !Array.isArray(pushCategories) || pushCategories.length > notificationCategories.length || pushCategories.some((item) => !notificationCategories.includes(item))) return res.status(400).json({ message: "Choose a valid threshold and notification categories." });
    await NotificationPreference.updateOne({ userId: req.user._id }, { $set: { lowBalanceThreshold, pushCategories: [...new Set(pushCategories)] } }, { upsert: true });
    notifyUser(req.user._id, "NOTIFICATIONS_CHANGED", {});
    res.json({ success: true });
}));

router.patch("/read-all", route(async (req, res) => {
    const scope = await notificationScope(req.user);
    await Notification.updateMany({ ...scope, archivedAt: null, readAt: null }, { $set: { readAt: new Date() } });
    notifyUser(req.user._id, "NOTIFICATIONS_CHANGED", {});
    res.json({ success: true });
}));

router.patch("/archive-all", route(async (req, res) => {
    const scope = await notificationScope(req.user);
    const result = await Notification.updateMany({ ...scope, archivedAt: null }, { $set: { archivedAt: new Date() } });
    notifyUser(req.user._id, "NOTIFICATIONS_CHANGED", {});
    res.json({ success: true, cleared: result.modifiedCount });
}));

router.patch("/:id", route(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: "Invalid notification." });
    const changes = {};
    if (typeof req.body.read === "boolean") changes.readAt = req.body.read ? new Date() : null;
    if (typeof req.body.archived === "boolean") changes.archivedAt = req.body.archived ? new Date() : null;
    if (!Object.keys(changes).length) return res.status(400).json({ message: "Choose a notification action." });
    const item = await Notification.findOneAndUpdate({ ...await notificationScope(req.user), _id: req.params.id }, { $set: changes }, { returnDocument: "after" });
    if (!item) return res.status(404).json({ message: "Notification not found." });
    notifyUser(req.user._id, "NOTIFICATIONS_CHANGED", {});
    res.json({ success: true });
}));

router.post("/push", route(async (req, res) => {
    if (!pushConfigured()) return res.status(503).json({ message: "Browser push is not configured on the server yet." });
    const subscription = req.body.subscription;
    if (!subscription || typeof subscription.endpoint !== "string" || subscription.endpoint.length > 2048 || !isAllowedPushEndpoint(subscription.endpoint)) return res.status(400).json({ message: "Unsupported push service." });
    const keys = subscription.keys;
    if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string" || keys.p256dh.length > 128 || keys.auth.length > 64 || Buffer.from(keys.p256dh, "base64url").length !== 65 || Buffer.from(keys.auth, "base64url").length !== 16) return res.status(400).json({ message: "Invalid browser subscription." });
    const endpointHash = createHash("sha256").update(subscription.endpoint).digest("hex");
    const existing = await PushSubscription.findOne({ endpointHash }).select("_id");
    if (!existing && await PushSubscription.countDocuments({ userId: req.user._id }) >= 10) return res.status(400).json({ message: "Browser notification device limit reached. Disable notifications on an unused device." });
    await PushSubscription.findOneAndUpdate({ endpointHash }, { $set: { userId: req.user._id, sessionId: req.session._id, subscription: { endpoint: subscription.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } } }, { upsert: true });
    res.json({ success: true });
}));

router.delete("/push", route(async (req, res) => {
    const filter = { userId: req.user._id, sessionId: req.session._id };
    if (typeof req.body.endpoint === "string") filter.endpointHash = createHash("sha256").update(req.body.endpoint).digest("hex");
    await PushSubscription.deleteMany(filter);
    res.json({ success: true });
}));

router.get("/operations", route(async (req, res) => {
    if (req.user.role !== "Super Admin") return res.status(403).json({ message: "Admin access required." });
    const [failedEvents, failedPush, pendingEvents, pendingPush] = await Promise.all([
        NotificationEvent.countDocuments({ state: "failed" }), PushDelivery.countDocuments({ state: "failed" }),
        NotificationEvent.countDocuments({ state: { $in: ["pending", "processing"] } }), PushDelivery.countDocuments({ state: { $in: ["pending", "processing"] } }),
    ]);
    res.json({ failedEvents, failedPush, pendingEvents, pendingPush });
}));
router.post("/retry", route(async (req, res) => {
    if (req.user.role !== "Super Admin") return res.status(403).json({ message: "Admin access required." });
    await Promise.all([NotificationEvent, PushDelivery].map((model) => model.updateMany({ state: "failed" }, { $set: { state: "pending", attempts: 0, availableAt: new Date() }, $unset: { error: "", lease: "", lockUntil: "" } })));
    res.json({ success: true });
}));

export default router;
