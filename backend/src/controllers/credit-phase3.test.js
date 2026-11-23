import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { registerHooks } from "node:module";

const queueStub = `export const campaignQueue={on(){},close:async()=>{}};export const scheduleCampaignJob=async()=>null;export const cancelCampaignJob=async()=>false;export const getCampaignJobStatus=async()=>null;`;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    return specifier.endsWith("/queues/campaign.queue.js")
      ? { url: `data:text/javascript,${encodeURIComponent(queueStub)}`, shortCircuit: true }
      : next(specifier, context);
  },
});

Object.assign(process.env, {
  MONGO_URI: "mongodb://127.0.0.1:1/unused",
  JWT_SECRET: "phase3-test-jwt-secret",
  REDIS_HOST: "127.0.0.1",
  REDIS_PORT: "6379",
  REDIS_PASSWORD: "test-only",
  AUDIT_SIGNING_KEY: "phase3-credit-posting-test-signing-key",
  DOTENV_CONFIG_QUIET: "true",
});

const { default: userModel } = await import("../models/user.model.js");
const { default: walletModel } = await import("../models/wallet.model.js");
const { default: campaignModel } = await import("../models/campaign.model.js");
const { default: transactionModel } = await import("../models/transaction.model.js");
const { AuditEvent, AuditHead } = await import("../models/audit.model.js");
const { default: CreditOperation } = await import("../models/credit-operation.model.js");
const { default: CreditPurchaseRate } = await import("../models/credit-purchase-rate.model.js");
const { default: CreditPurchase } = await import("../models/credit-purchase.model.js");
const { default: NumberFilterRequest } = await import("../models/number-filter-request.model.js");
await import("../models/template.model.js");
const { postCreditMovement } = await import("../services/credit-posting.service.js");
const { retryCreditController, runCreditTransaction } = await import("../helpers/credit-operation.js");
const {
  createCampaign,
  cancelScheduledCampaign,
  updateCampaignRecipientsManagement,
  saveCampaignReport,
  getCampaignById,
} = await import("./campaign.controller.js");

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

