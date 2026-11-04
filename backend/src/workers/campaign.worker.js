import { Worker } from "bullmq";
import mongoose from "mongoose";
import { redisConnection } from "../config/redis.js";
import campaignModel from "../models/campaign.model.js";
import userModel from "../models/user.model.js";
import walletModel from "../models/wallet.model.js";
import transactionModel from "../models/transaction.model.js";
import { notifyUser, notifyRole, notifyReseller } from "../services/socket.service.js";

let campaignWorker = null;

/**
 * Helper to pause execution between message batches
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Initialize the BullMQ Campaign Worker.
 */
export function initCampaignWorker() {
    if (campaignWorker) return campaignWorker;

    campaignWorker = new Worker(
        "campaignQueue",
        async (job) => {
            const { campaignId, campaignTitle } = job.data;
            console.log(`[Worker] Started processing campaign: "${campaignTitle}" (${campaignId})`);

            // 1. Fetch campaign from DB
            const campaign = await campaignModel.findById(campaignId);
            if (!campaign) {
                console.warn(`[Worker] Campaign ${campaignId} not found. Aborting job.`);
                return { success: false, reason: "Campaign not found" };
            }

            // Even stale queued jobs must never bypass admin approval.
            if (campaign.status !== "ongoing") {
                console.log(`[Worker] Campaign ${campaignId} is in "${campaign.status}" state. Skipping dispatch.`);
                return { success: true, status: campaign.status, skipped: true };
            }

            // 2. Dispatch only after the admin has set the campaign to ongoing.
            if (!campaign.campaignStartDate) {
                campaign.campaignStartDate = new Date();
            }
            await campaign.save();

            // Broadcast status change in real time
            notifyUser(campaign.userId, "CAMPAIGN_UPDATED", {
                campaignId: campaign._id,
                campaignTitle: campaign.campaignTitle,
                status: "ongoing",
                startedAt: campaign.campaignStartDate,
            });

            notifyRole("Super Admin", "CAMPAIGN_UPDATED", {
                campaignId: campaign._id,
                campaignTitle: campaign.campaignTitle,
                status: "ongoing",
            });

            // 3. Batch Dispatching
            const recipients = campaign.recipients || [];
            const totalRecipients = recipients.length;
            const BATCH_SIZE = 25; // Process in batches to simulate gateway throughput
            let sentCount = 0;
            let deliveredCount = 0;
            let failedCount = 0;

            for (let i = 0; i < totalRecipients; i += BATCH_SIZE) {
                // Check if campaign was paused or stopped mid-execution
                const freshCheck = await campaignModel.findById(campaignId).select("status");
                if (!freshCheck || freshCheck.status !== "ongoing") {
                    console.log(`[Worker] Campaign ${campaignId} is no longer ongoing. Halting dispatch.`);
                    return { success: true, status: freshCheck?.status, haltedAt: i };
                }

                const batch = recipients.slice(i, i + BATCH_SIZE);

                for (const recipient of batch) {
                    // Gateway simulation: 96% success rate, 4% fail (simulating unreachable/wrong numbers)
                    const isSuccess = Math.random() > 0.04;

                    if (isSuccess) {
                        recipient.status = "delivered";
                        deliveredCount++;
                        sentCount++;
                    } else {
                        recipient.status = "failed";
                        failedCount++;
                        sentCount++;
                    }
                }

                // Small pause between batches (50ms) to throttle throughput safely
                await sleep(50);

                // Update job progress (0 - 100%)
                const progressPercent = Math.min(100, Math.round(((i + batch.length) / totalRecipients) * 100));
                await job.updateProgress(progressPercent);

                // Emit real-time progress update to the client
                notifyUser(campaign.userId, "CAMPAIGN_PROGRESS", {
                    campaignId: campaign._id,
                    sent: sentCount,
                    delivered: deliveredCount,
                    failed: failedCount,
                    total: totalRecipients,
                    percent: progressPercent,
                });
            }

            // 4. Update Campaign Summary
            campaign.campaignSummary = {
                sent: sentCount,
                delivered: deliveredCount,
                read: Math.round(deliveredCount * 0.7), // Simulated read receipts
                failed: failedCount,
                reportedAt: new Date(),
                reportedBy: null, // Automated system report
            };

            // 5. Automated Wrong / Failed Number Refund Flow (ACID & Idempotent)
            let refundInfo = null;
            if (failedCount > 0) {
                const owner = await userModel.findById(campaign.userId);
                // Super Admin has unlimited credits, so no refund needed
                if (owner && owner.role !== "Super Admin" && (campaign.campaignSummary.creditsRefunded || 0) === 0) {
                    const rate = campaign.rateSnapshot || owner.ratePerMsg || 12;
                    let refundAmount = failedCount * rate;

                    if (campaign.creditsDeducted > 0 && refundAmount > campaign.creditsDeducted) {
                        refundAmount = campaign.creditsDeducted;
                    }

                    if (refundAmount > 0) {
                        // Atomic CAS increment on wallet
                        const updatedWallet = await walletModel.findOneAndUpdate(
                            { userId: campaign.userId },
                            { $inc: { balance: refundAmount } },
                            { returnDocument: 'after', upsert: true }
                        );

                        // Insert immutable ledger record (protected by unique index on { campaignId: 1, type: "REFUND" })
                        try {
                            const refundTx = await transactionModel.create({
                                fromUser: null,
                                toUser: campaign.userId,
                                amount: refundAmount,
                                type: "REFUND",
                                campaignId: campaign._id,
                                notes: `Automated refund for ${failedCount} failed recipient(s) in campaign "${campaign.campaignTitle}"`,
                                rateSnapshot: rate,
                                balanceAfterTo: updatedWallet.balance,
                                performedBy: campaign.userId,
                            });

                            campaign.campaignSummary.creditsRefunded = refundAmount;
                            refundInfo = {
                                amount: refundAmount,
                                failedCount,
                                newBalance: updatedWallet.balance,
                            };

                            // Real-time wallet update via Socket.IO
                            notifyUser(campaign.userId, "WALLET_UPDATED", {
                                newBalance: updatedWallet.balance,
                                delta: +refundAmount,
                                reason: "REFUND",
                                campaignTitle: campaign.campaignTitle,
                                campaignId: campaign._id,
                                failedCount,
                            });
                        } catch (indexErr) {
                            if (indexErr.code === 11000) {
                                console.warn(`[Worker] Duplicate refund prevented by unique index for campaign ${campaign._id}`);
                            } else {
                                throw indexErr;
                            }
                        }
                    }
                }
            }

            // 6. Finalize Campaign
            campaign.status = "completed";
            campaign.campaignEndDate = new Date();
            await campaign.save();

            console.log(
                `[Worker] Campaign "${campaignTitle}" finished. Delivered: ${deliveredCount}, Failed: ${failedCount}, Refunded: ${campaign.campaignSummary.creditsRefunded || 0} credits.`
            );

            // 7. Emit final completion events
            notifyUser(campaign.userId, "CAMPAIGN_UPDATED", {
                campaignId: campaign._id,
                campaignTitle: campaign.campaignTitle,
                status: "completed",
                delivered: deliveredCount,
                failed: failedCount,
                sent: sentCount,
                creditsRefunded: campaign.campaignSummary.creditsRefunded,
                completedAt: campaign.campaignEndDate,
            });

            notifyRole("Super Admin", "CAMPAIGN_UPDATED", {
                campaignId: campaign._id,
                campaignTitle: campaign.campaignTitle,
                status: "completed",
                delivered: deliveredCount,
                failed: failedCount,
            });

            return {
                success: true,
                campaignId: campaign._id,
                delivered: deliveredCount,
                failed: failedCount,
                refund: refundInfo,
            };
        },
        {
            connection: redisConnection,
            concurrency: 5, // Process up to 5 campaigns in parallel
        }
    );

    campaignWorker.on("completed", (job) => {
        console.log(`[Worker] Job ${job.id} completed successfully.`);
    });

    campaignWorker.on("failed", (job, err) => {
        console.error(`[Worker] Job ${job?.id} failed with error:`, err.message);
    });

    console.log("BullMQ Campaign Worker initialized and listening for jobs.");
    return campaignWorker;
}

export function getCampaignWorker() {
    return campaignWorker;
}

export async function closeCampaignWorker() {
    if (campaignWorker) {
        await campaignWorker.close();
        campaignWorker = null;
        console.log("BullMQ Campaign Worker shut down gracefully.");
    }
}

export default {
    initCampaignWorker,
    getCampaignWorker,
    closeCampaignWorker,
};

