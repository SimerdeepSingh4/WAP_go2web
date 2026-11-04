import { Queue } from "bullmq";
import { redisConnection } from "../config/redis.js";

/**
 * BullMQ Campaign Queue
 * ---------------------
 * Handles precision timing for scheduled WhatsApp campaigns and
 * offloads dispatch processing from the main HTTP request loop.
 */
export const campaignQueue = new Queue("campaignQueue", {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5000,
        },
        removeOnComplete: {
            count: 1000, // Retain last 1,000 completed jobs in Redis for audit
        },
        removeOnFail: {
            count: 500, // Retain failed jobs for inspection
        },
    },
});

/**
 * Enqueue a campaign for dispatch (either immediately or delayed).
 * Note: BullMQ custom jobIds cannot contain ":" so we use "_" instead.
 * @param {object} campaign - Campaign Mongoose document
 * @returns {Promise<import("bullmq").Job>}
 */
export async function scheduleCampaignJob(campaign) {
    if (campaign.status !== "ongoing") return null;
    const campaignId = campaign._id.toString();
    const jobId = `campaign_${campaignId}`;
    const previousJob = await campaignQueue.getJob(jobId);
    if (previousJob && ["completed", "failed"].includes(await previousJob.getState())) {
        // A stale unapproved job may have been skipped and retained by BullMQ.
        // Release its ID so the admin's approval can enqueue a fresh dispatch.
        await previousJob.remove();
    }

    let delay = 0;
    if (campaign.schedule === "later" && campaign.scheduledTime) {
        const scheduledTimeMs = new Date(campaign.scheduledTime).getTime();
        delay = Math.max(0, scheduledTimeMs - Date.now());
    }

    const job = await campaignQueue.add(
        "dispatchCampaign",
        {
            campaignId,
            userId: campaign.userId?.toString(),
            campaignTitle: campaign.campaignTitle,
            totalRecipients: campaign.totalRecipients || campaign.recipients?.length || 0,
        },
        {
            jobId,
            delay,
        }
    );

    console.log(
        `[BullMQ] Enqueued campaign "${campaign.campaignTitle}" (${campaignId}) | Delay: ${delay}ms | Job ID: ${job.id}`
    );
    return job;
}

/**
 * Cancel a scheduled job from Redis before it executes.
 * @param {string|mongoose.Types.ObjectId} campaignId
 * @returns {Promise<boolean>}
 */
export async function cancelCampaignJob(campaignId) {
    const jobId = `campaign_${campaignId.toString()}`;
    const job = await campaignQueue.getJob(jobId);
    if (job) {
        await job.remove();
        console.log(`[BullMQ] Cancelled and removed job: ${jobId}`);
        return true;
    }
    return false;
}

/**
 * Get the current queue state for a campaign job.
 * @param {string|mongoose.Types.ObjectId} campaignId
 * @returns {Promise<object|null>}
 */
export async function getCampaignJobStatus(campaignId) {
    const jobId = `campaign_${campaignId.toString()}`;
    const job = await campaignQueue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    return {
        jobId: job.id,
        state,
        progress: job.progress,
        failedReason: job.failedReason,
    };
}

export default {
    campaignQueue,
    scheduleCampaignJob,
    cancelCampaignJob,
    getCampaignJobStatus,
};
