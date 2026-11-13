import mongoose from "mongoose";

const trackedNumberSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    phoneNumber: { type: String, required: true, match: /^\d{7,15}$/ },
    note: { type: String, trim: true, default: "", maxlength: 500 },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

trackedNumberSchema.index({ userId: 1, phoneNumber: 1 }, { unique: true });
export default mongoose.model("TrackedNumber", trackedNumberSchema);
