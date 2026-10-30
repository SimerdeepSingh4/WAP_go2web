import mongoose from "mongoose";

const campaignSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User ID is required"],
            index: true,
        },
        campaignTitle: {
            type: String,
            required: [true, "Campaign title is required"],
            trim: true,
        },
        campaignDescription: {
            type: String,
            required: [true, "Campaign description is required"],
            trim: true,
        },
        templateId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Template",
            default: null,
        },
        messageBody: {
            type: String,
            trim: true,
            maxLength: [1024, "Message body cannot be greater than 1024 characters"],
            default: "",
        },
        recipients: [
            {
                contactId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Contact",
                },
                phoneNumber: {
                    type: String,
                    trim: true,
                },
                status: {
                    type: String,
                    enum: ["queued", "sent", "delivered", "failed"],
                    default: "queued",
                },
            },
        ],
        schedule: {
            type: String,
            enum: ["now", "later"],
            default: "now",
        },
        scheduledTime: {
            type: Date,
            default: null,
        },
        attachments: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Media",
            },
        ],
        mediaId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Media",
            default: null,
        },
        variables: {
            type: Array,
            default: [],
        },
        totalRecipients: {
            type: Number,
            default: 0,
        },
        messageType: {
            type: String,
            enum: ["text", "image", "document", "video", "audio"],
            default: "text",
        },
        status: {
            type: String,
            enum: ["draft", "pending", "sent", "failed", "scheduled", "paused", "stopped"],
            default: "draft",
        },
        campaignSummary: {
            sent: {
                type: Number,
                default: 0,
            },
            failed: {
                type: Number,
                default: 0,
            },
        },
        campaignStartDate: {
            type: Date,
            default: null,
        },
        campaignEndDate: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

campaignSchema.index({ userId: 1, createdAt: -1 });

const campaignModel = mongoose.model("Campaign", campaignSchema);

export default campaignModel;
