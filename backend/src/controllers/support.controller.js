import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import supportConversationModel from "../models/supportConversation.model.js";
import supportMessageModel from "../models/supportMessage.model.js";
import supportAttachmentModel from "../models/supportAttachment.model.js";
import userModel from "../models/user.model.js";
import { NotificationEvent } from "../models/notification.model.js";
import { getNextNotificationSequence } from "../helpers/notification-hooks.js";
import {
    sanitizeSenderIdentity,
    sanitizeConversation,
    sanitizeMessage,
    sanitizeAttachment,
} from "../helpers/support-identity.helper.js";
import {
    processAndSaveSupportMedia,
    removeSupportMedia,
    SUPPORT_STORAGE_DIR,
} from "../services/support-media.service.js";
import { notifyUser, notifyRole, emitSupportEvent } from "../services/socket.service.js";

/**
 * Access check helper:
 * - Super Admin can access all conversations
 * - Reseller can access conversations where reseller == user._id
 * - User can access conversations where user == user._id
 */
export function hasConversationAccess(conversation, user) {
    if (!conversation || !user) return false;
    if (user.role === "Super Admin") return true;
    if (user.role === "Reseller" && String(conversation.reseller?._id || conversation.reseller) === String(user._id)) return true;
    if (user.role === "User" && String(conversation.user?._id || conversation.user) === String(user._id)) return true;
    return false;
}

async function inboxConversations(conversations, viewer) {
    if (!conversations.length) return [];
    const unread = await supportMessageModel.aggregate([
        { $match: { sender: { $ne: viewer._id }, $or: conversations.map(conversation => ({
            conversationId: conversation._id,
            sequenceNumber: { $gt: conversation.participantReadPositions?.get(String(viewer._id))?.lastReadSequence || 0 },
        })) } },
        { $group: { _id: "$conversationId", count: { $sum: 1 } } },
    ]);
    const counts = new Map(unread.map(item => [String(item._id), item.count]));
    return conversations.map(conversation => ({ ...sanitizeConversation(conversation, viewer.role), unreadCount: counts.get(String(conversation._id)) || 0 }));
}

/**
 * POST /api/support/conversations
 * Start or get the ongoing active conversation for the authenticated user.
 */
export async function getOrCreateConversation(req, res) {
    try {
        const user = req.user;
        if (user.role !== "User") {
            return res.status(400).json({
                success: false,
                message: "Conversations can only be initiated by Users. Resellers and Admins respond to existing threads.",
            });
        }

        if (req.body.subject !== undefined && (typeof req.body.subject !== "string" || !req.body.subject.trim() || req.body.subject.trim().length > 150)) return res.status(400).json({ message: "Provide a subject up to 150 characters." });
        // Determine assigned reseller from user record
        let resellerId = user.resellerId;
        if (!resellerId) {
            const admin = await userModel.findOne({ role: "Super Admin", status: "active" });
            resellerId = admin ? admin._id : null;
        }

        if (!resellerId) return res.status(503).json({ message: "No support administrator is available. Please contact your account manager." });
        let conversation = await supportConversationModel.findOne({
            user: user._id,
            status: { $in: ["open", "reopened"] },
        }).populate("reseller", "username email dp_img role");

        let isNew = false;
        if (!conversation) {
            conversation = await supportConversationModel.create({
                user: user._id,
                reseller: resellerId,
                subject: (req.body.subject || "Customer Support").trim(),
                status: "open",
                events: [
                    {
                        eventType: "created",
                        actor: user._id,
                        actorRole: "User",
                        note: "Conversation initiated by user",
                        timestamp: new Date(),
                    },
                ],
            });
            await conversation.populate("reseller", "username email dp_img role");
            isNew = true;
            void notifyRole("Super Admin", "SUPPORT_CONVERSATION_UPDATED", { conversationId: conversation._id });

            // Notify assigned reseller
            if (resellerId) {
                notifyUser(resellerId, "SUPPORT_CONVERSATION_CREATED", {
                    conversationId: conversation._id,
                    subject: conversation.subject,
                    userId: user._id,
                });
            }
        }

        return res.status(isNew ? 201 : 200).json({
            success: true,
            data: sanitizeConversation(conversation, user.role),
        });
    } catch (error) {
        console.error("getOrCreateConversation error:", error);
        return res.status(500).json({ success: false, message: "Failed to initialize conversation." });
    }
}

