import { Worker } from "bullmq";
import mongoose from "mongoose";
import { redisConnection } from "../config/redis.js";
import campaignModel from "../models/campaign.model.js";
import userModel from "../models/user.model.js";
import walletModel from "../models/wallet.model.js";
import transactionModel from "../models/transaction.model.js";
import { notifyUser, notifyRole, notifyReseller } from "../services/socket.service.js";
import { creditAmount, creditDifference, creditsForCount, creditTransactionOptions } from "../helpers/credit-amount.js";
import { campaignPublicStatus } from "../helpers/campaign-visibility.js";

let campaignWorker = null;

export async function finalizeCampaignDelivery(campaignId) {
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            // Reload on every transaction retry; never save a stale worker snapshot
            // over an admin's failed status, published report, or refund total.
            const campaign = await campaignModel.findById(campaignId).session(session);
            if (!campaign || campaign.status !== "ongoing" || campaign.manualStatusOverride || campaign.campaignSummary?.reportedBy) {
                result = { success: true, skipped: true, status: campaign?.status };
                return;
            }
            const recipients = campaign.recipients || [];
            if (!recipients.length || recipients.some((row) => !["delivered", "read", "failed"].includes(row.status))) {
                result = { success: true, skipped: true, status: "ongoing", reason: "Awaiting actual delivery results or an admin report" };
                return;
            }
            const failed = recipients.filter((row) => row.status === "failed").length;
            const read = recipients.filter((row) => row.status === "read").length;
            const delivered = recipients.length - failed;
            const [totals] = await transactionModel.aggregate([
                { $match: { campaignId: campaign._id, $or: [{ type: "REFUND" }, { type: "DEDUCT", refundOperationId: { $exists: true } }] } },
                { $group: { _id: null, total: { $sum: { $cond: [{ $eq: ["$type", "REFUND"] }, "$amount", { $multiply: ["$amount", -1] }] } } } },
            ]).session(session);
            const settled = creditAmount(totals?.total || 0);
            const charged = creditAmount(campaign.creditsDeducted || 0);
            if (settled < 0 || settled > charged) throw new Error("Campaign ledger does not reconcile; automatic billing stopped");
            const owner = await userModel.findById(campaign.userId).session(session);
            if (!owner) throw new Error("Campaign creator not found");
            const target = Math.min(charged, Math.max(settled, creditsForCount(campaign.rateSnapshot ?? owner.ratePerMsg, failed)));
            const amount = owner.role === "Super Admin" ? 0 : creditDifference(target, settled);
            let refund = null;
            if (amount > 0) {
                const wallet = await walletModel.findOneAndUpdate(
                    { userId: campaign.userId },
                    { $inc: { balance: amount }, $setOnInsert: { resellerId: owner.resellerId || null } },
                    { returnDocument: "after", upsert: true, session }
                );
                const [entry] = await transactionModel.create([{
                    fromUser: null, toUser: campaign.userId, performedBy: campaign.userId,
                    campaignId: campaign._id, refundOperationId: new mongoose.Types.ObjectId(),
                    type: "REFUND", amount, rateSnapshot: campaign.rateSnapshot ?? owner.ratePerMsg,
                    balanceAfterTo: wallet.balance,
                    notes: `Delivery refund for ${failed} failed recipient(s) in campaign "${campaign.campaignTitle}"`,
                }], { session });
                refund = { amount, newBalance: wallet.balance, transactionId: entry._id };
            }
            if (!campaign.campaignSummary) campaign.campaignSummary = {};
            Object.assign(campaign.campaignSummary, { sent: recipients.length, delivered, read, failed, creditsRefunded: creditAmount(settled + amount), reportedAt: new Date(), reportedBy: null });
            campaign.status = "completed";
            campaign.campaignEndDate = new Date();
            await campaign.save({ session });
            result = { success: true, campaignId: campaign._id, campaignTitle: campaign.campaignTitle, userId: campaign.userId, status: "completed", publicStatus: campaignPublicStatus(campaign), delivered, failed, sent: recipients.length, creditsRefunded: campaign.campaignSummary.creditsRefunded, completedAt: campaign.campaignEndDate, refund };
        }, creditTransactionOptions);
    } finally { await session.endSession(); }
    // No success event is emitted from an aborted transaction or a retry callback.
    if (!result.skipped) {
        const { userId, refund, publicStatus, ...update } = result;
        notifyUser(userId, "CAMPAIGN_UPDATED", { ...update, status: publicStatus });
        notifyRole("Super Admin", "CAMPAIGN_UPDATED", update);
        if (refund) notifyUser(userId, "WALLET_UPDATED", { campaignId: result.campaignId, newBalance: refund.newBalance, delta: refund.amount, reason: "REFUND" });
    }
    return result;
}

export async function processCampaignJob(campaignId) {
    if (process.env.CAMPAIGN_WORKFLOW_ENABLED === "true") {
        const { runCampaignWorkflow } = await import("../services/campaign-workflow.service.js");
        return runCampaignWorkflow(campaignId);
    }
    let campaign = await campaignModel.findById(campaignId);
    if (!campaign) return { success: false, reason: "Campaign not found" };

    // If campaign was in "scheduled" status, the scheduled time has arrived! Auto-transition to "ongoing"
    if (campaign.status === "scheduled") {
        campaign.status = "ongoing";
        campaign.campaignStartDate = new Date();
        await campaign.save();

        const updateData = {
            campaignId: campaign._id,
            campaignTitle: campaign.campaignTitle,
            status: "ongoing",
            startDate: campaign.campaignStartDate,
        };
        notifyUser(campaign.userId, "CAMPAIGN_UPDATED", updateData);
        notifyRole("Super Admin", "CAMPAIGN_UPDATED", updateData);
        if (campaign.userId?.resellerId) {
            notifyReseller(campaign.userId.resellerId, "CAMPAIGN_UPDATED", updateData);
        }
        console.log(`[Worker] Scheduled campaign "${campaign.campaignTitle}" (${campaign._id}) is now ONGOING.`);
    }

    if (campaign.status === "ongoing") {
        return await finalizeCampaignDelivery(campaignId);
    }

    return { success: true, status: campaign.status };
}

export function initCampaignWorker() {
    if (campaignWorker) return campaignWorker;
    campaignWorker = new Worker(
        "campaignQueue",
        async (job) => processCampaignJob(job.data.campaignId),
        { connection: redisConnection, concurrency: 5 }
    );
    campaignWorker.on("failed", (job, error) => console.error(`[Worker] Campaign job ${job?.id} failed:`, error.message));
    return campaignWorker;
}

export const getCampaignWorker = () => campaignWorker;
export async function closeCampaignWorker() {
    if (campaignWorker) { await campaignWorker.close(); campaignWorker = null; }
}
export default { initCampaignWorker, getCampaignWorker, closeCampaignWorker };
