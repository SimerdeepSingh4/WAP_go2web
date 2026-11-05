import userModel from "../models/user.model.js";
import { Notification, NotificationPreference, PushSubscription, PushDelivery } from "../models/notification.model.js";
import { formatNotification, getNotificationGroup, managesUser, mayReadNotification, sameId } from "../helpers/notification-policy.js";
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

        const group = getNotificationGroup(event, event.data?.changeField);
        const incomingVersion = Number(event.data?.version) || Date.now();
        const incomingEventId = event.eventKey;

        let notification;
        // 1. Try atomic update of existing notification if incomingVersion is newer
        const updated = await Notification.findOneAndUpdate(
            {
                recipientId: user._id,
                groupKey: group.groupKey,
                $or: [
                    { version: { $lt: incomingVersion } },
                    { version: { $exists: false } }
                ]
            },
            {
                $set: {
                    title: message.title,
                    body: message.body,
                    href: message.href,
                    category: message.category,
                    version: incomingVersion,
                    lastEventId: incomingEventId,
                    readAt: null,          // Mark unread
                    archivedAt: null,      // Restore if archived
                    createdAt: new Date(),  // Move to top of inbox
                    subjectUserId: subject?._id,
                    managed,
                    recipientRole: user.role,
                    itemType: group.itemType,
                    itemId: group.itemId,
                    changeType: group.changeType,
                    fieldKey: group.fieldKey,
                }
            },
            { returnDocument: "after" }
        ).lean();

        if (updated) {
            notification = updated;
        } else {
            // Check if document exists with version >= incomingVersion
            const existing = await Notification.findOne({ recipientId: user._id, groupKey: group.groupKey }).lean();
            if (existing) {
                // Older event or replay of same event: preserve read state & skip duplicate alert
                continue;
            }
            // Document does not exist yet -> insert atomically
            try {
                notification = await Notification.findOneAndUpdate(
                    { recipientId: user._id, groupKey: group.groupKey },
                    {
                        $setOnInsert: {
                            recipientId: user._id,
                            recipientRole: user.role,
                            eventId: incomingEventId,
                            lastEventId: incomingEventId,
                            groupKey: group.groupKey,
                            itemType: group.itemType,
                            itemId: group.itemId,
                            changeType: group.changeType,
                            fieldKey: group.fieldKey,
                            version: incomingVersion,
                            category: message.category,
                            title: message.title,
                            body: message.body,
                            href: message.href,
                            subjectUserId: subject?._id,
                            managed,
                            readAt: null,
                            archivedAt: null,
                            createdAt: new Date(),
                        }
                    },
                    { upsert: true, returnDocument: "after" }
                ).lean();
            } catch (err) {
                if (err.code === 11000) {
                    notification = await Notification.findOne({ recipientId: user._id, groupKey: group.groupKey }).lean();
                } else {
                    throw err;
                }
            }
        }

        if (!notification) continue;

        // Re-emission is safe: clients deduplicate by notification ID and fetch
        // the authoritative list/count after reconnecting.
        notifyUser(user._id, "NOTIFICATION_CREATED", {
            id: notification._id,
            title: notification.title,
            body: notification.body,
            groupKey: notification.groupKey,
            toastId: `notification-${notification._id}`,
            version: notification.version,
        });

        const preference = await NotificationPreference.findOne({ userId: user._id }).lean();
        if (preference && !preference.pushCategories.includes(message.category)) continue;
        const subscriptions = await PushSubscription.find({ userId: user._id }).select("_id").lean();
        for (const subscription of subscriptions) await PushDelivery.updateOne(
            { notificationId: notification._id, subscriptionId: subscription._id },
            { $setOnInsert: { userId: user._id } }, { upsert: true }
        );
    }
}
