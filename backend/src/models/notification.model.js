import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
    recipientId: { type: mongoose.Schema.Types.ObjectId, required: true },
    recipientRole: { type: String, required: true },
    eventId: { type: String, required: true },
    category: { type: String, enum: ["campaigns", "credits", "accounts", "system"], required: true },
    title: { type: String, required: true, maxlength: 180 },
    body: { type: String, maxlength: 800 },
    href: { type: String, required: true },
    subjectUserId: mongoose.Schema.Types.ObjectId,
    managed: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: () => new Date(Date.now() + 90 * 86400000) },
}, { timestamps: true });
notificationSchema.index({ eventId: 1, recipientId: 1 }, { unique: true });
notificationSchema.index({ recipientId: 1, archivedAt: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, readAt: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const eventSchema = new mongoose.Schema({
    eventKey: { type: String, unique: true, required: true },
    kind: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    state: { type: String, default: "pending", enum: ["pending", "processing", "done", "failed"] },
    attempts: { type: Number, default: 0 },
    availableAt: { type: Date, default: Date.now },
    lockUntil: Date,
    lease: String,
    error: String,
    expiresAt: Date,
}, { timestamps: true });
eventSchema.index({ state: 1, availableAt: 1, lockUntil: 1 });
eventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const preferenceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, unique: true, required: true },
    lowBalanceThreshold: { type: Number, default: 100, min: 0, max: 100000000 },
    pushCategories: { type: [String], default: ["campaigns", "credits", "accounts", "system"] },
}, { timestamps: true });

const subscriptionSchema = new mongoose.Schema({
    endpointHash: { type: String, unique: true, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    sessionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    subscription: { type: mongoose.Schema.Types.Mixed, required: true, select: false },
}, { timestamps: true });

const deliverySchema = new mongoose.Schema({
    notificationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    subscriptionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    state: { type: String, default: "pending", enum: ["pending", "processing", "sent", "skipped", "failed"] },
    attempts: { type: Number, default: 0 },
    availableAt: { type: Date, default: Date.now },
    lockUntil: Date,
    lease: String,
    error: String,
    expiresAt: Date,
}, { timestamps: true });
deliverySchema.index({ notificationId: 1, subscriptionId: 1 }, { unique: true });
deliverySchema.index({ state: 1, availableAt: 1, lockUntil: 1 });
deliverySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Notification = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
export const NotificationEvent = mongoose.models.NotificationEvent || mongoose.model("NotificationEvent", eventSchema);
export const NotificationPreference = mongoose.models.NotificationPreference || mongoose.model("NotificationPreference", preferenceSchema);
export const PushSubscription = mongoose.models.PushSubscription || mongoose.model("PushSubscription", subscriptionSchema);
export const PushDelivery = mongoose.models.PushDelivery || mongoose.model("PushDelivery", deliverySchema);
