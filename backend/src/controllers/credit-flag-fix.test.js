import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testProofDir = await mkdtemp(join(tmpdir(), "credit-flag-test-"));

Object.assign(process.env, {
  PAYMENT_PROOF_STORAGE_DIR: testProofDir,
  MONGO_URI: "mongodb://127.0.0.1:1/unused",
  JWT_SECRET: "flag-fix-test-jwt-secret",
  REDIS_HOST: "127.0.0.1",
  REDIS_PORT: "6379",
  REDIS_PASSWORD: "test-only",
  AUDIT_SIGNING_KEY: "phase2-credit-posting-test-signing-key",
  DOTENV_CONFIG_QUIET: "true",
});

const { default: userModel } = await import("../models/user.model.js");
const { default: walletModel } = await import("../models/wallet.model.js");
const { default: CreditPurchaseRate } = await import("../models/credit-purchase-rate.model.js");
const { default: CreditPurchase } = await import("../models/credit-purchase.model.js");
const { default: transactionModel } = await import("../models/transaction.model.js");
const { AuditEvent, AuditHead } = await import("../models/audit.model.js");
const { Notification, NotificationEvent } = await import("../models/notification.model.js");
const { setRate, updatePaymentInstructions } = await import("./credit-rate.controller.js");
const { postCreditMovement } = await import("../services/credit-posting.service.js");
const { inspectCreditAccount } = await import("../services/credit-evidence.service.js");
const {
  createQuote,
  submitProof,
  flagPurchaseForReview,
  fixFlaggedProof,
  approvePurchase,
  rejectPurchase,
} = await import("./credit-purchase.controller.js");

function mockResponse() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  return res;
}

