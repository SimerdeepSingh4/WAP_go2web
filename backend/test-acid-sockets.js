import http from "http";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { io as ClientIO } from "socket.io-client";
import connectToDB from "./src/config/db.js";
import config from "./src/config/config.js";
import userModel from "./src/models/user.model.js";
import walletModel from "./src/models/wallet.model.js";
import transactionModel from "./src/models/transaction.model.js";
import sessionModel from "./src/models/session.model.js";
import { deductCredits, reconcileWallet } from "./src/helpers/credit.helper.js";
import { initSocket, notifyUser } from "./src/services/socket.service.js";

async function runTests() {
    console.log("=================================================");
    console.log("🚀 STARTING ACID & SOCKET.IO VERIFICATION SUITE");
    console.log("=================================================\n");

    await connectToDB();

    // Setup temporary test user
    const testEmail = `acid_test_${Date.now()}@example.com`;
    const testUser = await userModel.create({
        username: `acid_user_${Date.now()}`,
        email: testEmail,
        password: "Password123!",
        role: "User",
        ratePerMsg: 10,
    });

    console.log(`✓ Created test user: ${testUser.username} (${testUser._id})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 1: ISOLATION & CONCURRENCY (Race Condition Guard)
    // ─────────────────────────────────────────────────────────────
    console.log("\n🧪 TEST 1: Atomic Compare-And-Swap (Isolation Guard)");
    console.log("   Setting wallet balance to 500 credits.");
    console.log("   Firing 5 simultaneous deduction requests of 200 credits each (Total requested = 1000)...");

    await walletModel.findOneAndUpdate(
        { userId: testUser._id },
        { balance: 500 },
        { upsert: true, new: true }
    );

    // Fire 5 concurrent deductions simultaneously
    const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        deductCredits(testUser._id, 1, null, { directAmount: 200 })
    );

    const results = await Promise.allSettled(concurrentRequests);
    const successes = results.filter((r) => r.status === "fulfilled");
    const failures = results.filter((r) => r.status === "rejected");

    const finalWallet = await walletModel.findOne({ userId: testUser._id });

    console.log(`   - Successful deductions : ${successes.length} (Expected: 2)`);
    console.log(`   - Safely blocked rejected: ${failures.length} (Expected: 3)`);
    console.log(`   - Final Wallet Balance   : ${finalWallet.balance} (Expected: 100)`);

    if (successes.length === 2 && failures.length === 3 && finalWallet.balance === 100) {
        console.log("   ✅ PASSED: No race conditions or negative balances allowed!");
    } else {
        console.error("   ❌ FAILED Isolation test");
        process.exit(1);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: CONSISTENCY (Double-Entry Ledger Reconciliation)
    // ─────────────────────────────────────────────────────────────
    console.log("\n🧪 TEST 2: Double-Entry Invariant Reconciliation (Consistency)");

    // Clean ledger for testUser and populate controlled inflows & outflows
    await transactionModel.deleteMany({
        $or: [{ toUser: testUser._id }, { fromUser: testUser._id }],
    });

    // Inflow: 1000 allocated
    await transactionModel.create({
        fromUser: new mongoose.Types.ObjectId(),
        toUser: testUser._id,
        amount: 1000,
        type: "ALLOCATE",
        performedBy: testUser._id,
    });

    // Inflow: 200 refunded
    await transactionModel.create({
        fromUser: new mongoose.Types.ObjectId(),
        toUser: testUser._id,
        amount: 200,
        type: "REFUND",
        performedBy: testUser._id,
    });

    // Outflow: 400 deducted
    await transactionModel.create({
        fromUser: testUser._id,
        toUser: testUser._id,
        amount: 400,
        type: "DEDUCT",
        performedBy: testUser._id,
    });

    // Calculated ledger = (1000 + 200) - 400 = 800
    await walletModel.findOneAndUpdate(
        { userId: testUser._id },
        { balance: 800 }
    );

    const report = await reconcileWallet(testUser._id);
    console.log(`   - Total Inflow        : ${report.totalInflow} credits`);
    console.log(`   - Total Outflow       : ${report.totalOutflow} credits`);
    console.log(`   - Calculated Balance  : ${report.calculatedBalance} credits`);
    console.log(`   - Actual Wallet       : ${report.currentBalance} credits`);
    console.log(`   - Invariant Reconciled: ${report.isReconciled} (Drift: ${report.drift})`);

    if (report.isReconciled && report.drift === 0 && report.calculatedBalance === 800) {
        console.log("   ✅ PASSED: Wallet Balance strictly equals Sum(Inflow) - Sum(Outflow)!");
    } else {
        console.error("   ❌ FAILED Consistency reconciliation");
        process.exit(1);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: IDEMPOTENCY (Unique Refund Constraint)
    // ─────────────────────────────────────────────────────────────
    console.log("\n🧪 TEST 3: Idempotency Guard (Unique Partial Refund Index)");
    const dummyCampaignId = new mongoose.Types.ObjectId();

    // 1st refund insertion -> must succeed
    await transactionModel.create({
        fromUser: new mongoose.Types.ObjectId(),
        toUser: testUser._id,
        amount: 150,
        type: "REFUND",
        campaignId: dummyCampaignId,
        performedBy: testUser._id,
    });
    console.log("   ✓ First refund inserted successfully.");

    // 2nd refund insertion with identical campaignId -> must be rejected by unique index
    let duplicateBlocked = false;
    try {
        await transactionModel.create({
            fromUser: new mongoose.Types.ObjectId(),
            toUser: testUser._id,
            amount: 150,
            type: "REFUND",
            campaignId: dummyCampaignId,
            performedBy: testUser._id,
        });
    } catch (err) {
        if (err.code === 11000) {
            duplicateBlocked = true;
            console.log(`   ✓ Duplicate refund blocked by MongoDB Index: code ${err.code} (duplicate key)`);
        }
    }

    if (duplicateBlocked) {
        console.log("   ✅ PASSED: Duplicate refunds are mathematically impossible!");
    } else {
        console.error("   ❌ FAILED Idempotency test (duplicate was not blocked)");
        process.exit(1);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: SOCKET.IO REAL-TIME DELIVERY
    // ─────────────────────────────────────────────────────────────
    console.log("\n🧪 TEST 4: Socket.IO Real-Time Event Dispatch");

    const TEST_PORT = 3099;
    const httpServer = http.createServer();
    initSocket(httpServer);

    await new Promise((resolve) => httpServer.listen(TEST_PORT, resolve));
    console.log(`   ✓ Test Socket server listening on port ${TEST_PORT}`);

    // Create session token for authentication
    const rawToken = jwt.sign({ id: testUser._id }, config.JWT_SECRET, { expiresIn: "1h" });
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    await sessionModel.create({
        userId: testUser._id,
        tokenHash,
        userAgent: "Test-Agent",
        ipAddress: "127.0.0.1",
        expiresAt: new Date(Date.now() + 3600000),
    });

    const clientSocket = ClientIO(`http://localhost:${TEST_PORT}`, {
        auth: { token: rawToken },
        transports: ["websocket"],
    });

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Socket connection timeout")), 5000);
        clientSocket.on("connect", () => {
            clearTimeout(timeout);
            console.log(`   ✓ Test client authenticated & connected (ID: ${clientSocket.id})`);
            resolve();
        });
    });

    // Test WALLET_UPDATED event reception
    const eventPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Event reception timeout")), 5000);
        clientSocket.on("WALLET_UPDATED", (payload) => {
            clearTimeout(timeout);
            resolve(payload);
        });
    });

    // Server emits to private room: user:${testUser._id}
    notifyUser(testUser._id, "WALLET_UPDATED", {
        newBalance: 1250,
        delta: +250,
        reason: "REFUND",
        campaignTitle: "Flash Sale Promo",
    });

    const receivedPayload = await eventPromise;
    console.log("   - Received payload:", receivedPayload);

    if (
        receivedPayload.delta === 250 &&
        receivedPayload.newBalance === 1250 &&
        receivedPayload.reason === "REFUND"
    ) {
        console.log("   ✅ PASSED: Socket.IO delivered event to private user room instantaneously!");
    } else {
        console.error("   ❌ FAILED Socket event payload verification");
        process.exit(1);
    }

    // ─────────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────────
    console.log("\n🧹 Cleaning up test artifacts...");
    clientSocket.disconnect();
    await new Promise((resolve) => httpServer.close(resolve));
    await userModel.findByIdAndDelete(testUser._id);
    await walletModel.findOneAndDelete({ userId: testUser._id });
    await transactionModel.deleteMany({
        $or: [{ toUser: testUser._id }, { fromUser: testUser._id }],
    });
    await sessionModel.deleteMany({ userId: testUser._id });
    await mongoose.disconnect();

    console.log("\n=================================================");
    console.log("🎉 ALL ACID & SOCKET.IO TESTS PASSED 100%!");
    console.log("=================================================");
}

runTests().catch((err) => {
    console.error("Fatal Test Error:", err);
    process.exit(1);
});

