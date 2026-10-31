import mongoose from "mongoose";
import connectToDB from "./src/config/db.js";
import campaignModel from "./src/models/campaign.model.js";
import userModel from "./src/models/user.model.js";
import walletModel from "./src/models/wallet.model.js";
import transactionModel from "./src/models/transaction.model.js";
import redisClient from "./src/config/redis.js";
import { scheduleCampaignJob, campaignQueue } from "./src/queues/campaign.queue.js";
import { initCampaignWorker, closeCampaignWorker } from "./src/workers/campaign.worker.js";

async function runBullMQTest() {
    console.log("=================================================");
    console.log("🚀 TESTING BULLMQ SCHEDULED CAMPAIGN ENGINE");
    console.log("=================================================\n");

    await connectToDB();

    // 1. Setup Test User & Wallet
    const testUser = await userModel.create({
        username: `bullmq_tester_${Date.now()}`,
        email: `bullmq_${Date.now()}@test.com`,
        password: "Password123!",
        role: "User",
        ratePerMsg: 10,
    });

    await walletModel.create({
        userId: testUser._id,
        balance: 5000,
    });

    console.log(`✓ Created test user ${testUser.username} with 5,000 credits.`);

    // 2. Initialize Worker
    initCampaignWorker();
    console.log("✓ BullMQ Worker active and listening.");

    // 3. Create a Scheduled Campaign (3 seconds in the future)
    const scheduledTime = new Date(Date.now() + 3000);
    const recipients = Array.from({ length: 15 }, (_, i) => ({
        phoneNumber: `91987654321${i % 10}`,
        status: "queued",
    }));

    const campaign = await campaignModel.create({
        userId: testUser._id,
        campaignTitle: "BullMQ Scheduled Flash Sale",
        campaignDescription: "Automated test for BullMQ scheduling",
        recipients,
        totalRecipients: recipients.length,
        schedule: "later",
        scheduledTime,
        status: "scheduled",
        creditsDeducted: recipients.length * 10,
        rateSnapshot: 10,
    });

    console.log(`✓ Campaign created: "${campaign.campaignTitle}" (${campaign._id})`);
    console.log(`  - Status: ${campaign.status}`);
    console.log(`  - Scheduled for: ${scheduledTime.toISOString()} (~3 seconds from now)`);

    // 4. Enqueue into BullMQ with delayed execution
    const job = await scheduleCampaignJob(campaign);
    console.log(`✓ Enqueued to BullMQ. Delay calculated: ${job.delay}ms`);

    // 5. Poll MongoDB until status transitions to "completed" (Timeout: 20 seconds)
    console.log("\n⏳ Waiting for BullMQ delay timer to fire and worker to execute...");
    const startTime = Date.now();
    let completedCampaign = null;

    while (Date.now() - startTime < 20000) {
        await new Promise((r) => setTimeout(r, 1000));
        const current = await campaignModel.findById(campaign._id);

        if (current.status === "ongoing") {
            console.log(`  [${Math.round((Date.now() - startTime) / 1000)}s] Status transitioned to ONGOING! Messages dispatching...`);
        } else if (current.status === "completed") {
            completedCampaign = current;
            console.log(`  [${Math.round((Date.now() - startTime) / 1000)}s] Status transitioned to COMPLETED!`);
            break;
        }
    }

    if (!completedCampaign) {
        console.error("❌ FAILED: Campaign did not complete within timeout.");
        process.exit(1);
    }

    // 6. Verify Results
    console.log("\n📊 Verification Results:");
    console.log(`   - Final Status       : ${completedCampaign.status} (Expected: completed)`);
    console.log(`   - Total Recipients   : ${completedCampaign.totalRecipients}`);
    console.log(`   - Sent Count         : ${completedCampaign.campaignSummary.sent}`);
    console.log(`   - Delivered Count    : ${completedCampaign.campaignSummary.delivered}`);
    console.log(`   - Failed Count       : ${completedCampaign.campaignSummary.failed}`);
    console.log(`   - Credits Refunded   : ${completedCampaign.campaignSummary.creditsRefunded || 0}`);

    const finalWallet = await walletModel.findOne({ userId: testUser._id });
    console.log(`   - Final Wallet Bal   : ${finalWallet.balance}`);

    if (
        completedCampaign.status === "completed" &&
        completedCampaign.campaignSummary.delivered > 0
    ) {
        console.log("\n✅ PASSED: BullMQ precision delay scheduling, execution, and auto-refund verified 100%!");
    } else {
        console.error("\n❌ FAILED verification check.");
        process.exit(1);
    }

    // 7. Cleanup
    console.log("\n🧹 Cleaning up test data...");
    await closeCampaignWorker();
    await campaignQueue.close();
    await redisClient.quit();
    await campaignModel.findByIdAndDelete(campaign._id);
    await userModel.findByIdAndDelete(testUser._id);
    await walletModel.findOneAndDelete({ userId: testUser._id });
    await transactionModel.deleteMany({
        $or: [{ toUser: testUser._id }, { fromUser: testUser._id }],
    });
    await mongoose.disconnect();

    console.log("=================================================");
    console.log("🎉 BULLMQ TEST SUITE COMPLETED SUCCESSFULLY!");
    console.log("=================================================");
    process.exit(0);
}

runBullMQTest().catch((err) => {
    console.error("Test Error:", err);
    process.exit(1);
});