/**
 * GET /api/support/conversations
 * List conversations accessible to the current user with status / escalation filters.
 */
export async function listConversations(req, res) {
    try {
        const { role, _id } = req.user;
        const { status, isEscalated, page = 1, limit = 20 } = req.query;

        const filter = {};
        if (role === "User") {
            filter.user = _id;
        } else if (role === "Reseller") {
            filter.reseller = _id;
        } // Super Admin has universal access

        if (status && ["open", "resolved", "reopened"].includes(status)) {
            filter.status = status;
        }
        if (status === "ongoing") filter.status = { $in: ["open", "reopened"] };
        if (req.query.search) filter.subject = { $regex: String(req.query.search).slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
        if (isEscalated === "true") {
            filter["escalation.isEscalated"] = true;
            if (!status) filter.status = { $ne: "resolved" };
        }

        const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(50, Math.max(1, parseInt(limit, 10)));
        const pageLimit = Math.min(50, Math.max(1, parseInt(limit, 10)));

        const [total, conversations] = await Promise.all([
            supportConversationModel.countDocuments(filter),
            supportConversationModel.find(filter)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(pageLimit)
                .populate("user", "username email dp_img")
                .populate("reseller", "username email dp_img role"),
        ]);

        const sanitized = await inboxConversations(conversations, req.user);

        return res.status(200).json({
            success: true,
            total,
            page: parseInt(page, 10),
            totalPages: Math.ceil(total / pageLimit),
            data: sanitized,
        });
    } catch (error) {
        console.error("listConversations error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch conversations." });
    }
}

/**
 * DELETE /api/support/conversations/:id
 * Super Admin cleanup: permanently remove a chat for all participants.
 */
export async function deleteConversation(req, res) {
    if (req.user.role !== "Super Admin") {
        return res.status(403).json({ success: false, message: "Only Super Admin can delete support conversations." });
    }
    let session;
    try {
        session = await mongoose.startSession();
        let conversation;
        let attachments = [];
        await session.withTransaction(async () => {
            conversation = await supportConversationModel.findOneAndDelete({ _id: req.params.id }, { session });
            attachments = await supportAttachmentModel.find({ conversationId: req.params.id }).select("storageReference").session(session).lean();
            await supportMessageModel.deleteMany({ conversationId: req.params.id }, { session });
            await supportAttachmentModel.deleteMany({ conversationId: req.params.id }, { session });
        });
        const cleanup = await Promise.allSettled(attachments.map(attachment => removeSupportMedia(attachment.storageReference)));
        const cleanupPending = cleanup.some(result => result.status === "rejected");
        for (const result of cleanup) {
            if (result.status === "rejected") console.error("Support attachment cleanup:", result.reason.message);
        }
        if (conversation) {
            try {
                const payload = { conversationId: String(conversation._id) };
                await Promise.all([
                    notifyUser(conversation.user, "SUPPORT_CONVERSATION_DELETED", payload),
                    notifyUser(conversation.reseller, "SUPPORT_CONVERSATION_DELETED", payload),
                    notifyRole("Super Admin", "SUPPORT_CONVERSATION_DELETED", payload),
                ]);
            } catch (error) { console.error("Support deletion notification:", error.message); }
        }
        return res.json({ success: true, message: "Support conversation deleted for everyone.", cleanupPending });
    } catch (error) {
        console.error("deleteConversation error:", error);
        return res.status(500).json({ success: false, message: "Could not delete this conversation. Please try again." });
    } finally { if (session) await session.endSession(); }
}

/**
 * GET /api/support/conversations/:id
 * Retrieve a single conversation's header and participant details.
 */
export async function getConversationById(req, res) {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid conversation ID." });
        }

        const conversation = await supportConversationModel.findById(id)
            .populate("user", "username email dp_img")
            .populate("reseller", "username email dp_img role");

        if (!conversation || !hasConversationAccess(conversation, req.user)) {
            return res.status(404).json({ success: false, message: "Conversation not found or access denied." });
        }

        return res.status(200).json({
            success: true,
            data: sanitizeConversation(conversation, req.user.role),
        });
    } catch (error) {
        console.error("getConversationById error:", error);
        return res.status(500).json({ success: false, message: "Failed to load conversation details." });
    }
}

