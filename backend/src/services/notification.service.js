import userModel from "../models/user.model.js";
import { Notification, NotificationPreference, PushSubscription, PushDelivery } from "../models/notification.model.js";
import { formatNotification, managesUser, mayReadNotification, sameId } from "../helpers/notification-policy.js";
import { notifyUser } from "./socket.service.js";

export async function notificationScope(user) {
    const filter = { recipientId: user._id, recipientRole: user.role, expiresAt: { $gt: new Date() } };
    if (user.role === "Reseller") {
        const children = await userModel.find({ role: "User", createdBy: user._id, resellerId: user._id }).select("_id").lean();
        filter.$or = [{ managed: false }, { managed: true, subjectUserId: { $in: children.map((child) => child._id) } }];
    } else filter.managed = false;
    return filter;
}

export async function canDeliverNotification(notification, user) {
    if (!user) return false;
    const subject = notification.managed ? await userModel.findById(notification.subjectUserId).lean() : null;
    return mayReadNotification(user, notification, subject);
}

export async function deliverEvent(event) {
    const d = event.data;
    const ids = event.kind === "transaction" ? [d.fromUser, d.toUser] : [event.kind === "user" ? d.id : d.userId];
    const subjects = await userModel.find({ _id: { $in: ids.filter(Boolean) } }).lean();
    const admins = await userModel.find({ role: "Super Admin" }).lean();
    const recipients = new Map();
    const put = (user, subject, managed = false) => {
        if (!user) return;
        const key = String(user._id);
        if (!recipients.has(key) || sameId(user._id, subject?._id)) recipients.set(key, { user, subject, managed });
    };
    for (const subject of subjects) {
        put(subject, subject);
        if (subject.role === "User" && subject.resellerId && sameId(subject.resellerId, subject.createdBy)) {
            const parent = await userModel.findById(subject.resellerId).lean();
            if (managesUser(parent, subject)) put(parent, subject, true);
        }
    }
    const mainSubject = subjects.find((user) => user.role === "User") || subjects.find((user) => user.role !== "Super Admin") || subjects[0];
    for (const admin of admins) put(admin, mainSubject || admin);
    const thresholdPreference = mainSubject && await NotificationPreference.findOne({ userId: mainSubject._id }).lean();
    for (const { user, subject, managed } of recipients.values()) {
        const message = formatNotification(event, user, subject, thresholdPreference?.lowBalanceThreshold ?? 100);
        if (!message) continue;
        const notification = await Notification.findOneAndUpdate(
            { eventId: event.eventKey, recipientId: user._id },
            { $setOnInsert: { ...message, recipientRole: user.role, subjectUserId: subject?._id, managed } },
            { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
        ).lean();
        // Re-emission is safe: clients deduplicate by notification ID and fetch
        // the authoritative list/count after reconnecting.
        notifyUser(user._id, "NOTIFICATION_CREATED", { id: notification._id, title: notification.title });
        const preference = await NotificationPreference.findOne({ userId: user._id }).lean();
        if (preference && !preference.pushCategories.includes(message.category)) continue;
        const subscriptions = await PushSubscription.find({ userId: user._id }).select("_id").lean();
        for (const subscription of subscriptions) await PushDelivery.updateOne(
            { notificationId: notification._id, subscriptionId: subscription._id },
            { $setOnInsert: { userId: user._id } }, { upsert: true }
        );
    }
}
