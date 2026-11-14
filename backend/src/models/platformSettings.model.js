import mongoose from "mongoose";
import { DEFAULT_MEDIA_UPLOAD_LIMITS, MAX_MEDIA_UPLOAD_MB } from "../../../shared/mediaUploadLimits.js";

const schema = new mongoose.Schema({
    _id: { type: String, default: "platform" },
    mediaUploadLimits: Object.fromEntries(Object.entries(DEFAULT_MEDIA_UPLOAD_LIMITS).map(([key, value]) => [key, {
        type: Number, default: value, min: 1, max: MAX_MEDIA_UPLOAD_MB,
    }])),
    dailyCampaignLimit: {
        type: Number,
        default: 10,
        min: 1,
        max: 1000,
    },
    defaultRatePerMsg: {
        type: Number,
        default: 1,
        min: 0.01,
        max: 1000,
    },
    lowBalanceThreshold: {
        type: Number,
        default: 500,
        min: 0,
    },
    creditExpiryValue: {
        type: Number,
        default: 2,
        min: 0,
    },
    creditExpiryUnit: {
        type: String,
        enum: ["years", "months", "days", "never"],
        default: "years",
    },
    maxAllowedDevices: {
        type: Number,
        default: 3,
        min: 1,
        max: 10,
    },
    autoRefundEnabled: {
        type: Boolean,
        default: true,
    },
    strictOverdraftProtection: {
        type: Boolean,
        default: true,
    },
    startTime: {
        type: String,
        default: "09:00",
    },
    endTime: {
        type: String,
        default: "19:00",
    },
    outOfWindowBehavior: {
        type: String,
        default: "queue",
    },
    deviceEvictionStrategy: {
        type: String,
        default: "fifo",
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
}, { timestamps: true });

export default mongoose.model("platformSettings", schema);
