import mongoose from "mongoose";
import { DEFAULT_MEDIA_UPLOAD_LIMITS, MAX_MEDIA_UPLOAD_MB } from "../../../shared/mediaUploadLimits.js";

const schema = new mongoose.Schema({
    _id: { type: String, default: "platform" },
    mediaUploadLimits: Object.fromEntries(Object.entries(DEFAULT_MEDIA_UPLOAD_LIMITS).map(([key, value]) => [key, {
        type: Number, default: value, min: 1, max: MAX_MEDIA_UPLOAD_MB,
    }])),
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
}, { timestamps: true });

export default mongoose.model("platformSettings", schema);
