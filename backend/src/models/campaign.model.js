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
        // Multiple images support
        images: [
            {
                url: {
                    type: String,
                    required: [true, "Image URL or path is required"],
                    trim: true,
                },
                caption: {
                    type: String,
                    trim: true,
                    default: "",
                },
                filename: {
                    type: String,
                    trim: true,
                },
                mimetype: {
                    type: String,
                    trim: true,
                    default: "image/jpeg",
                },
                size: {
                    type: Number,
                    default: 0,
                },
            },
        ],
        // Audio support (single or multiple, regular audio or PTT voice notes)
        audio: [
            {
                url: {
                    type: String,
                    required: [true, "Audio URL or path is required"],
                    trim: true,
                },
                filename: {
                    type: String,
                    trim: true,
                },
                mimetype: {
                    type: String,
                    trim: true,
                    default: "audio/mp4",
                },
                isVoiceNote: {
                    type: Boolean,
                    default: false,
                },
                duration: {
                    type: Number,
                    default: 0,
                },
                size: {
                    type: Number,
                    default: 0,
                },
            },
        ],
        // Video support (single or multiple, with individual video thumbnails)
        video: [
            {
                url: {
                    type: String,
                    required: [true, "Video URL or path is required"],
                    trim: true,
                },
                caption: {
                    type: String,
                    trim: true,
                    default: "",
                },
                filename: {
                    type: String,
                    trim: true,
                },
                mimetype: {
                    type: String,
                    trim: true,
                    default: "video/mp4",
                },
                thumbnail: {
                    type: String,
                    trim: true,
                    default: null,
                },
                duration: {
                    type: Number,
                    default: 0,
                },
                size: {
                    type: Number,
                    default: 0,
                },
            },
        ],
        // Top-level thumbnail option (for campaign preview, video/audio preview, or link preview)
        thumbnail: {
            type: String,
            trim: true,
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
            enum: ["text", "image", "document", "video", "audio", "mixed", "media"],
            default: "text",
        },
        status: {
            type: String,
            enum: [
                "draft",      // Automatic: Saved as draft
                "scheduled",  // Automatic: Scheduled for a future time
                "pending",    // Automatic: Queued for execution
                "ongoing",    // Automatic: Currently dispatching messages
                "completed",  // Automatic: All messages dispatched
                "sent",       // Backward-compatible alias for completed
                "paused",     // Manual Admin: Temporarily paused
                "stopped",    // Manual Admin: Terminated / cancelled
                "failed",     // Manual Admin / System: Encountered failure / banned
            ],
            default: "draft",
        },
        campaignSummary: {
            sent: {
                type: Number,
                default: 0,
            },
            delivered: {
                type: Number,
                default: 0,
            },
            read: {
                type: Number,
                default: 0,
            },
            failed: {
                type: Number,
                default: 0,
            },
            adminNotes: {
                type: String,
                trim: true,
                default: "",
            },
            reportedAt: {
                type: Date,
                default: null,
            },
            reportedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                default: null,
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
        // Single-campaign duplicate and recipient validation statistics
        recipientStats: {
            totalSubmitted: {
                type: Number,
                default: 0,
            },
            uniqueCount: {
                type: Number,
                default: 0,
            },
            duplicateCount: {
                type: Number,
                default: 0,
            },
            invalidCount: {
                type: Number,
                default: 0,
            },
            duplicatesList: [
                {
                    type: String,
                    trim: true,
                },
            ],
        },
    },
    {
        timestamps: true,
    }
);

campaignSchema.index({ userId: 1, createdAt: -1 });

const campaignModel = mongoose.model("Campaign", campaignSchema);

export default campaignModel;
