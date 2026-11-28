import test from "node:test";
import assert from "node:assert/strict";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import mongoose from "mongoose";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testProofDir = await mkdtemp(join(tmpdir(), "credit-proof-test-"));

Object.assign(process.env, {
  PAYMENT_PROOF_STORAGE_DIR: testProofDir,
  MONGO_URI: "mongodb://127.0.0.1:1/unused",
  JWT_SECRET: "phase2-test-jwt-secret",
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
const { deliverEvent } = await import("../services/notification.service.js");
const { setRate, getRates, updatePaymentInstructions, getSellerPaymentInstructions } = await import("./credit-rate.controller.js");
const { createQuote, submitProof, approvePurchase, rejectPurchase, listPurchases, getPurchaseById } = await import("./credit-purchase.controller.js");
const { expireDueCreditQuotes } = await import("../services/credit-purchase-holds.service.js");
const { updateUser } = await import("./user.controller.js");
const { allocateCredits, reclaimCredits, getTransactions } = await import("./credit.controller.js");
const { postCreditMovement } = await import("../services/credit-posting.service.js");

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

test("Phase 2 — Pricing, Recharge, Allocation, and Reclaim Lifecycle", async (t) => {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  mongoose.set("autoIndex", false);
  await mongoose.connect(replSet.getUri("phase2_tests"));

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

  await Promise.all([
    walletModel,
    CreditPurchaseRate,
    CreditPurchase,
    transactionModel,
    AuditEvent,
    AuditHead,
    Notification,
    NotificationEvent,
  ].map((m) => m.createIndexes().catch(() => {})));

  t.after(async () => {
    await mongoose.disconnect();
    await replSet.stop();
    await rm(testProofDir, { recursive: true, force: true });
  });

  const adminId = new mongoose.Types.ObjectId();
  const resellerId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();

  await userModel.collection.insertOne({
    _id: adminId,
    username: "superadmin_p2",
    email: "admin_p2@example.com",
    role: "Super Admin",
    status: "active",
  });
  await walletModel.create({
    userId: adminId,
    balance: 0,
    creditBalances: { CAMPAIGN: { available: 0, reserved: 0 }, NUMBER_FILTERING: { available: 0, reserved: 0 } },
  });

  await userModel.collection.insertOne({
    _id: resellerId,
    username: "reseller_p2",
    email: "reseller_p2@example.com",
    role: "Reseller",
    createdBy: adminId,
    status: "active",
    featureAccess: { reclaimCredit: true },
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
      operationKey: `seed-reseller-filtering-${resellerId}`,
      type: "ALLOCATE",
      category: "NUMBER_FILTERING",
      amount: 5000,
      fromUser: null,
      toUser: resellerId,
      performedBy: adminId,
      notes: "Seed reseller filtering credits",
    });
  });
  await session.endSession();

  await userModel.collection.insertOne({
    _id: userId,
    username: "client_p2",
    email: "client_p2@example.com",
    role: "User",
    createdBy: resellerId,
    resellerId: resellerId,
    status: "active",
  });
  await walletModel.create({
    userId,
    balance: 0,
    creditBalances: {
      CAMPAIGN: { available: 0, reserved: 0 },
      NUMBER_FILTERING: { available: 0, reserved: 0 },
    },
  });

  const admin = await userModel.findById(adminId);
  const reseller = await userModel.findById(resellerId);
  const user = await userModel.findById(userId);

  await t.test("1. Rate and Payment Instructions Configuration", async () => {
    // 1a. Seller cannot show payment instructions before rate is configured
    const reqBuyerInst = { user, query: { category: "CAMPAIGN" } };
    const resBuyerInst = mockResponse();
    await getSellerPaymentInstructions(reqBuyerInst, resBuyerInst);
    assert.equal(resBuyerInst.statusCode, 400);
    assert.match(resBuyerInst.body.message, /configure/i);

    // 1b. Reseller configures default purchase rates for CAMPAIGN and NUMBER_FILTERING
    const reqSetRate1 = { user: reseller, body: { category: "CAMPAIGN", unitPriceInr: 0.12 } };
    const resSetRate1 = mockResponse();
    await setRate(reqSetRate1, resSetRate1);
    assert.equal(resSetRate1.statusCode, 201);
    assert.equal(resSetRate1.body.rate.unitPriceInr, "0.12");

    const reqSetRate2 = { user: reseller, body: { category: "NUMBER_FILTERING", unitPriceInr: 0.05 } };
    const resSetRate2 = mockResponse();
    await setRate(reqSetRate2, resSetRate2);
    assert.equal(resSetRate2.statusCode, 201);
    assert.equal(resSetRate2.body.rate.unitPriceInr, "0.05");

    // 1c. Reseller configures bank payment instructions
    const reqSetInst = {
      user: reseller,
      body: {
        bankName: "HDFC Bank",
        accountNumber: "50100234567890",
        accountName: "Agency Ltd",
        ifscCode: "HDFC0001234",
        upiId: "agency@okhdfc",
        notes: "Include username in remarks",
      },
    };
    const resSetInst = mockResponse();
    await updatePaymentInstructions(reqSetInst, resSetInst);
    assert.equal(resSetInst.statusCode, 200);
    assert.equal(resSetInst.body.paymentInstructions.bankName, "HDFC Bank");

    // 1d. Buyer now retrieves seller payment instructions successfully
    const resBuyerInst2 = mockResponse();
    await getSellerPaymentInstructions(reqBuyerInst, resBuyerInst2);
    assert.equal(resBuyerInst2.statusCode, 200);
    assert.equal(resBuyerInst2.body.seller.username, "reseller_p2");
    assert.equal(resBuyerInst2.body.paymentInstructions.upiId, "agency@okhdfc");
  });

  let activeQuoteId = null;

  await t.test("2. A user can request a quote with an unfunded reseller", async () => {
    // 2a. User generates quote for 2,000 CAMPAIGN credits
    const reqQuote = {
      user,
      body: { category: "CAMPAIGN", quantity: 2000 },
      get: () => "quote-key-1",
    };
    const resQuote = mockResponse();
    await createQuote(reqQuote, resQuote);
    assert.equal(resQuote.statusCode, 201);
    assert.equal(resQuote.body.quote.quantity, 2000);
    assert.equal(resQuote.body.quote.totalInr, "240.00");
    assert.equal(resQuote.body.quote.status, "QUOTED");
    activeQuoteId = resQuote.body.quote.id;

    const wallet = await walletModel.findOne({ userId: reseller._id });
    assert.equal(wallet.creditBalances.CAMPAIGN.available, 0);
    assert.equal(wallet.creditBalances.CAMPAIGN.reserved, 0);
    assert.equal(await transactionModel.countDocuments({ purchaseId: activeQuoteId }), 0);

    // 2b. Buyer sees QUOTED order in their purchases list
    const resBuyerList = mockResponse();
    await listPurchases({ user, query: {} }, resBuyerList);
    assert.equal(resBuyerList.statusCode, 200);
    assert.ok(resBuyerList.body.purchases.some(p => String(p.id) === String(activeQuoteId)));

    const details = mockResponse();
    await getPurchaseById({ user, params: { id: activeQuoteId } }, details);
    assert.equal(details.statusCode, 200);
    assert.equal(details.body.purchase.seller.role, "Admin");
    assert.equal(details.body.purchase.paymentInstructions.upiId, "agency@okhdfc");

    // 2c. Reseller (seller) reviewing recharge requests does NOT see QUOTED orders
    const resSellerList = mockResponse();
    await listPurchases({ user: reseller, query: {} }, resSellerList);
    assert.equal(resSellerList.statusCode, 200);
    assert.ok(!resSellerList.body.purchases.some(p => String(p.id) === String(activeQuoteId)));

    // 2d. Super Admin reviewing recharge requests also does NOT see QUOTED orders
    const resAdminList = mockResponse();
    await listPurchases({ user: admin, query: {} }, resAdminList);
    assert.equal(resAdminList.statusCode, 200);
    assert.ok(!resAdminList.body.purchases.some(p => String(p.id) === String(activeQuoteId)));
  });

  await t.test("3. Payment Proof Submission", async () => {
    // 3a. Buyer submits payment reference and proof file
    const sampleProofBuffer = Buffer.from("%PDF-1.4 test proof file content");
    const reqProof = {
      user,
      params: { id: activeQuoteId },
      body: { paymentReference: "UTR9876543210" },
      file: {
        buffer: sampleProofBuffer,
        mimetype: "application/pdf",
        originalname: "receipt.pdf",
      },
    };
    const resProof = mockResponse(), resRetry = mockResponse();
    await Promise.all([submitProof(reqProof, resProof), submitProof(reqProof, resRetry)]);
    assert.deepEqual(resRetry.body, resProof.body);
    assert.equal((await readdir(testProofDir)).length, 1);
    assert.equal(resProof.statusCode, 200);
    assert.equal(resProof.body.purchase.status, "PENDING");
    const eventKey = `recharge:${resProof.body.purchase.id}:proof:submitted`;
    assert.equal(await NotificationEvent.countDocuments({ eventKey }), 1);
    const event = await NotificationEvent.findOne({ eventKey }).lean();
    await deliverEvent(event);
    const alerts = await Notification.find({ eventId: eventKey }).lean();
    assert.equal(alerts.length, 1);
    assert.equal(String(alerts[0].recipientId), String(reseller._id));
    assert.equal(alerts[0].href, "/reseller/credits?tab=requests");
    const readAt = new Date();
    await Notification.updateOne({ _id: alerts[0]._id }, { $set: { readAt } });
    await deliverEvent(event);
    assert.deepEqual((await Notification.findById(alerts[0]._id).lean()).readAt, readAt);
    assert.equal(resProof.body.purchase.paymentReference, "UTR9876543210");

    const anotherQuote = mockResponse();
    await createQuote({ user, body: { category: "CAMPAIGN", quantity: 1 } }, anotherQuote);
    assert.equal(anotherQuote.statusCode, 201);
    const resDup = mockResponse();
    await submitProof({ ...reqProof, params: { id: anotherQuote.body.quote.id } }, resDup);
    assert.equal(resDup.statusCode, 409);
    assert.equal((await readdir(testProofDir)).length, 1);
    const reject = mockResponse();
    await rejectPurchase({ user: reseller, params: { id: anotherQuote.body.quote.id }, body: {} }, reject);
    assert.equal(reject.statusCode, 200);

  });

  await t.test("4. Purchase Review & Fulfillment", async () => {
    // 4a. Another reseller or user cannot approve
    const reqUnauthorized = {
      user,
      params: { id: activeQuoteId },
      get: () => "approve-unauth",
    };
    const resUnauthorized = mockResponse();
    await approvePurchase(reqUnauthorized, resUnauthorized);
    assert.equal(resUnauthorized.statusCode, 403);

    // 4b. Recorded seller approves purchase
    const reqApprove = {
      user: reseller,
      params: { id: activeQuoteId },
      get: () => "approve-key-1",
    };
    const insufficient = mockResponse();
    await approvePurchase(reqApprove, insufficient);
    assert.equal(insufficient.statusCode, 400);
    assert.equal(insufficient.body.isInsufficientBalance, true);
    assert.match(insufficient.body.message, /Not enough balance/);
    assert.equal(insufficient.body.shortfall, 2000);
    assert.equal((await CreditPurchase.findById(activeQuoteId)).status, "PENDING");
    assert.equal(await transactionModel.countDocuments({ purchaseId: activeQuoteId }), 0);

    const topUp = mockResponse();
    await allocateCredits({ user: admin, body: { toUserId: String(resellerId), category: "CAMPAIGN", amount: 10000 } }, topUp);
    assert.equal(topUp.statusCode, 200);
    const resApprove = mockResponse();
    await approvePurchase(reqApprove, resApprove);
    assert.equal(resApprove.statusCode, 200);
    assert.equal(resApprove.body.purchase.status, "APPROVED");
    assert.equal(resApprove.body.purchase.quantity, 2000);

    // 4c. Verify balances:
    // Approval debits the newly funded reseller wallet.
    // User: available was 0 -> now 2000 CAMPAIGN credits!
    const rw = await walletModel.findOne({ userId: reseller._id });
    const uw = await walletModel.findOne({ userId: user._id });
    assert.equal(rw.creditBalances.CAMPAIGN.available, 8000);
    assert.equal(rw.creditBalances.CAMPAIGN.reserved, 0);
    assert.equal(uw.creditBalances.CAMPAIGN.available, 2000);

    // 4d. Re-approving an already approved purchase fails
    const resDupApprove = mockResponse();
    await approvePurchase(reqApprove, resDupApprove);
    assert.equal(resDupApprove.statusCode, 409);
  });

  await t.test("5. Category Allocation and Reclaim Routes", async () => {
    // 5a. Reseller allocates 500 NUMBER_FILTERING credits directly to user
    const reqAlloc = {
      user: reseller,
      body: {
        toUserId: user._id.toString(),
        category: "NUMBER_FILTERING",
        amount: 500,
        notes: "Direct topup",
      },
      get: () => "alloc-key-1",
    };
    const resAlloc = mockResponse();
    await allocateCredits(reqAlloc, resAlloc);
    assert.equal(resAlloc.statusCode, 200);

    let rw = await walletModel.findOne({ userId: reseller._id });
    let uw = await walletModel.findOne({ userId: user._id });
    assert.equal(rw.creditBalances.NUMBER_FILTERING.available, 4500);
    assert.equal(uw.creditBalances.NUMBER_FILTERING.available, 500);

    // Give background worker a brief moment to finish delivering
    await new Promise(r => setTimeout(r, 300));
    let userNotif = await Notification.findOne({ recipientId: user._id, itemType: "transaction" }).sort({ createdAt: -1 });
    assert.ok(userNotif, "User should have received a notification for credit allocation");
    assert.equal(userNotif.title, `Credits received from Admin (${reseller.username})`);
    assert.match(userNotif.body, /500 filtering credits were received from Admin/);

    // 5b. Reseller without permission cannot reclaim credits
    const unauthReseller = Object.assign(reseller.toObject(), { featureAccess: { reclaimCredit: false } });
    const reqReclaimDenied = {
      user: unauthReseller,
      body: {
        fromUserId: user._id.toString(),
        category: "NUMBER_FILTERING",
        amount: 200,
        notes: "Rebalancing excess filtering credits",
      },
      get: () => "reclaim-key-denied",
    };
    const resReclaimDenied = mockResponse();
    await reclaimCredits(reqReclaimDenied, resReclaimDenied);
    assert.equal(resReclaimDenied.statusCode, 403);
    assert.match(resReclaimDenied.body.message, /not authorized/i);

    // 5b. Reseller reclaims 200 NUMBER_FILTERING credits back
    const reqReclaim = {
      user: reseller,
      body: {
        fromUserId: user._id.toString(),
        category: "NUMBER_FILTERING",
        amount: 200,
        notes: "Rebalancing excess filtering credits",
      },
      get: () => "reclaim-key-1",
    };
    const resReclaim = mockResponse();
    await reclaimCredits(reqReclaim, resReclaim);
    assert.equal(resReclaim.statusCode, 200);

    rw = await walletModel.findOne({ userId: reseller._id });
    uw = await walletModel.findOne({ userId: user._id });
    assert.equal(rw.creditBalances.NUMBER_FILTERING.available, 4700);
    assert.equal(uw.creditBalances.NUMBER_FILTERING.available, 300);

    // 5c. Ledger history carries category filter
    const reqTxns = {
      user: reseller,
      query: { category: "NUMBER_FILTERING", limit: 10 },
    };
    const resTxns = mockResponse();
    await getTransactions(reqTxns, resTxns);
    assert.equal(resTxns.statusCode, 200);
    assert.ok(resTxns.body.transactions.length >= 2);
    for (const t of resTxns.body.transactions) {
      assert.equal(t.category, "NUMBER_FILTERING");
    }
  });

  await t.test("6. Rejecting an unfunded order leaves balances unchanged", async () => {
    // Create new quote for 1000 CAMPAIGN credits
    const reqQuote = {
      user,
      body: { category: "CAMPAIGN", quantity: 1000 },
      get: () => "quote-key-reject",
    };
    const resQuote = mockResponse();
    await createQuote(reqQuote, resQuote);
    assert.equal(resQuote.statusCode, 201);
    const rejectQuoteId = resQuote.body.quote.id;

    let rw = await walletModel.findOne({ userId: reseller._id });
    assert.equal(rw.creditBalances.CAMPAIGN.reserved, 0);

    // Reseller rejects the purchase
    const reqReject = {
      user: reseller,
      params: { id: rejectQuoteId },
      body: { reason: "Payment cancelled by mutual agreement" },
      get: () => "reject-key-1",
    };
    const resReject = mockResponse();
    await rejectPurchase(reqReject, resReject);
    assert.equal(resReject.statusCode, 200);
    assert.equal(resReject.body.purchase.status, "REJECTED");

    assert.equal(await transactionModel.countDocuments({ purchaseId: rejectQuoteId }), 0);
    rw = await walletModel.findOne({ userId: reseller._id });
    assert.equal(rw.creditBalances.CAMPAIGN.reserved, 0);
    assert.equal(rw.creditBalances.CAMPAIGN.available, 8000);
  });
  await t.test("Creator routing, rate snapshots, and recorded seller approval agree across admins", async () => {
    const otherAdmin = { _id: new mongoose.Types.ObjectId(), username: "Second administrator", role: "Super Admin",
      status: "active", email: "admin2@example.test", paymentInstructions: { upiId: "second-admin@example" } };
    const directBuyer = { _id: new mongoose.Types.ObjectId(), username: "Direct buyer", role: "User",
      status: "active", email: "direct@example.test", createdBy: otherAdmin._id };
    await userModel.collection.insertMany([otherAdmin, directBuyer]);
    const ownership = mockResponse();
    await updateUser({ user: admin, params: { id: String(directBuyer._id) }, body: { resellerId } }, ownership);
    assert.equal(ownership.statusCode, 409);
    const configure = async (seller, body) => {
      const result = mockResponse();
      await setRate({ user: seller, body }, result);
      return result;
    };
    assert.equal((await configure(admin, { buyerId: directBuyer._id, category: "CAMPAIGN", unitPriceInr: "0.1" })).statusCode, 403);
    assert.equal((await configure(otherAdmin, { category: "CAMPAIGN", unitPriceInr: "0.2" })).statusCode, 201);
    assert.equal((await configure(otherAdmin, { buyerId: directBuyer._id, category: "NUMBER_FILTERING", unitPriceInr: "0.04" })).statusCode, 201);
    const rates = mockResponse();
    await getRates({ user: directBuyer, query: {} }, rates);
    assert.equal(rates.body.purchaseRates.CAMPAIGN.isDefault, true);
    assert.equal(rates.body.purchaseRates.NUMBER_FILTERING.unitPriceInr, "0.04");
    const adminViewRates = mockResponse();
    await getRates({ user: admin, query: { buyerId: String(directBuyer._id) } }, adminViewRates);
    assert.equal(adminViewRates.statusCode, 200);
    assert.equal(adminViewRates.body.canEdit, false);
    assert.equal(adminViewRates.body.purchaseRates.CAMPAIGN.unitPriceInr, "0.2");
    assert.equal(adminViewRates.body.purchaseRates.NUMBER_FILTERING.unitPriceInr, "0.04");
    const otherResellerView = mockResponse();
    await getRates({ user: reseller, query: { buyerId: String(directBuyer._id) } }, otherResellerView);
    assert.equal(otherResellerView.statusCode, 403);
    const quote = mockResponse();
    await createQuote({ user: directBuyer, body: { category: "CAMPAIGN", quantity: 10 } }, quote);
    assert.equal(quote.statusCode, 201);
    assert.equal(String(quote.body.quote.seller.id), String(otherAdmin._id));
    assert.equal(quote.body.quote.paymentInstructions.upiId, "second-admin@example");
    assert.equal(quote.body.quote.totalPaisa, 200);
    assert.equal((await configure(otherAdmin, { buyerId: directBuyer._id, category: "CAMPAIGN", unitPriceInr: "0.33" })).statusCode, 201);
    const proof = mockResponse();
    const params = { id: String(quote.body.quote.id) };
    await submitProof({ user: directBuyer, params, body: { paymentReference: "CREATOR-ROUTING" },
      file: { buffer: Buffer.from("%PDF-1.4 test receipt") } }, proof);
    assert.equal(proof.body.purchase.totalPaisa, 200);
    const eventKey = `recharge:${params.id}:proof:submitted`;
    await deliverEvent(await NotificationEvent.findOne({ eventKey }).lean());
    const alerts = await Notification.find({ eventId: eventKey }).lean();
    assert.equal(alerts.length, 1);
    assert.equal(String(alerts[0].recipientId), String(otherAdmin._id));
    assert.equal(alerts[0].href, "/admin/credits?tab=requests");
    const wrongSeller = mockResponse(), approved = mockResponse();
    await approvePurchase({ user: admin, params, body: {} }, wrongSeller);
    await approvePurchase({ user: otherAdmin, params, body: {} }, approved);
    assert.equal(wrongSeller.statusCode, 403);
    assert.equal(approved.statusCode, 200);
  });

  await t.test("Existing pending requests release their legacy hold once and stay pending", async () => {
    const quote = mockResponse();
    await createQuote({ user, body: { category: "CAMPAIGN", quantity: 30 } }, quote);
    const id = quote.body.quote.id;
    await CreditPurchase.collection.updateOne({ _id: id }, { $unset: { reservationFree: "" } });
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(() => postCreditMovement({
        session, operationKey: "legacy-quote-reservation", type: "RESERVE", category: "CAMPAIGN",
        amount: 30, fromUser: resellerId, toUser: resellerId, performedBy: userId, purchaseId: id,
      }));
    } finally {
      await session.endSession();
    }
    const proof = mockResponse();
    await submitProof({ user, params: { id }, body: { paymentReference: "LEGACY-HOLD" },
      file: { buffer: Buffer.from("%PDF-1.4 test receipt") } }, proof);
    assert.equal(proof.statusCode, 200);
    await Promise.all([expireDueCreditQuotes(), expireDueCreditQuotes()]);
    assert.equal((await CreditPurchase.findById(id)).status, "PENDING");
    assert.equal(await transactionModel.countDocuments({ purchaseId: id, type: "RELEASE" }), 1);
    const wallet = await walletModel.findOne({ userId: resellerId });
    assert.equal(wallet.creditBalances.CAMPAIGN.reserved, 0);
    assert.equal(wallet.creditBalances.CAMPAIGN.available, 8000);
  });

  await t.test("Quote expiry posts no wallet movement and late proofs go to manual review", async () => {
    const walletBefore = (await walletModel.findOne({ userId: reseller._id }).lean()).creditBalances.CAMPAIGN;
    const quote = mockResponse();
    await createQuote({ user, body: { category: "CAMPAIGN", quantity: 20 } }, quote);
    assert.equal(quote.statusCode, 201);
    const id = quote.body.quote.id;
    await CreditPurchase.collection.updateOne({ _id: id }, { $set: { expiresAt: new Date(Date.now() - 60_000) } });
    const proofReq = { user, params: { id }, body: { paymentReference: "LATE-RECEIPT" },
      file: { buffer: Buffer.from("%PDF-1.4 test receipt") } };
    const proof = mockResponse();
    await Promise.all([expireDueCreditQuotes(), expireDueCreditQuotes(), submitProof(proofReq, proof)]);
    assert.equal(proof.statusCode, 200);
    assert.equal(proof.body.purchase.status, "REVIEW_REQUIRED");
    assert.equal(await transactionModel.countDocuments({ purchaseId: id, type: "RELEASE" }), 0);
    assert.deepEqual((await walletModel.findOne({ userId: reseller._id }).lean()).creditBalances.CAMPAIGN, walletBefore);
    const unconfirmed = mockResponse();
    await approvePurchase({ user: reseller, params: { id }, body: {} }, unconfirmed);
    assert.equal(unconfirmed.statusCode, 409);
    const reviewed = mockResponse();
    await approvePurchase({ user: reseller, params: { id }, body: { confirmManualReview: true } }, reviewed);
    assert.equal(reviewed.statusCode, 200);
    assert.equal(await transactionModel.countDocuments({ purchaseId: id, type: "ALLOCATE" }), 1);
    assert.equal((await walletModel.findOne({ userId: reseller._id })).creditBalances.CAMPAIGN.available, walletBefore.available - 20);
  });

  await t.test("Reseller continues an unpaid quote from My Credit Purchases", async () => {
    const rate = mockResponse();
    await setRate({ user: admin, body: { buyerId: resellerId, category: "CAMPAIGN", unitPriceInr: 0.15 } }, rate);
    assert.equal(rate.statusCode, 201);
    const quote = mockResponse();
    await createQuote({ user: reseller, body: { category: "CAMPAIGN", quantity: 100 } }, quote);
    assert.equal(quote.statusCode, 201);
    const list = mockResponse();
    await listPurchases({ user: reseller, query: { scope: "buyer" } }, list);
    const order = list.body.purchases.find(p => String(p.id) === String(quote.body.quote.id));
    assert.ok(order);
    const details = mockResponse();
    await getPurchaseById({ user: reseller, params: { id: order.id } }, details);
    assert.equal(details.statusCode, 200);
    assert.equal(details.body.purchase.status, "QUOTED");
    assert.equal(details.body.purchase.seller.role, "Super Admin");
    assert.equal(details.body.purchase.totalInr, quote.body.quote.totalInr);
  });

  await t.test("Screenshot-only proof submission and approval require no UTR reference", async () => {
    const q1 = mockResponse(), q2 = mockResponse();
    await createQuote({ user, body: { category: "CAMPAIGN", quantity: 10 } }, q1);
    await createQuote({ user, body: { category: "CAMPAIGN", quantity: 10 } }, q2);
    assert.equal(q1.statusCode, 201);
    assert.equal(q2.statusCode, 201);

    const file = { buffer: Buffer.from("%PDF-1.4 screenshot-only receipt") };
    const p1 = mockResponse(), p2 = mockResponse();
    await submitProof({ user, params: { id: q1.body.quote.id }, body: {}, file }, p1);
    await submitProof({ user, params: { id: q2.body.quote.id }, body: {}, file }, p2);
    assert.equal(p1.statusCode, 200);
    assert.equal(p2.statusCode, 200);
    assert.equal(p1.body.purchase.paymentReference, undefined);

    const app = mockResponse();
    await approvePurchase({ user: reseller, params: { id: q1.body.quote.id }, body: {} }, app);
    assert.equal(app.statusCode, 200);
    assert.equal(app.body.purchase.status, "APPROVED");
  });

});