test("Phase 3 — Campaign Debit and Report Refunds", async (t) => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose.set("autoIndex", false);
  await mongoose.connect(replSet.getUri("phase3_tests"));

  await Promise.all([
    userModel,
    walletModel,
    campaignModel,
    transactionModel,
    AuditEvent,
    AuditHead,
    CreditOperation,
    CreditPurchaseRate,
    CreditPurchase,
    NumberFilterRequest,
  ].map((m) => m.init().catch(() => {})));

  await Promise.all([
    walletModel,
    campaignModel,
    transactionModel,
    AuditEvent,
    AuditHead,
    CreditOperation,
  ].map((m) => m.createIndexes().catch(() => {})));

  const superAdminId = new mongoose.Types.ObjectId();
  const superAdmin = {
    _id: superAdminId,
    username: "superadmin_p3",
    email: "superadmin_p3@test.local",
    role: "Super Admin",
    status: "active",
  };
  await userModel.collection.insertOne({ ...superAdmin, password: "Password123!" });
  await walletModel.create([{ userId: superAdminId, balance: 0 }]);

  const userId = new mongoose.Types.ObjectId();
  const user = {
    _id: userId,
    username: "user_p3",
    email: "user_p3@test.local",
    role: "User",
    status: "active",
    ratePerMsg: 15, // Legacy rate field must NOT be used for Phase 3 row counting
  };
  await userModel.collection.insertOne({ ...user, password: "Password123!" });
  await walletModel.create([{ userId, balance: 0 }]);

  // Seed user with 200 Campaign Credits
  await runCreditTransaction(async (session) => {
    await postCreditMovement({
      session,
      operationKey: `seed-campaign-credits:${userId}`,
      type: "ALLOCATE",
      category: "CAMPAIGN",
      amount: 200,
      toUser: userId,
      performedBy: superAdminId,
      notes: "Initial grant of 200 Campaign Credits",
    });
    await postCreditMovement({
      session, operationKey: "seed-legacy-balance:" + userId, type: "ALLOCATE",
      amount: 3_000, toUser: userId, performedBy: superAdminId,
    });
  }, { walletIds: [userId] });

  let createdCampaignId = null;
  // Generate 100 rows: 90 unique numbers + 10 duplicate rows
  const uniqueNumbers = Array.from({ length: 90 }, (_, i) => `9198000000${String(i).padStart(2, "0")}`);
  const duplicateNumbers = uniqueNumbers.slice(0, 10);
  const submittedRecipients = [...uniqueNumbers, ...duplicateNumbers]; // exactly 100 rows

  await t.test("1. Row count debit: 100 submitted rows (with duplicates) debits 100 Campaign Credits (1 credit / row)", async () => {
    assert.equal(submittedRecipients.length, 100);

    const req = {
      user,
      body: {
        campaignTitle: "Phase 3 Broadcast Test",
        messageBody: "Testing Phase 3 row count debit and refunds",
        recipients: submittedRecipients,
        schedule: "now",
      },
      files: {},
      params: {},
      query: {},
    };
    const res = mockResponse();

    await retryCreditController(createCampaign, { walletIds: [userId] })(req, res);
    assert.equal(res.statusCode, 201, `Failed to create campaign: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.success, true);
    assert.equal(res.body.creditDeduction.amount, 100, "Must debit exactly 100 Campaign Credits, not ratePerMsg * 100");
    assert.equal(res.body.creditDeduction.remainingBalance, 100, "Wallet remaining balance must be 200 - 100 = 100");

    createdCampaignId = res.body.data._id;
    const campaignInDb = await campaignModel.findById(createdCampaignId).lean();
    assert.equal(campaignInDb.totalRecipients, 100);
    assert.equal(campaignInDb.creditsDeducted, 100);
    assert.equal(campaignInDb.category, "CAMPAIGN");
    assert.ok(campaignInDb.campaignCreditCharge, "campaignCreditCharge subdocument must exist");
    assert.equal(campaignInDb.campaignCreditCharge.submittedRowCount, 100);

    // Verify ledger posting
    const chargeTx = await transactionModel.findOne({ campaignId: createdCampaignId, type: "DEDUCT" }).lean();
    assert.ok(chargeTx, "DEDUCT transaction must exist");
    assert.equal(chargeTx.category, "CAMPAIGN");
    assert.equal(chargeTx.amount, 100);

    // Check user wallet in DB
    const userWallet = await walletModel.findOne({ userId }).lean();
    assert.equal(userWallet.creditBalances.CAMPAIGN.available, 100);
  });

  await t.test("2. Insufficient Campaign Credits check: attempting to spend more than available fails cleanly", async () => {
    // Current available is 100 Campaign Credits. Attempt to submit 150 rows.
    const excessRecipients = Array.from({ length: 150 }, (_, i) => `91981000${String(i).padStart(4, "0")}`);
    const req = {
      user,
      body: {
        campaignTitle: "Excess Campaign",
        messageBody: "Will fail due to insufficient credits",
        recipients: excessRecipients,
        schedule: "now",
      },
      files: {},
      params: {},
      query: {},
    };
    const res = mockResponse();

    await retryCreditController(createCampaign, { walletIds: [userId] })(req, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Insufficient Campaign Credits/i);

    // Verify the legacy balance cannot fund this new campaign.
    // Both wallet balances remain untouched.
    const userWallet = await walletModel.findOne({ userId }).lean();
    assert.equal(userWallet.creditBalances.CAMPAIGN.available, 100);
    assert.equal(userWallet.balance, 3000);
  });

  await t.test("3. Super Admin exemption: Super Admin creates campaigns with 0 debit", async () => {
    const recipients = ["919820000001", "919820000002", "919820000003"];
    const req = {
      user: superAdmin,
      body: {
        category: "CAMPAIGN",
        campaignTitle: "Admin Announcement",
        messageBody: "Free broadcast from admin",
        recipients,
        schedule: "now",
      },
      files: {},
      params: {},
      query: {},
    };
    const res = mockResponse();

    await retryCreditController(createCampaign, { walletIds: [] })(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.creditDeduction, null, "Super admin should not have a credit deduction");
  });

  await t.test("4. Recipient report refund: Super Admin refunds 1 credit per rejected row", async () => {
    // Campaign has 100 rows submitted. Mark 10 rows (the duplicates) as rejected/refund.
    const campaign = await campaignModel.findById(createdCampaignId);
    assert.ok(campaign);

    // Prepare recipient entries: rows 91 to 100 (10 duplicates) marked for refund, rows 1 to 90 delivered
    const entries = submittedRecipients.map((phone, idx) => {
      const rowNumber = idx + 1;
      const isDuplicate = idx >= 90;
      return {
        rowNumber,
        phoneNumber: phone,
        status: isDuplicate ? "failed" : "delivered",
        category: isDuplicate ? "Duplicate number" : "WhatsApp Successful",
        billingAction: isDuplicate ? "refund" : "deduct",
      };
    });

    const req = {
      user: superAdmin,
      params: { id: String(createdCampaignId) },
      body: {
        entries,
        saveMode: "publish",
        status: "completed",
        spreadsheetRevision: 0,
      },
    };
    const res = mockResponse();

    await retryCreditController(updateCampaignRecipientsManagement, { walletIds: [userId] })(req, res);
    assert.equal(res.statusCode, 200, `Failed to update recipients: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.refundInfo, "refundInfo must be present");
    assert.equal(res.body.refundInfo.netRefundDelta, 10, "Must refund exactly 10 Campaign Credits (1 per rejected row)");

    // User wallet should now have 100 + 10 = 110 Campaign Credits
    const userWallet = await walletModel.findOne({ userId }).lean();
    assert.equal(userWallet.creditBalances.CAMPAIGN.available, 110);

    // Verify REFUND transaction
    const refundTx = await transactionModel.findOne({ campaignId: createdCampaignId, type: "REFUND" }).lean();
    assert.ok(refundTx);
    assert.equal(refundTx.category, "CAMPAIGN");
    assert.equal(refundTx.amount, 10);
  });

  await t.test("5. Settlement comparison: publishing the same report again prevents refunding twice", async () => {
    const campaign = await campaignModel.findById(createdCampaignId);
    // Submit the exact same report revision with the same 10 rejected rows
    const entries = submittedRecipients.map((phone, idx) => {
      const rowNumber = idx + 1;
      const isDuplicate = idx >= 90;
      return {
        rowNumber,
        phoneNumber: phone,
        status: isDuplicate ? "failed" : "delivered",
        category: isDuplicate ? "Duplicate number" : "WhatsApp Successful",
        billingAction: isDuplicate ? "refund" : "deduct",
      };
    });

    const req = {
      user: superAdmin,
      params: { id: String(createdCampaignId) },
      body: {
        entries,
        saveMode: "publish",
        status: "completed",
        spreadsheetRevision: campaign.spreadsheetRevision || 0,
      },
    };
    const res = mockResponse();

    await retryCreditController(updateCampaignRecipientsManagement, { walletIds: [userId] })(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.refundInfo, null, "No new refund delta; same rows cannot be refunded twice");

    // Balance should still be 110
    const userWallet = await walletModel.findOne({ userId }).lean();
    assert.equal(userWallet.creditBalances.CAMPAIGN.available, 110);
  });

  await t.test("6. Revision refund: adding 5 more rejected rows refunds only the net delta (+5 credits)", async () => {
    const campaign = await campaignModel.findById(createdCampaignId);
    // Rows 1 to 5 now also rejected (+5 credits) in addition to duplicates
    const entries = submittedRecipients.map((phone, idx) => {
      const rowNumber = idx + 1;
      const isFailed = idx < 5;
      const isDuplicate = idx >= 90;
      const isRefund = isFailed || isDuplicate;
      return {
        rowNumber,
        phoneNumber: phone,
        status: isRefund ? "failed" : "delivered",
        category: isDuplicate ? "Duplicate number" : isFailed ? "Non-WhatsApp Failed" : "WhatsApp Successful",
        billingAction: isRefund ? "refund" : "deduct",
      };
    });

    const req = {
      user: superAdmin,
      params: { id: String(createdCampaignId) },
      body: {
        entries,
        saveMode: "publish",
        status: "completed",
        spreadsheetRevision: campaign.spreadsheetRevision || 0,
      },
    };
    const res = mockResponse();

    await retryCreditController(updateCampaignRecipientsManagement, { walletIds: [userId] })(req, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.refundInfo);
    assert.equal(res.body.refundInfo.netRefundDelta, 5, "Net delta must be 15 - 10 = 5 credits");

    // User wallet should now have 110 + 5 = 115 Campaign Credits
    const userWallet = await walletModel.findOne({ userId }).lean();
    assert.equal(userWallet.creditBalances.CAMPAIGN.available, 115);
  });

  await t.test("7. Draft mode is read-only for credit purposes", async () => {
    const campaign = await campaignModel.findById(createdCampaignId);
    const balanceBefore = (await walletModel.findOne({ userId }).lean()).creditBalances.CAMPAIGN.available;

    // Save as draft with 50 refund entries
    const entries = submittedRecipients.map((phone, idx) => {
      const rowNumber = idx + 1;
      return {
        rowNumber,
        phoneNumber: phone,
        status: idx < 50 ? "failed" : "delivered",
        category: idx < 50 ? "Non-WhatsApp Failed" : "WhatsApp Successful",
        billingAction: idx < 50 ? "refund" : "deduct",
      };
    });

    const req = {
      user: superAdmin,
      params: { id: String(createdCampaignId) },
      body: {
        entries,
        saveMode: "draft",
        spreadsheetRevision: campaign.spreadsheetRevision || 0,
      },
    };
    const res = mockResponse();

    await retryCreditController(updateCampaignRecipientsManagement, { walletIds: [userId] })(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.refundInfo, null, "Draft save must not trigger credit refund");

    // Balance must not change
    const balanceAfter = (await walletModel.findOne({ userId }).lean()).creditBalances.CAMPAIGN.available;
    assert.equal(balanceAfter, balanceBefore);
  });

  await t.test("8. Cancellation refund: cancelling a pending campaign refunds unreversed row debits", async () => {
    // Create a new campaign with 25 rows
    const recipients = Array.from({ length: 25 }, (_, i) => `9198300000${String(i).padStart(2, "0")}`);
    const createReq = {
      user,
      body: {
        category: "CAMPAIGN",
        campaignTitle: "Cancellable Campaign",
        messageBody: "Testing cancellation refund",
        recipients,
        schedule: "later",
        scheduledTime: new Date(Date.now() + 3600000).toISOString(),
      },
      files: {},
      params: {},
      query: {},
    };
    const createRes = mockResponse();

    await retryCreditController(createCampaign, { walletIds: [userId] })(createReq, createRes);
    assert.equal(createRes.statusCode, 201);
    const cancellableId = createRes.body.data._id;

    // Balance was 115, debited 25 -> 90
    const walletAfterCreate = await walletModel.findOne({ userId }).lean();
    assert.equal(walletAfterCreate.creditBalances.CAMPAIGN.available, 90);

    // Cancel campaign
    const cancelReq = {
      user,
      params: { id: String(cancellableId) },
      body: {},
    };
    const cancelRes = mockResponse();

    await retryCreditController(cancelScheduledCampaign, { walletIds: [userId] })(cancelReq, cancelRes);
    assert.equal(cancelRes.statusCode, 200);
    assert.equal(cancelRes.body.refundInfo.amount, 25, "Must refund all 25 Campaign Credits");

    // Balance returns to 115
    const walletAfterCancel = await walletModel.findOne({ userId }).lean();
    assert.equal(walletAfterCancel.creditBalances.CAMPAIGN.available, 115);

    // Double cancellation must be blocked
    const againRes = mockResponse();
    await cancelScheduledCampaign(cancelReq, againRes);
    assert.equal(againRes.statusCode, 400);
    assert.equal(againRes.body.success, false);
  });

  await t.test("9. Accounting view: getCampaignById returns charged, refunded, and net Campaign Credits", async () => {
    const req = {
      user,
      params: { id: String(createdCampaignId) },
    };
    const res = mockResponse();

    await getCampaignById(req, res);
    assert.equal(res.statusCode, 200);
    const data = res.body.data;
    assert.equal(data.creditsDeducted, 100, "Original charge was 100");
    assert.equal(data.settledRefundCredits, 15, "Settled refunds are 15");
    assert.equal(data.netCredits, 85, "Net credits must be 100 - 15 = 85");
  });


  await t.test("A published correction re-debits an accepted row and settles equal revisions once", async () => {
    const buildEntries = count => submittedRecipients.map((phoneNumber, index) => ({
      rowNumber: index + 1, phoneNumber, status: index < count ? "failed" : "delivered",
      billingAction: index < count ? "refund" : "keep", tabKey: index < count ? "wrong" : "delivered",
    }));
    async function publish(entries) {
      const campaign = await campaignModel.findById(createdCampaignId);
      const res = mockResponse();
      await updateCampaignRecipientsManagement({
        user: superAdmin, params: { id: createdCampaignId },
        body: { entries, saveMode: "publish", spreadsheetRevision: campaign.spreadsheetRevision },
      }, res);
      return res;
    }
    const forged = buildEntries(10);
    forged[0].phoneNumber = "1234567890";
    assert.equal((await publish(forged)).statusCode, 400);
    const bulk = mockResponse();
    await saveCampaignReport({ user: superAdmin, params: { id: createdCampaignId },
      body: { categories: [{ name: "Rejected", billingAction: "refund", numbers: ["1234567890"] }] } }, bulk);
    assert.equal(bulk.statusCode, 400);
    const corrected = await publish(buildEntries(10));
    assert.equal(corrected.statusCode, 200, JSON.stringify(corrected.body));
    assert.equal(corrected.body.refundInfo.netRefundDelta, -5);
    assert.equal((await publish(buildEntries(10))).body.refundInfo, null);
    assert.equal((await publish(buildEntries(11))).body.refundInfo.netRefundDelta, 1);
    assert.equal((await publish(buildEntries(10))).body.refundInfo.netRefundDelta, -1);
    const original = await transactionModel.findOne({ campaignId: createdCampaignId, chargeReference: 'campaign:' + createdCampaignId });
    const corrections = await transactionModel.find({ campaignId: createdCampaignId, type: "DEDUCT", originalTransactionId: original._id });
    assert.deepEqual(corrections.map(row => row.amount), [5, 1]);
    const final = mockResponse();
    await getCampaignById({ user, params: { id: createdCampaignId } }, final);
    assert.equal(final.body.data.netCredits, 90);
  });

  hooks.deregister();
  await mongoose.disconnect();
  await replSet.stop();
});
