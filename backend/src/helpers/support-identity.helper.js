/**
 * Identity Filtering & Sanitization Helper for Support Conversations
 * 
 * Rules:
 * 1. For a regular User:
 *    - Reseller is shown with displayRole: "Admin", displayName: Reseller's username (or company name / "Support Admin")
 *    - Super Admin is shown ONLY as displayRole: "Super Admin", displayName: "Super Admin", with NO personal name, email, avatar, or account ID.
 * 2. For a Reseller:
 *    - Assigned User is shown with their real identity.
 *    - Super Admin is shown ONLY as displayRole: "Super Admin", displayName: "Super Admin", with NO personal info.
 * 3. For a Super Admin:
 *    - All real staff/reseller/user identities, emails, account IDs, and audit records remain visible internally for accountability.
 */

export function sanitizeSenderIdentity(sender, senderRole, viewerRole) {
    const rawId = sender?._id ? String(sender._id) : (sender ? String(sender) : null);
    const username = sender?.username || "Support Agent";
    const avatar = sender?.dp_img || "";

    // Super Admin viewer sees internal audit details
    if (viewerRole === "Super Admin") {
        return {
            id: rawId,
            displayName: username,
            displayRole: senderRole,
            actualRole: senderRole,
            avatar,
            email: sender?.email || null,
        };
    }

    // When sender is Super Admin
    if (senderRole === "Super Admin") {
        return {
            id: "system-super-admin",
            displayName: "Super Admin",
            displayRole: "Super Admin",
            avatar: null, // Strictly hidden
            email: null,  // Strictly hidden
        };
    }

    // When sender is Reseller
    if (senderRole === "Reseller") {
        if (viewerRole === "User") {
            return {
                id: rawId,
                displayName: username,
                displayRole: "Admin", // Masked as Admin for user dashboard
                avatar,
            };
        }
        // Reseller looking at their own message
        return {
            id: rawId,
            displayName: username,
            displayRole: "Reseller",
            avatar,
        };
    }

    // When sender is regular User
    return {
        id: rawId,
        displayName: username,
        displayRole: "User",
        avatar,
    };
}

export function sanitizeAttachment(attachment, viewerRole) {
    if (!attachment) return null;
    const att = attachment.toObject ? attachment.toObject() : { ...attachment };

    // Mask uploader details if uploader was Super Admin
    if (att.uploaderRole === "Super Admin" && viewerRole !== "Super Admin") {
        delete att.uploader;
        const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/quicktime": "mov", "audio/wav": "wav", "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx" }[att.mimeType] || "bin";
        att.originalName = `${att.mediaType || "support"}-attachment.${extension}`;
    }

    // Don't expose internal disk path to client
    delete att.storageReference;

    // Provide authorized download/view URL
    att.downloadUrl = `/api/support/attachments/${att._id}/download`;
    att.viewUrl = `/api/support/attachments/${att._id}/view`;

    return att;
}

export function sanitizeMessage(messageDoc, viewerRole) {
    if (!messageDoc) return null;
    const msg = messageDoc.toObject ? messageDoc.toObject() : { ...messageDoc };

    const senderObj = msg.sender && typeof msg.sender === "object" ? msg.sender : null;
    msg.senderIdentity = sanitizeSenderIdentity(senderObj || msg.sender, msg.senderRole, viewerRole);

    if (viewerRole !== "Super Admin") {
        // Obfuscate real internal sender ID if Super Admin
        if (msg.senderRole === "Super Admin") {
            msg.sender = "system-super-admin";
        }
    }

    if (Array.isArray(msg.attachments)) {
        msg.attachments = msg.attachments.map((att) => sanitizeAttachment(att, viewerRole));
    }

    return msg;
}

export function sanitizeConversation(conversationDoc, viewerRole) {
    if (!conversationDoc) return null;
    const doc = conversationDoc.toObject ? conversationDoc.toObject() : { ...conversationDoc };

    if (viewerRole !== "Super Admin") {
        const ownIds = [doc.user?._id || doc.user, ...(doc.reseller?.role === "Super Admin" ? [] : [doc.reseller?._id || doc.reseller])].map(String);
        doc.participantReadPositions = Object.fromEntries(Object.entries(doc.participantReadPositions instanceof Map ? Object.fromEntries(doc.participantReadPositions) : doc.participantReadPositions || {}).filter(([id]) => ownIds.includes(id)));
        if (doc.reseller?.role === "Super Admin") doc.reseller = { username: "Super Admin", displayRole: "Super Admin" };
    }

    // Sanitize user view
    if (viewerRole === "User") {
        if (doc.reseller && typeof doc.reseller === "object") {
            doc.reseller = {
                _id: doc.reseller._id,
                username: doc.reseller.username || "Support Admin",
                displayRole: doc.reseller.displayRole || "Admin",
                dp_img: doc.reseller.dp_img || "",
            };
        }

        // Mask escalation internal requester if staff
        if (doc.escalation?.isEscalated) {
            doc.escalation = {
                isEscalated: true,
                statusLabel: "In Review with Specialist Support",
                resolvedAt: doc.escalation.resolvedAt,
            };
        }
    } else if (viewerRole === "Reseller") {
        if (doc.escalation?.isEscalated) {
            doc.escalation = {
                isEscalated: true,
                reason: doc.escalation.reason,
                resolvedAt: doc.escalation.resolvedAt,
                requestedAt: doc.escalation.requestedAt,
                statusLabel: "Escalated to Super Admin",
            };
        }
    }

    // Mask conversation events
    if (Array.isArray(doc.events)) {
        doc.events = doc.events.map((evt) => {
            const sanitized = { ...evt };
            if (viewerRole !== "Super Admin" && evt.actorRole === "Super Admin") {
                sanitized.actor = "system-super-admin";
                sanitized.note = "Super Admin updated the conversation.";
                delete sanitized.metadata;
            }
            return sanitized;
        });
    }

    return doc;
}
