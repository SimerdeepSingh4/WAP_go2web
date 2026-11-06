import { randomUUID } from "node:crypto";
import Workflow from "../models/campaign-workflow.model.js";

export const workflowEnabled = () => process.env.CAMPAIGN_WORKFLOW_ENABLED === "true";
export async function syncCampaignWorkflow(campaign, session) {
    if (!workflowEnabled() || campaign.$locals?.skipWorkflowSync) return;
    const approved = ["ongoing", "scheduled"].includes(campaign.status) && !campaign.manualStatusOverride;
    const nextRunAt = (campaign.status === "scheduled" || campaign.schedule === "later") && campaign.scheduledTime ? new Date(campaign.scheduledTime) : new Date();
    await Workflow.updateOne({ _id: campaign._id }, { $setOnInsert: {
        stage: approved ? "ready" : "pending_approval", dispatchKey: randomUUID(), nextRunAt,
    } }, { upsert: true, session });
    if (approved) await Workflow.updateOne({ _id: campaign._id, stage: { $in: ["pending_approval", "ready"] }, dispatchStartedAt: { $exists: false } }, { $set: { stage: "ready", nextRunAt } }, { session });
    if (["pending", "paused"].includes(campaign.status)) await Workflow.updateOne({ _id: campaign._id, stage: "ready", dispatchStartedAt: { $exists: false } }, { $set: { stage: "pending_approval" } }, { session });
    if (["stopped", "failed", "completed", "sent"].includes(campaign.status)) {
        await Workflow.updateOne({ _id: campaign._id, stage: { $nin: ["completed", "cancelled"] } }, { $set: { stage: "cancelled", completedAt: new Date() } }, { session });
    }
}
