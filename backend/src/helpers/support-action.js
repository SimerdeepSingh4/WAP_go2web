import mongoose from "mongoose";
import Conversation from "../models/supportConversation.model.js";
import Message from "../models/supportMessage.model.js";
import { hasConversationAccess } from "./support-access.js";
import { emitSupportEvent, notifyUser, notifyRole } from "../services/socket.service.js";

// Action receipts share the transaction with the actual account/credit change.
// A rolled-back action must never leave a success message in the conversation.
export async function recordSupportAction(req, session, accountId, text, operationId) {
    const id = req.body.supportConversationId;
    if (!id) return;
    if (!mongoose.isObjectIdOrHexString(id)) throw Object.assign(new Error("Invalid support conversation."), { statusCode: 400 });
    const conversation = await Conversation.findById(id).session(session);
    if (!hasConversationAccess(conversation, req.user) || String(conversation.user) !== String(accountId)) {
        throw Object.assign(new Error("This action does not belong to the selected conversation."), { statusCode: 403 });
    }
    const updated = await Conversation.findOneAndUpdate({ _id: id }, {
        $inc: { nextSequenceNumber: 1 },
        $set: { "latestActivity.messageText": text, "latestActivity.sentAt": new Date(), "latestActivity.senderRole": req.user.role },
    }, { returnDocument: "after", session });
    const [message] = await Message.create([{
        conversationId: id, sender: req.user._id, senderRole: req.user.role,
        clientMessageId: `action-${operationId}`, sequenceNumber: updated.nextSequenceNumber - 1,
        text, attachments: [],
    }], { session });
    req.supportActionReceipt = { conversation, message };
}

export async function publishSupportAction(req) {
    const receipt = req.supportActionReceipt;
    if (!receipt) return;
    const { conversation, message } = receipt;
    const payload = { conversationId: String(conversation._id) };
    const sender = { _id: req.user._id, username: req.user.username, email: req.user.email, dp_img: req.user.dp_img };
    await Promise.allSettled([
        emitSupportEvent(conversation._id, "SUPPORT_MESSAGE_RECEIVED", { ...message.toObject(), sender }),
        notifyUser(conversation.user, "SUPPORT_CONVERSATION_UPDATED", payload),
        notifyUser(conversation.reseller, "SUPPORT_CONVERSATION_UPDATED", payload),
        notifyRole("Super Admin", "SUPPORT_CONVERSATION_UPDATED", payload),
    ]);
}
