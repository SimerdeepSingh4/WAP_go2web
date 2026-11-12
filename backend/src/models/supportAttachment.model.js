import mongoose from "mongoose";

const supportAttachmentSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "SupportConversation",
            required: true,
            index: true,
        },
        uploader: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        uploaderRole: {
            type: String,
            enum: ["User", "Reseller", "Super Admin"],
            required: true,
        },
        originalName: { type: String, required: true },
        storageReference: { type: String, required: true }, // Local private disk path or secure blob key
        mimeType: { type: String, required: true },
        mediaType: {
            type: String,
            enum: ["image", "video", "audio"],
            required: true,
        },
        sizeBytes: { type: Number, required: true },
        durationSeconds: { type: Number, default: null }, // Validated for video/audio (max 30s)
        isProcessed: { type: Boolean, default: true },
    },
    { timestamps: true }
);

export default mongoose.model("SupportAttachment", supportAttachmentSchema);