/**
 * GET /api/support/conversations/:id/messages
 * Retrieve paginated messages for a conversation.
 */
export async function getConversationMessages(req, res) {
    try {
        const { id } = req.params;
        const { beforeSequence, afterSequence, limit = 50 } = req.query;

        const conversation = await supportConversationModel.findById(id);
        if (!conversation || !hasConversationAccess(conversation, req.user)) {
            return res.status(403).json({ success: false, message: "Unauthorized." });
        }

        const query = { conversationId: conversation._id };
        if (beforeSequence && !isNaN(Number(beforeSequence))) {
            query.sequenceNumber = { $lt: Number(beforeSequence) };
        }
        if (afterSequence !== undefined && Number.isSafeInteger(Number(afterSequence)) && Number(afterSequence) >= 0) {
            query.sequenceNumber = { $gt: Number(afterSequence) };
        }

        const fetchLimit = Math.min(100, Math.max(1, parseInt(limit, 10)));

        const messages = await supportMessageModel.find(query)
            .sort({ sequenceNumber: afterSequence !== undefined ? 1 : -1 })
            .limit(fetchLimit)
            .populate("sender", "username email dp_img")
            .populate("attachments");

        // Return chronologically
        const ordered = afterSequence !== undefined ? messages : messages.reverse();
        const sanitized = ordered.map((m) => sanitizeMessage(m, req.user.role));

        return res.status(200).json({
            success: true,
            count: sanitized.length,
            data: sanitized,
        });
    } catch (error) {
        console.error("getConversationMessages error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch messages." });
    }
}

/**
 * POST /api/support/conversations/:id/messages
 * Send a reply message in a conversation. Retry-safe with clientMessageId.
 */
export async function sendMessage(req, res) {
    const { id } = req.params;
    const user = req.user;
    const { text = "", clientMessageId, attachmentIds = [] } = req.body;
    if (typeof text !== "string" || text.length > 4000 || typeof clientMessageId !== "string" || clientMessageId.length > 128 || !clientMessageId.trim() || !Array.isArray(attachmentIds) || attachmentIds.length > 5 || attachmentIds.some(value => !mongoose.Types.ObjectId.isValid(value))) {
        return res.status(400).json({ success: false, message: "Provide a message up to 4,000 characters, a unique message reference, and at most five attachments." });
    }
    if (!text.trim() && !attachmentIds.length) return res.status(400).json({ success: false, message: "Write a message or attach media." });
    let session;
    try {
        const conversation = await supportConversationModel.findById(id);
        if (!hasConversationAccess(conversation, user)) return res.status(403).json({ success: false, message: "Conversation access denied." });
        const existing = await supportMessageModel.findOne({ conversationId: id, clientMessageId }).populate("sender", "username email dp_img").populate("attachments");
        if (existing) {
            if (String(existing.sender?._id || existing.sender) !== String(user._id)) return res.status(409).json({ message: "Message reference already used." });
            return res.json({ success: true, data: sanitizeMessage(existing, user.role) });
        }
        let message;
        let updatedConversation;
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            const current = await supportConversationModel.findById(id).session(session);
            if (!hasConversationAccess(current, user)) throw new Error("Conversation access changed. Reload the conversation.");
            if (attachmentIds.length) {
                const count = await supportAttachmentModel.countDocuments({ _id: { $in: attachmentIds }, conversationId: id, uploader: user._id, isProcessed: true }).session(session);
                if (count !== attachmentIds.length) throw new Error("Attachments must be your own uploads in this conversation.");
            }
            const events = [];
            if (current.status === "resolved") events.push({ eventType: "reopened", actor: user._id, actorRole: user.role, note: "Reopened by incoming message" });
            if (user.role === "Super Admin") events.push({ eventType: "staff_intervention", actor: user._id, actorRole: user.role, note: "Super Admin joined the conversation" });
            const update = { $inc: { nextSequenceNumber: 1 }, $set: {
                "latestActivity.messageText": text.trim().slice(0, 150) || "[Attachment]",
                "latestActivity.sentAt": new Date(), "latestActivity.senderRole": user.role,
                ...(current.status === "resolved" ? { status: "reopened" } : {}),
            } };
            if (events.length) update.$push = { events: { $each: events } };
            updatedConversation = await supportConversationModel.findByIdAndUpdate(id, update, { new: true, session });
            [message] = await supportMessageModel.create([{ conversationId: id, sender: user._id, senderRole: user.role, clientMessageId, sequenceNumber: updatedConversation.nextSequenceNumber - 1, text: text.trim(), attachments: attachmentIds }], { session });
        });
        await message.populate("sender", "username email dp_img");
        await message.populate("attachments");
        try {
            await emitSupportEvent(id, "SUPPORT_MESSAGE_RECEIVED", message);
            const payload = { conversationId: id };
            await Promise.all([notifyUser(conversation.user, "SUPPORT_CONVERSATION_UPDATED", payload), notifyUser(conversation.reseller, "SUPPORT_CONVERSATION_UPDATED", payload), notifyRole("Super Admin", "SUPPORT_CONVERSATION_UPDATED", payload)]);
        } catch (error) { console.error("Support delivery:", error.message); }
        return res.status(201).json({ success: true, data: sanitizeMessage(message, user.role) });
    } catch (error) {
        if (error.code === 11000) {
            const existing = await supportMessageModel.findOne({ conversationId: id, clientMessageId, sender: user._id }).populate("sender", "username email dp_img").populate("attachments");
            if (existing) return res.json({ success: true, data: sanitizeMessage(existing, user.role) });
        }
        console.error("Support send:", error.message);
        return res.status(500).json({ success: false, message: "Message could not be sent. You can retry safely." });
    } finally { if (session) await session.endSession(); }
}
/**
 * POST /api/support/conversations/:id/read
 * Mark messages in a conversation as read up to a sequence number.
 */