test("Recharge Request Flagging & Single-Fix Lifecycle", async (t) => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose.set("autoIndex", false);
  await mongoose.connect(replSet.getUri("flag_fix_tests"));

  await Promise.all([
    userModel,
    walletModel,
    CreditPurchaseRate,
    CreditPurchase,
    transactionModel,
    AuditEvent,
    AuditHead,
    Notification,
    NotificationEvent,
  ].map((m) => m.init().catch(() => {})));

  t.after(async () => {
    await mongoose.disconnect();
    await replSet.stop();
    await rm(testProofDir, { recursive: true, force: true }).catch(() => {});
  });

  const adminId = new mongoose.Types.ObjectId();
  const resellerId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  await userModel.collection.insertOne({
    _id: adminId,
    username: "superadmin_flag",
    email: "superadmin_flag@test.com",
    role: "Super Admin",
    status: "active",
  });
  await walletModel.create({
    userId: adminId,
    balance: 0,
    creditBalances: {
      CAMPAIGN: { available: 0, reserved: 0 },
      NUMBER_FILTERING: { available: 0, reserved: 0 },
    },
  });

  await userModel.collection.insertOne({
    _id: resellerId,
    username: "reseller_flag",
    email: "reseller_flag@test.com",
    role: "Reseller",
    createdBy: adminId,
    status: "active",
  });
  await walletModel.create({
    userId: resellerId,
    balance: 0,
    creditBalances: {
      CAMPAIGN: { available: 0, reserved: 0 },
      NUMBER_FILTERING: { available: 0, reserved: 0 },
    },
  });

  const session = await mongoose.startSession();
  await session.withTransaction(async () => {
    await postCreditMovement({
      session,
      operationKey: `seed-reseller-${resellerId}`,
      type: "ALLOCATE",
      category: "CAMPAIGN",
      amount: 10000,
      fromUser: null,
      toUser: resellerId,
      performedBy: adminId,
      notes: "Seed reseller campaign credits",
    });
  });
  await session.endSession();

  await userModel.collection.insertOne({
    _id: userId,
    username: "user_flag",
    email: "user_flag@test.com",
    role: "User",
    createdBy: resellerId,
    resellerId: resellerId,
    status: "active",
  });
  await walletModel.create({
    userId: userId,
    balance: 0,
    creditBalances: {
      CAMPAIGN: { available: 0, reserved: 0 },
      NUMBER_FILTERING: { available: 0, reserved: 0 },
    },
  });

  const admin = await userModel.findById(adminId);
  const reseller = await userModel.findById(resellerId);
  const user = await userModel.findById(userId);

  // Set reseller rate and instructions for User
  const rateRes = mockResponse();
  await setRate(
    { user: reseller, body: { category: "CAMPAIGN", unitPriceInr: 0.15 } },
    rateRes
  );
  assert.equal(rateRes.statusCode, 201);

  const instrRes = mockResponse();
  await updatePaymentInstructions(
    {
      user: reseller,
      body: {
        bankName: "HDFC Bank",
        accountNumber: "50100234567890",
        accountName: "Reseller Agency",
        ifscCode: "HDFC0001234",
        upiId: "reseller@upi",
      },
    },
    instrRes
  );
  assert.equal(instrRes.statusCode, 200);

  let purchaseId;

  await t.test("1. Buyer requests quote and submits initial payment proof", async () => {
    const quoteRes = mockResponse();
    await createQuote(
      {
        user,
        body: { category: "CAMPAIGN", quantity: 500 },
        get: () => "quote-key-test-1",
      },
      quoteRes
    );
    assert.equal(quoteRes.statusCode, 201);
    purchaseId = quoteRes.body.quote.id;

    const sampleProofBuffer = Buffer.from("%PDF-1.4 initial test proof file");
    const submitRes = mockResponse();
    await submitProof(
      {
        user,
        params: { id: purchaseId },
        body: { paymentReference: "UTR-BAD-123" },
        file: { buffer: sampleProofBuffer, mimetype: "application/pdf", originalname: "proof1.pdf" },
      },
      submitRes
    );
    assert.equal(submitRes.statusCode, 200);
    assert.equal(submitRes.body.purchase.status, "PENDING");
  });

  await t.test("2. Reseller reviewer flags the request with feedback", async () => {
    const flagRes = mockResponse();
    await flagPurchaseForReview(
      {
        user: reseller,
        params: { id: purchaseId },
        body: { reason: "Payment reference UTR-BAD-123 is invalid. Please check your bank UTR." },
      },
      flagRes
    );
    assert.equal(flagRes.statusCode, 200);
    assert.equal(flagRes.body.purchase.status, "FLAGGED");
    assert.equal(flagRes.body.purchase.flagReason, "Payment reference UTR-BAD-123 is invalid. Please check your bank UTR.");
    assert.equal(flagRes.body.purchase.fixAttempts, 0);

    // Verify buyer cannot edit credits or quantity (strictly locked and uneditable)
    const updated = await CreditPurchase.findById(purchaseId);
    assert.equal(updated.quantity, 500);
    assert.equal(updated.category, "CAMPAIGN");

    const check = await mongoose.startSession();
    try {
      const { summary } = await check.withTransaction(() => inspectCreditAccount(resellerId, check));
      assert.equal(summary.categories.CAMPAIGN.walletBalance.reserved, 0);
      assert.equal(summary.classification, "matched");
    } finally {
      await check.endSession();
    }
  });

  await t.test("3. Buyer resubmits corrected payment proof (their 1 allowed chance)", async () => {
    const fixedProofBuffer = Buffer.from("%PDF-1.4 corrected proof screenshot file");

    const fixRes = mockResponse();
    await fixFlaggedProof(
      {
        user,
        params: { id: purchaseId },
        body: { paymentReference: "UTR-CORRECT-999" },
        file: { buffer: fixedProofBuffer, mimetype: "application/pdf", originalname: "proof2_fixed.pdf" },
      },
      fixRes
    );
    assert.equal(fixRes.statusCode, 200);
    assert.equal(fixRes.body.purchase.status, "PENDING");
    assert.equal(fixRes.body.purchase.fixAttempts, 1);
    assert.equal(fixRes.body.purchase.paymentReference, "UTR-CORRECT-999");
  });

  await t.test("4. Enforce 1-chance limit: reviewer cannot flag a second time", async () => {
    const secondFlagRes = mockResponse();
    await flagPurchaseForReview(
      {
        user: reseller,
        params: { id: purchaseId },
        body: { reason: "Still incorrect" },
      },
      secondFlagRes
    );
    assert.equal(secondFlagRes.statusCode, 400);
    assert.match(secondFlagRes.body.message, /already used their 1 chance/i);
  });

  await t.test("5. Enforce 1-chance limit: buyer cannot fix again", async () => {
    const secondFixRes = mockResponse();
    await fixFlaggedProof(
      {
        user,
        params: { id: purchaseId },
        body: { paymentReference: "UTR-THIRD-ATTEMPT" },
      },
      secondFixRes
    );
    assert.equal(secondFixRes.statusCode, 409); // purchase.status is PENDING, not FLAGGED
  });

  await t.test("6. Reviewer approves the fixed request and credits are delivered", async () => {
    const approveRes = mockResponse();
    await approvePurchase(
      {
        user: reseller,
        params: { id: purchaseId },
        body: {},
        get: () => "approve-key-flag-fixed",
      },
      approveRes
    );
    assert.equal(approveRes.statusCode, 200);
    assert.equal(approveRes.body.purchase.status, "APPROVED");

    // Check user received 500 campaign credits
    const freshUserWallet = await walletModel.findOne({ userId: userId });
    assert.equal(freshUserWallet.creditBalances.CAMPAIGN.available, 500);

    // Approval deducts the purchase from the available balance.
    const freshResellerWallet = await walletModel.findOne({ userId: resellerId });
    assert.equal(freshResellerWallet.creditBalances.CAMPAIGN.available, 9500);
    assert.equal(freshResellerWallet.creditBalances.CAMPAIGN.reserved, 0);
  });
});
