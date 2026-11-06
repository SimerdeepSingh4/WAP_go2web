import mongoose from "mongoose";
import Workflow from "../models/campaign-workflow.model.js";
import Campaign from "../models/campaign.model.js";
import { campaignQueue } from "../queues/campaign.queue.js";
import { syncCampaignWorkflow, workflowEnabled } from "../helpers/campaign-workflow-outbox.js";
import { providerConfig } from "../helpers/campaign-provider.js";
import { creditTransactionOptions } from "../helpers/credit-amount.js";

let timer, running;
export async function recoverCampaignWorkflows() {
    const now = new Date();
    const workflows = await Workflow.find({ stage: { $in: ["ready", "settling"] }, nextRunAt: { $lte: now }, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: now } }] }).sort({ nextRunAt: 1 }).limit(100).lean();
    for (const workflow of workflows) {
        await campaignQueue.add("resumeCampaignWorkflow", { campaignId: String(workflow._id) }, {
            jobId: `workflow_${workflow._id}`, removeOnComplete: true, removeOnFail: true,
        });
    }
    return workflows.length;
}
export async function startCampaignRecovery() {
    if (!workflowEnabled() || timer || running) return;
    providerConfig();
    // Backfill legacy approved campaigns once. New work is recorded by the
    // campaign's transactional outbox, not by a post-commit Redis call.
    for await (const campaign of Campaign.find({ status: { $in: ["ongoing", "scheduled"] }, manualStatusOverride: { $ne: true }, "publishedSpreadsheet.publishedAt": { $exists: false }, "campaignSummary.reportedBy": null }).cursor()) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const live = await Campaign.findById(campaign._id).session(session);
                if (live && ["ongoing", "scheduled"].includes(live.status)) await syncCampaignWorkflow(live, session);
            }, creditTransactionOptions);
        } finally { await session.endSession(); }
    }
    const tick = () => {
        running = recoverCampaignWorkflows().catch((error) => console.error("Campaign recovery failed:", error.message)).finally(() => {
            running = null; timer = setTimeout(tick, 10000); timer.unref();
        });
    };
    tick();
}
export async function closeCampaignRecovery() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (running) await running;
    if (timer) clearTimeout(timer);
    timer = null;
}