export async function markAsRead(req, res) {
    try {
        const { id } = req.params;
        const { sequenceNumber } = req.body;
        const user = req.user;

        const conversation = await supportConversationModel.findById(id);
        if (!conversation || !hasConversationAccess(conversation, user)) {
            return res.status(403).json({ success: false, message: "Unauthorized." });
        }

        const requested = sequenceNumber === undefined ? conversation.nextSequenceNumber - 1 : Number(sequenceNumber);
        if (!Number.isSafeInteger(requested) || requested < 0 || requested >= conversation.nextSequenceNumber) return res.status(400).json({ message: "Invalid read position." });
        const readSeq = Math.max(requested, conversation.participantReadPositions.get(String(user._id))?.lastReadSequence || 0);

        await supportConversationModel.updateOne({ _id: id }, {
            $max: { [`participantReadPositions.${user._id}.lastReadSequence`]: readSeq },
            $set: { [`participantReadPositions.${user._id}.lastReadAt`]: new Date() },
        }, { timestamps: false });

        try {
            await emitSupportEvent(conversation._id, "SUPPORT_MESSAGES_READ", {
                    conversationId: conversation._id,
                    readerRole: user.role,
                    sequenceNumber: readSeq,
            });
        } catch {}

        return res.status(200).json({ success: true, sequenceNumber: readSeq });
    } catch (error) {
        console.error("markAsRead error:", error);
        return res.status(500).json({ success: false, message: "Failed to update read state." });
    }
}

/**
 * PATCH /api/support/conversations/:id/status
 * Resolve or reopen a conversation.
 */
export async function updateStatus(req, res) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const user = req.user;
        if (user.role === "User") return res.status(403).json({ message: "Your Admin manages resolution. Send a message to reopen the conversation." });

        if (!["open", "resolved", "reopened"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status value." });
        }

        const conversation = await supportConversationModel.findById(id);
        if (!conversation || !hasConversationAccess(conversation, user)) {
            return res.status(403).json({ success: false, message: "Unauthorized." });
        }

        conversation.status = status;
        conversation.events.push({
            eventType: status === "resolved" ? "resolved" : "reopened",
            actor: user._id,
            actorRole: user.role,
            note: `Status changed to ${status}`,
            timestamp: new Date(),
        });

        if (status === "resolved" && conversation.escalation.isEscalated) {
            conversation.escalation.resolvedAt = new Date();
        }

        await conversation.save();

        try {
            await emitSupportEvent(conversation._id, "SUPPORT_STATUS_CHANGED", {
                    conversationId: conversation._id,
                    status,
            });
            await Promise.all([notifyUser(conversation.user, "SUPPORT_CONVERSATION_UPDATED", { conversationId: id }), notifyUser(conversation.reseller, "SUPPORT_CONVERSATION_UPDATED", { conversationId: id }), notifyRole("Super Admin", "SUPPORT_CONVERSATION_UPDATED", { conversationId: id })]);
        } catch {}

        return res.status(200).json({
            success: true,
            data: sanitizeConversation(conversation, user.role),
        });
    } catch (error) {
        console.error("updateStatus error:", error);
        return res.status(500).json({ success: false, message: "Failed to update status." });
    }
}

