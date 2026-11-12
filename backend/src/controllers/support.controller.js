import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import supportConversationModel from "../models/supportConversation.model.js";
import supportMessageModel from "../models/supportMessage.model.js";
import supportAttachmentModel from "../models/supportAttachment.model.js";
import userModel from "../models/user.model.js";
import {
    sanitizeSenderIdentity,
    sanitizeConversation,
    sanitizeMessage,
    sanitizeAttachment,
} from "../helpers/support-identity.helper.js";
import {
    processAndSaveSupportMedia,
    SUPPORT_STORAGE_DIR,
} from "../services/support-media.service.js";
import { notifyUser, notifyRole, getIO } from "../services/socket.service.js";

/**
 * Access check helper:
 * - Super Admin can access all conversations
 * - Reseller can access conversations where reseller == user._id
 * - User can access conversations where user == user._id
 */
export function hasConversationAccess(conversation, user) {
    if (!conversation || !user) return false;
    if (user.role === "Super Admin") return true;
    if (user.role === "Reseller" && String(conversation.reseller) === String(user._id)) return true;
    if (user.role === "User" && String(conversation.user) === String(user._id)) return true;
    return false;
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

        // Determine assigned reseller from user record
        let resellerId = user.resellerId;
        if (!resellerId) {
            const admin = await userModel.findOne({ role: "Super Admin" });
            resellerId = admin ? admin._id : null;
        }

        let conversation = await supportConversationModel.findOne({
            user: user._id,
            status: { $in: ["open", "reopened"] },
        }).populate("reseller", "username email dp_img");

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
            await conversation.populate("reseller", "username email dp_img");
            isNew = true;

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
        if (isEscalated === "true") {
            filter["escalation.isEscalated"] = true;
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
                .populate("reseller", "username email dp_img"),
        ]);

        const sanitized = conversations.map((c) => sanitizeConversation(c, role));

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
            .populate("reseller", "username email dp_img");

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
        const { beforeSequence, limit = 50 } = req.query;

        const conversation = await supportConversationModel.findById(id);
        if (!conversation || !hasConversationAccess(conversation, req.user)) {
            return res.status(403).json({ success: false, message: "Unauthorized." });
        }

        const query = { conversationId: conversation._id };
        if (beforeSequence && !isNaN(Number(beforeSequence))) {
            query.sequenceNumber = { $lt: Number(beforeSequence) };
        }

        const fetchLimit = Math.min(100, Math.max(1, parseInt(limit, 10)));

        const messages = await supportMessageModel.find(query)
            .sort({ sequenceNumber: -1 })
            .limit(fetchLimit)
            .populate("sender", "username email dp_img")
            .populate("attachments");

        // Return chronologically
        const ordered = messages.reverse();
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
    try {
        const { id } = req.params;
        const { text, clientMessageId, attachmentIds } = req.body;
        const user = req.user;

        if (!clientMessageId) {
            return res.status(400).json({ success: false, message: "clientMessageId is required for idempotency." });
        }

        if ((!text || !text.trim()) && (!attachmentIds || attachmentIds.length === 0)) {
            return res.status(400).json({ success: false, message: "Message must contain text or attachments." });
        }

        const conversation = await supportConversationModel.findById(id);
        if (!conversation || !hasConversationAccess(conversation, user)) {
            return res.status(403).json({ success: false, message: "Unauthorized." });
        }

        // Idempotency: Return existing message if client is retrying
        const existing = await supportMessageModel.findOne({
            conversationId: conversation._id,
            clientMessageId,
        }).populate("sender", "username email dp_img").populate("attachments");

        if (existing) {
            return res.status(200).json({
                success: true,
                data: sanitizeMessage(existing, user.role),
            });
        }

        // Validate that attachments actually belong to this conversation
        if (attachmentIds && attachmentIds.length > 0) {
            const validCount = await supportAttachmentModel.countDocuments({
                _id: { $in: attachmentIds },
                conversationId: conversation._id,
            });
            if (validCount !== attachmentIds.length) {
                return res.status(400).json({
                    success: false,
                    message: "One or more attachments are invalid or belong to a different conversation.",
                });
            }
        }

        // Atomically increment sequenceNumber and update conversation latestActivity
        const updateDoc = {
            $inc: { nextSequenceNumber: 1 },
            $set: {
                "latestActivity.messageText": (text || "[Attachment]").slice(0, 150),
                "latestActivity.sentAt": new Date(),
                "latestActivity.senderRole": user.role,
            },
        };

        // If conversation was resolved and user or staff sends a message, auto-reopen
        if (conversation.status === "resolved") {
            updateDoc.$set.status = "reopened";
            updateDoc.$push = {
                events: {
                    eventType: "reopened",
                    actor: user._id,
                    actorRole: user.role,
                    note: "Reopened by incoming message",
                    timestamp: new Date(),
                },
            };
        }

        // If Super Admin replies, record staff intervention event
        if (user.role === "Super Admin") {
            updateDoc.$push = updateDoc.$push || {};
            updateDoc.$push.events = {
                eventType: "staff_intervention",
                actor: user._id,
                actorRole: "Super Admin",
                note: "Super Admin replied in conversation",
                timestamp: new Date(),
            };
        }

        const updatedConversation = await supportConversationModel.findByIdAndUpdate(
            id,
            updateDoc,
            { new: true }
        );

        const assignedSequence = updatedConversation.nextSequenceNumber - 1;

        const message = await supportMessageModel.create({
            conversationId: conversation._id,
            sender: user._id,
            senderRole: user.role,
            clientMessageId,
            sequenceNumber: assignedSequence,
            text: text ? text.trim() : "",
            attachments: attachmentIds || [],
        });

        await message.populate("sender", "username email dp_img");
        await message.populate("attachments");

        // Real-time broadcast: Persisted first, then emit identity-filtered copies
        try {
            const io = getIO();
            if (io) {
                const userView = sanitizeMessage(message, "User");
                const staffView = sanitizeMessage(message, "Super Admin");

                io.to(`support:conv:${conversation._id}:user`).emit("SUPPORT_MESSAGE_RECEIVED", userView);
                io.to(`support:conv:${conversation._id}:staff`).emit("SUPPORT_MESSAGE_RECEIVED", staffView);

                // Update participant unread / preview indicator in user personal rooms
                notifyUser(conversation.user, "SUPPORT_CONVERSATION_UPDATED", {
                    conversationId: conversation._id,
                    latestActivity: updatedConversation.latestActivity,
                });
                if (conversation.reseller) {
                    notifyUser(conversation.reseller, "SUPPORT_CONVERSATION_UPDATED", {
                        conversationId: conversation._id,
                        latestActivity: updatedConversation.latestActivity,
                    });
                }
            }
        } catch (socketErr) {
            console.error("Socket broadcast warning:", socketErr.message);
        }

        return res.status(201).json({
            success: true,
            data: sanitizeMessage(message, user.role),
        });
    } catch (error) {
        console.error("sendMessage error:", error);
        return res.status(500).json({ success: false, message: "Failed to send message." });
    }
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

        const readSeq = Number(sequenceNumber) || conversation.nextSequenceNumber - 1;

        conversation.set(`participantReadPositions.${user._id}`, {
            lastReadSequence: readSeq,
            lastReadAt: new Date(),
        });

        await conversation.save();

        try {
            const io = getIO();
            if (io) {
                io.to(`support:conv:${conversation._id}:user`).to(`support:conv:${conversation._id}:staff`).emit("SUPPORT_MESSAGES_READ", {
                    conversationId: conversation._id,
                    readerRole: user.role,
                    sequenceNumber: readSeq,
                });
            }
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
            const io = getIO();
            if (io) {
                io.to(`support:conv:${conversation._id}:user`).to(`support:conv:${conversation._id}:staff`).emit("SUPPORT_STATUS_CHANGED", {
                    conversationId: conversation._id,
                    status,
                });
            }
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

        if (user.role !== "Reseller" && user.role !== "Super Admin") {
            return res.status(403).json({
                success: false,
                message: "Only assigned Resellers or Staff can escalate conversations to Super Admin.",
            });
        }

        const conversation = await supportConversationModel.findById(id);
        if (!conversation || !hasConversationAccess(conversation, user)) {
            return res.status(403).json({ success: false, message: "Unauthorized." });
        }

        conversation.escalation = {
            isEscalated: true,
            reason: (reason || "Reseller requested Super Admin assistance").trim(),
            requestedAt: new Date(),
            requestedBy: user._id,
            resolvedAt: null,
        };

        conversation.events.push({
            eventType: "escalated",
            actor: user._id,
            actorRole: user.role,
            note: reason || "Escalation requested",
            timestamp: new Date(),
        });

        await conversation.save();

        // Real-time alert to Super Admin room (sanitized summary, no private leak)
        try {
            notifyRole("Super Admin", "SUPPORT_ESCALATION_ALERT", {
                conversationId: conversation._id,
                subject: conversation.subject,
                reason: conversation.escalation.reason,
                requestedAt: conversation.escalation.requestedAt,
            });
        } catch (err) {
            console.error("Socket escalation alert error:", err);
        }

        return res.status(200).json({
            success: true,
            message: "Conversation escalated to Super Admin.",
            data: sanitizeConversation(conversation, user.role),
        });
    } catch (error) {
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

        const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(50, Math.max(1, parseInt(limit, 10)));
        const pageLimit = Math.min(50, Math.max(1, parseInt(limit, 10)));

        const [total, conversations] = await Promise.all([
            supportConversationModel.countDocuments(query),
            supportConversationModel.find(query)
                .sort({ "escalation.requestedAt": -1, updatedAt: -1 })
                .skip(skip)
                .limit(pageLimit)
                .populate("user", "username email dp_img")
                .populate("reseller", "username email dp_img"),
        ]);

        return res.status(200).json({
            success: true,
            total,
            page: parseInt(page, 10),
            data: conversations.map((c) => sanitizeConversation(c, "Super Admin")),
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
        const mediaInfo = await processAndSaveSupportMedia(
            file.buffer,
            file.originalname,
            clientDuration
        );

        const attachment = await supportAttachmentModel.create({
            conversationId: conversation._id,
            uploader: user._id,
            uploaderRole: user.role,
            originalName: mediaInfo.originalName,
            storageReference: mediaInfo.storageReference,
            mimeType: mediaInfo.mimeType,
            mediaType: mediaInfo.mediaType,
            sizeBytes: mediaInfo.sizeBytes,
            durationSeconds: mediaInfo.durationSeconds,
            isProcessed: true,
        });

        return res.status(201).json({
            success: true,
            data: sanitizeAttachment(attachment, user.role),
        });
    } catch (error) {
        console.error("uploadAttachment error:", error);
        return res.status(400).json({ success: false, message: error.message });
    }
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
        res.setHeader("Content-Type", attachment.mimeType);

        if (isDownload) {
            res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(attachment.originalName)}"`);
        } else {
            res.setHeader("Content-Disposition", "inline");
        }

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    } catch (error) {
        console.error("serveAttachment error:", error);
        return res.status(500).json({ success: false, message: "Failed to stream media." });
    }
}

