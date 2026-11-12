import supportConversationModel from "../models/supportConversation.model.js";
import { notifyUser, notifyRole } from "../services/socket.service.js";

/**
 * Updates active support conversations when a user's assigned reseller is changed.
 * Logs conversation events and notifies the old reseller, new reseller, and the user.
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {string|mongoose.Types.ObjectId|null} oldResellerId
 * @param {string|mongoose.Types.ObjectId|null} newResellerId
 * @param {string|mongoose.Types.ObjectId} actorId (Super Admin)
 */
export async function syncResellerReassignment(userId, oldResellerId, newResellerId, actorId) {
    try {
        if (String(oldResellerId || "") === String(newResellerId || "")) {
            return;
        }

        // Find all non-resolved conversations for this user
        const conversations = await supportConversationModel.find({
            user: userId,
            status: { $in: ["open", "reopened"] },
        });

        if (!conversations || conversations.length === 0) return;

        for (const conv of conversations) {
            conv.reseller = newResellerId;
            conv.events.push({
                eventType: "reseller_reassigned",
                actor: actorId,
                actorRole: "Super Admin",
                note: `User's assigned reseller updated from ${oldResellerId || "None"} to ${newResellerId || "Direct/None"}.`,
                metadata: {
                    oldResellerId: oldResellerId ? String(oldResellerId) : null,
                    newResellerId: newResellerId ? String(newResellerId) : null,
                },
                timestamp: new Date(),
            });

            await conv.save();

            // Realtime socket notifications
            if (oldResellerId) {
                notifyUser(oldResellerId, "SUPPORT_CONVERSATION_REVOKED", {
                    conversationId: conv._id,
                    reason: "User has been reassigned to another reseller.",
                });
            }

            if (newResellerId) {
                notifyUser(newResellerId, "SUPPORT_CONVERSATION_ASSIGNED", {
                    conversationId: conv._id,
                    userId,
                    subject: conv.subject,
                });
            }

            // Notify user of update if in room
            notifyUser(userId, "SUPPORT_CONVERSATION_UPDATED", {
                conversationId: conv._id,
                resellerChanged: true,
            });
        }
    } catch (error) {
        console.error("Error in syncResellerReassignment:", error);
    }
}

