import { Worker } from "bullmq";
import { redisConnection } from "../config/redis.js";
import campaignModel from "../models/campaign.model.js";

let campaignWorker = null;

// Kept for callers and retained jobs from earlier releases. Campaign delivery,
// status decisions, refunds, and publication are handled by manual API actions.
export async function finalizeCampaignDelivery(campaignId) {
    const campaign = await campaignModel.findById(campaignId).session(null);
    return {
        success: Boolean(campaign), skipped: true, status: campaign?.status,
        reason: campaign ? "Campaign records and report publication are managed manually" : "Campaign not found",
    };
}

export async function processCampaignJob(campaignId) {
    return finalizeCampaignDelivery(campaignId);
}

export function initCampaignWorker() {
    if (campaignWorker) return campaignWorker;
    campaignWorker = new Worker(
        "campaignQueue",
        async (job) => processCampaignJob(job.data.campaignId),
        { connection: redisConnection, concurrency: 5 }
    );
    campaignWorker.on("failed", (job, error) => console.error(`[Worker] Campaign job ${job?.id} failed:`, error.message));
    campaignWorker.on("error", (error) => console.error("[Worker] Campaign worker connection error:", error.message));
    return campaignWorker;
}

export const getCampaignWorker = () => campaignWorker;
export async function closeCampaignWorker() {
    if (campaignWorker) { await campaignWorker.close(); campaignWorker = null; }
}
export default { initCampaignWorker, getCampaignWorker, closeCampaignWorker };