/**
 * POST /api/support/conversations/:id/escalate
 * Reseller requests Super Admin assistance.
 */
export async function requestEscalation(req, res) {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const user = req.user;
        if (typeof reason !== "string" || !reason.trim() || reason.length > 2000) return res.status(400).json({ message: "Explain the request in up to 2,000 characters." });

        if (user.role !== "Reseller" && user.role !== "Super Admin") {
            return res.status(403).json({
                success: false,
                message: "Only assigned Resellers or Staff can escalate conversations to Super Admin.",
            });
        }

        let conversation;
        // Commit the request and its durable notification together so an offline
        // Super Admin receives the same important alert after signing in.
        await mongoose.connection.transaction(async session => {
            conversation = await supportConversationModel.findById(id).session(session);
            if (!hasConversationAccess(conversation, user)) {
                throw Object.assign(new Error("Unauthorized."), { status: 403 });
            }
            const requestedAt = new Date();
            conversation.escalation = {
                isEscalated: true,
                reason: reason.trim(),
                requestedAt,
                requestedBy: user._id,
                resolvedAt: null,
            };
            conversation.events.push({
                eventType: "escalated",
                actor: user._id,
                actorRole: user.role,
                note: reason.trim(),
                timestamp: requestedAt,
            });
            await conversation.save({ session });
            const version = getNextNotificationSequence();
            await NotificationEvent.create([{
                eventKey: `support:${id}:escalation:${version}`,
                kind: "support",
                data: {
                    id: conversation._id,
                    userId: conversation.user,
                    subject: conversation.subject,
                    reason: conversation.escalation.reason,
                    action: "escalated",
                    version,
                },
            }], { session });
        });

        // Real-time alert to Super Admin room (sanitized summary, no private leak)
        try {
            await notifyRole("Super Admin", "SUPPORT_ESCALATION_ALERT", {
                conversationId: conversation._id,
                subject: conversation.subject,
                reason: conversation.escalation.reason,
                requestedAt: conversation.escalation.requestedAt,
            });
            await notifyUser(conversation.user, "SUPPORT_CONVERSATION_UPDATED", { conversationId: conversation._id });
            await notifyUser(conversation.reseller, "SUPPORT_CONVERSATION_UPDATED", { conversationId: conversation._id });
        } catch (err) {
            console.error("Socket escalation alert error:", err);
        }

        return res.status(200).json({
            success: true,
            message: "Conversation escalated to Super Admin.",
            data: sanitizeConversation(conversation, user.role),
        });
    } catch (error) {
        if (error.status === 403) return res.status(403).json({ success: false, message: error.message });
        console.error("requestEscalation error:", error);
        return res.status(500).json({ success: false, message: "Failed to escalate conversation." });
    }
}

/**
 * GET /api/support/admin/inbox
 * Dedicated Super Admin inbox overview with active/escalated filters.
 */
export async function getAdminInbox(req, res) {
    try {
        if (req.user.role !== "Super Admin") {
            return res.status(403).json({ success: false, message: "Forbidden: Super Admin access required." });
        }

        const { filter = "escalated", page = 1, limit = 25 } = req.query;
        const query = {};

        if (filter === "escalated") {
            query["escalation.isEscalated"] = true;
            query.status = { $ne: "resolved" };
        } else if (filter === "ongoing") {
            query.status = { $in: ["open", "reopened"] };
        } else if (filter === "resolved") {
            query.status = "resolved";
        }
        if (req.query.search) query.subject = { $regex: String(req.query.search).slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

        const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(50, Math.max(1, parseInt(limit, 10)));
        const pageLimit = Math.min(50, Math.max(1, parseInt(limit, 10)));

        const [total, conversations] = await Promise.all([
            supportConversationModel.countDocuments(query),
            supportConversationModel.find(query)
                .sort({ "escalation.requestedAt": -1, updatedAt: -1 })
                .skip(skip)
                .limit(pageLimit)
                .populate("user", "username email dp_img")
                .populate("reseller", "username email dp_img role"),
        ]);

        return res.status(200).json({
            success: true,
            total,
            page: parseInt(page, 10),
            totalPages: Math.ceil(total / pageLimit),
            data: await inboxConversations(conversations, req.user),
        });
    } catch (error) {
        console.error("getAdminInbox error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch admin inbox." });
    }
}

