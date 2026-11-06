import mongoose from "mongoose";

const schema = new mongoose.Schema({
    _id: { type: mongoose.Schema.Types.ObjectId, ref: "Campaign" },
    stage: { type: String, enum: ["pending_approval", "ready", "waiting_webhook", "settling", "completed", "cancelled"], required: true },
    dispatchKey: { type: String, required: true, immutable: true },
    providerJobId: String,
    nextRunAt: { type: Date, default: Date.now },
    attempts: { type: Number, default: 0 },
    lastError: String,
    lease: String,
    leaseUntil: Date,
    dispatchedAt: Date,
    dispatchStartedAt: Date,
    completedAt: Date,
    completion: mongoose.Schema.Types.Mixed,
    completionHash: String,
}, { timestamps: true, collection: "campaign_workflows" });
schema.index({ stage: 1, nextRunAt: 1, leaseUntil: 1 });
schema.index({ dispatchKey: 1 }, { unique: true });
export default mongoose.models.CampaignWorkflow || mongoose.model("CampaignWorkflow", schema);
