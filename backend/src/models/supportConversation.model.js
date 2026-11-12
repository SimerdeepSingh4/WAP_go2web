import mongoose from "mongoose";

const conversationEventSchema = new mongoose.Schema(
    {
        eventType: {
            type: String,
            enum: ["created", "escalated", "staff_intervention", "resolved", "reopened", "reseller_reassigned"],
            required: true,
        },
        actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        actorRole: { type: String, enum: ["User", "Reseller", "Super Admin"], required: true },
        note: { type: String, default: "" },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
        timestamp: { type: Date, default: Date.now },
    },
    { _id: false }
);

const supportConversationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        reseller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        subject: {
            type: String,
            required: [true, "Subject is required"],
            trim: true,
            maxlength: 150,
        },
        status: {
            type: String,
            enum: ["open", "resolved", "reopened"],
            default: "open",
            index: true,
        },
        escalation: {
            isEscalated: { type: Boolean, default: false, index: true },
            reason: { type: String, default: "" },
            requestedAt: { type: Date, default: null },
            requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
            resolvedAt: { type: Date, default: null },
        },
        nextSequenceNumber: {
            type: Number,
            default: 1,
        },
        latestActivity: {
            messageText: { type: String, default: "" },
            sentAt: { type: Date, default: Date.now },
            senderRole: { type: String, default: "User" },
        },
        participantReadPositions: {
            type: Map,
            of: new mongoose.Schema({
                lastReadSequence: { type: Number, default: 0 },
                lastReadAt: { type: Date, default: Date.now },
            }, { _id: false }),
            default: {},
        },
        events: [conversationEventSchema],
    },
    { timestamps: true }
);

supportConversationSchema.index({ user: 1, status: 1 });
supportConversationSchema.index({ reseller: 1, status: 1 });
supportConversationSchema.index({ "escalation.isEscalated": 1, updatedAt: -1 });

export default mongoose.model("SupportConversation", supportConversationSchema);