/**
 * POST /api/support/conversations/:id/attachments
 * Upload a private attachment for a conversation.
 */
export async function uploadAttachment(req, res) {
    let session;
    let mediaInfo;
    let attachmentSaved = false;
    try {
        const { id } = req.params;
        const file = req.file;
        const user = req.user;

        if (!file) {
            return res.status(400).json({ success: false, message: "No file provided." });
        }

        const conversation = await supportConversationModel.findById(id);
        if (!conversation || !hasConversationAccess(conversation, user)) {
            return res.status(403).json({ success: false, message: "Unauthorized." });
        }

        const { clientDuration } = req.body;
        mediaInfo = await processAndSaveSupportMedia(
            file.buffer,
            file.originalname,
            clientDuration
        );

        let attachment;
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            // Serialize upload registration with deletion so an in-flight upload
            // cannot leave an attachment behind after its chat is removed.
            const current = await supportConversationModel.findOneAndUpdate(
                { _id: id }, { $inc: { __v: 1 } }, { session, new: true, timestamps: false }
            );
            if (!hasConversationAccess(current, user)) throw new Error("This conversation is no longer available.");
            [attachment] = await supportAttachmentModel.create([{
                conversationId: current._id,
                uploader: user._id,
                uploaderRole: user.role,
                originalName: mediaInfo.originalName,
                storageReference: mediaInfo.storageReference,
                mimeType: mediaInfo.mimeType,
                mediaType: mediaInfo.mediaType,
                sizeBytes: mediaInfo.sizeBytes,
                durationSeconds: mediaInfo.durationSeconds,
                isProcessed: true,
            }], { session });
        });
        attachmentSaved = true;

        return res.status(201).json({
            success: true,
            data: sanitizeAttachment(attachment, user.role),
        });
    } catch (error) {
        if (mediaInfo && !attachmentSaved) {
            try { await removeSupportMedia(mediaInfo.storageReference); }
            catch (cleanupError) { console.error("Support upload cleanup:", cleanupError.message); }
        }
        console.error("uploadAttachment error:", error);
        return res.status(400).json({ success: false, message: error.message });
    } finally { if (session) await session.endSession(); }
}

/**
 * GET /api/support/attachments/:id/view
 * GET /api/support/attachments/:id/download
 * Secure streaming of private attachments after checking conversation authorization.
 */
export async function serveAttachment(req, res) {
    try {
        const { id } = req.params;
        const isDownload = req.path.endsWith("/download");

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid attachment ID." });
        }

        const attachment = await supportAttachmentModel.findById(id);
        if (!attachment) {
            return res.status(404).json({ success: false, message: "Attachment not found." });
        }

        const conversation = await supportConversationModel.findById(attachment.conversationId);
        if (!conversation || !hasConversationAccess(conversation, req.user)) {
            return res.status(403).json({ success: false, message: "Access denied to this media file." });
        }

        const filePath = path.join(SUPPORT_STORAGE_DIR, attachment.storageReference);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: "Media file was moved or deleted." });
        }

        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Cache-Control", "private, no-store");
        res.setHeader("Content-Type", attachment.mimeType);

        if (isDownload || attachment.mediaType === "document") {
            res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.originalName)}"`);
        } else {
            res.setHeader("Content-Disposition", "inline");
        }

        const stream = fs.createReadStream(filePath);
        stream.on("error", () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
        stream.pipe(res);
    } catch (error) {
        console.error("serveAttachment error:", error);
        return res.status(500).json({ success: false, message: "Failed to stream media." });
    }
}

