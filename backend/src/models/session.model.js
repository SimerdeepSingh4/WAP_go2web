import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        parentSessionId: { type: mongoose.Schema.Types.ObjectId, ref: "Session", default: null, index: true },
        tokenHash: {
            type: String,
            required: true,
            unique: true,
        },
        ip: {
            type: String,
            default: null,
        },
        userAgent: {
            type: String,
            default: null,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const sessionModel = mongoose.model("Session", sessionSchema);

export default sessionModel;
