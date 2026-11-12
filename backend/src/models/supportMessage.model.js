import mongoose from "mongoose";

const supportMessageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SupportConversation",
            required: true,
            index: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        senderRole: {
            type: String,
            enum: ["User", "Reseller", "Super Admin"],
            required: true,
        },
        clientMessageId: {
            type: String,
            required: true,
            index: true, 
        },
        sequenceNumber: {
            type: Number,
            required: true,
        },
        text: {
            type: String,
            trim: true,
            maxlength: 4000,
            default: "",
        },
        attachments: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "SupportAttachment",
            },
        ],
    },
    { timestamps: true }
);

// Unique compound index: prevents duplicate sequence per conversation and prevents retry duplicates
supportMessageSchema.index({ conversationId: 1, sequenceNumber: 1 }, { unique: true });
supportMessageSchema.index({ conversationId: 1, clientMessageId: 1 }, { unique: true });

export default mongoose.model("SupportMessage", supportMessageSchema);