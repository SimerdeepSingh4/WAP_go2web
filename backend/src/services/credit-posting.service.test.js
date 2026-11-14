import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

Object.assign(process.env, { MONGO_URI: "mongodb://127.0.0.1:1/unused", JWT_SECRET: "posting-test", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379", REDIS_PASSWORD: "test-only", AUDIT_SIGNING_KEY: "credit-posting-test-signing-key-123456789", DOTENV_CONFIG_QUIET: "true" });
const queueStub = `export const campaignQueue={on(){},close:async()=>{}};export const scheduleCampaignJob=async()=>null;export const cancelCampaignJob=async()=>false;export const getCampaignJobStatus=async()=>null;`;
const hooks = registerHooks({ resolve(specifier, context, next) { return specifier.endsWith("/queues/campaign.queue.js") ? { url: `data:text/javascript,${encodeURIComponent(queueStub)}`, shortCircuit: true } : next(specifier, context); } });
let replica, User, Wallet, Transaction, Campaign, AuditEvent, CreditOperation, service, operations, guard, evidence, controllers, campaigns;
const oid = () => new mongoose.Types.ObjectId();
const admin = { _id: oid(), role: "Super Admin", username: "Posting administrator", status: "active" };
const response = () => ({ statusCode: 200, headers: {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; }, set(name, value) { this.headers[name] = value; return this; } });
const transient = () => Object.assign(new Error("Simulated temporary write conflict"), { hasErrorLabel: label => label === "TransientTransactionError" });
async function account(role = "User", balance = 0, resellerId = null) {
    const user = { _id: oid(), role, username: `Account ${oid()}`, status: "active", resellerId, ratePerMsg: 2 };
    await User.collection.insertOne({ ...user, email: `${user._id}@example.test`, password: "unused" });
    await Wallet.create({ userId: user._id, balance: 0, resellerId });
    if (balance) await move(user, balance, "ALLOCATE", `seed:${user._id}`);
    return user;
}
async function move(user, amount, type, operationKey, extra = {}) {
    return operations.runCreditTransaction(session => service.postCreditMovement({ session, operationKey, type, amount, fromUser: type === "DEDUCT" ? user._id : null, toUser: user._id, performedBy: admin._id, ...extra }), { walletIds: [user._id] });
}
async function balance(user) { return (await Wallet.findOne({ userId: user._id }).lean()).balance; }
async function view(user) { const session = await mongoose.startSession(); try { return await session.withTransaction(() => evidence.inspectCreditAccount(user._id, session)); } finally { await session.endSession(); } }
async function rawOperation(work) { const session = await mongoose.startSession(); try { await session.withTransaction(() => work(session)); } finally { await session.endSession(); } }

before(async () => {
    const binary = fileURLToPath(new URL("../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe", import.meta.url));
    replica = await MongoMemoryReplSet.create({ ...(existsSync(binary) ? { binary: { systemBinary: binary } } : {}), replSet: { count: 1 } });
    mongoose.set("autoIndex", false);
    await mongoose.connect(replica.getUri("credit_posting_tests"));
    ({ default: User } = await import("../models/user.model.js")); ({ default: Wallet } = await import("../models/wallet.model.js"));
    ({ default: Transaction } = await import("../models/transaction.model.js")); ({ default: Campaign } = await import("../models/campaign.model.js"));
    ({ AuditEvent } = await import("../models/audit.model.js")); ({ default: CreditOperation } = await import("../models/credit-operation.model.js"));
    service = await import("./credit-posting.service.js"); operations = await import("../helpers/credit-operation.js"); guard = await import("../helpers/credit-session-guard.js"); evidence = await import("./credit-evidence.service.js");
    controllers = await import("../controllers/credit.controller.js"); campaigns = await import("../controllers/campaign.controller.js");
    const reconciliation = await import("../models/credit-reconciliation.model.js");
    await Promise.all([User, Wallet, Transaction, Campaign, AuditEvent, CreditOperation, ...Object.values(reconciliation)].map(model => model.init()));
    await Promise.all([Wallet, Transaction, AuditEvent, CreditOperation, ...Object.values(reconciliation)].map(model => model.createIndexes()));
    await User.collection.insertOne({ ...admin, email: "posting-admin@example.test", password: "unused" });
});
after(async () => { hooks.deregister(); await mongoose.disconnect(); await replica?.stop(); });

test("wallet-only, ledger-only and unequal movements cannot commit", async () => {
    for (const kind of ["wallet-only", "ledger-only", "unequal"]) {
        const user = await account();
        await assert.rejects(rawOperation(async session => {
            if (kind !== "ledger-only") await Wallet.findOneAndUpdate({ userId: user._id }, { $inc: { balance: 7 } }, { session });
            if (kind !== "wallet-only") await Transaction.create([{ type: "ALLOCATE", amount: 5, fromUser: null, toUser: user._id, balanceAfterTo: kind === "unequal" ? 7 : 5, performedBy: admin._id }], { session });
        }), { code: "CREDIT_INVARIANT_FAILED" });
        assert.equal(await balance(user), 0); assert.equal(await Transaction.countDocuments({ toUser: user._id }), 0);
    }
    assert(await AuditEvent.countDocuments({ action: "credit.posting_blocked" }) >= 3);
});

test("alternate balance operators, replacements, minor edits and bulk writes are blocked", async () => {
    const user = await account("User", 10);
    for (const update of [{ $max: { balance: 20 } }, { $min: { balance: 0 } }, { $mul: { balance: 2 } }, { $inc: { balanceMinor: 100 } }, { $rename: { value: "balance" } }, { $unset: { balance: 1 } }, { $set: { balance: 20 } }, { $inc: { balance: 1 }, $set: { balanceMinor: 1100 } }]) {
        await assert.rejects(rawOperation(session => Wallet.findOneAndUpdate({ userId: user._id }, update, { session })), { code: "CREDIT_INVARIANT_FAILED" });
    }
    const wallet = await Wallet.findOne({ userId: user._id }); wallet.balanceMinor += 1;
    await assert.rejects(wallet.save(), { code: "CREDIT_INVARIANT_FAILED" });
    await assert.rejects(Wallet.replaceOne({ userId: user._id }, { userId: user._id }), { code: "CREDIT_INVARIANT_FAILED" });
    await assert.rejects(Wallet.bulkWrite([{ updateOne: { filter: { userId: user._id }, update: { $set: { balance: 50 } } } }]));
    await assert.rejects(Transaction.insertMany([{ amount: 1, type: "ALLOCATE", toUser: user._id, performedBy: admin._id }]));
    assert.equal(await balance(user), 10); assert.equal((await view(user)).summary.classification, "matched");
});

test("raw wallet modification after a balanced posting is detected before commit", async () => {
    const user = await account();
    await assert.rejects(rawOperation(async session => {
        await service.postCreditMovement({ session, operationKey: `raw-edit:${user._id}`, type: "ALLOCATE", amount: 7, toUser: user._id, performedBy: admin._id });
        await Wallet.collection.updateOne({ userId: user._id }, { $inc: { balance: 1, balanceMinor: 100 } }, { session });
    }), { code: "CREDIT_INVARIANT_FAILED" });
    assert.equal(await balance(user), 0); assert.equal(await Transaction.countDocuments({ toUser: user._id }), 0);
});

test("a funded transfer needs both snapshots and system issuance needs Super Admin", async () => {
    const from = await account("Reseller", 30), to = await account("User", 0, from._id);
    const { buildCreditPostings } = await import("../helpers/ledger-postings.js");
    assert.throws(() => buildCreditPostings({ type: "ALLOCATE", amount: 5, fromUser: from._id, toUser: to._id, balanceAfterFrom: null, balanceAfterTo: 5 }), /snapshot/);
    await assert.rejects(move(to, 5, "ALLOCATE", `unauthorized:${to._id}`, { performedBy: to._id }), { statusCode: 403 });
    await operations.runCreditTransaction(session => service.postCreditMovement({ session, operationKey: `transfer:${to._id}`, type: "ALLOCATE", amount: 5, fromUser: from._id, toUser: to._id, performedBy: from._id }), { walletIds: [from._id, to._id] });
    assert.equal(await balance(from), 25); assert.equal(await balance(to), 5);
    assert.equal((await view(from)).summary.classification, "matched"); assert.equal((await view(to)).summary.classification, "matched");
});

test("ordinary movements preserve an existing discrepancy instead of concealing it", async () => {
    const user = await account("User", 100);
    await Wallet.collection.updateOne({ userId: user._id }, { $inc: { balance: 5, balanceMinor: 500 } });
    await move(user, 10, "ALLOCATE", `preserve-drift:${user._id}`);
    const result = await view(user); assert.equal(result.summary.walletBalance, 115); assert.equal(result.summary.expectedBalance, 110); assert.equal(result.summary.difference, 5);
});

test("one operation reference pays once and changed details cannot reuse it", async () => {
    const user = await account(), key = `unique:${user._id}`;
    const one = await move(user, 7, "ALLOCATE", key), two = await move(user, 7, "ALLOCATE", key);
    assert.equal(two.replayed, true); assert.equal(String(one.transaction._id), String(two.transaction._id)); assert.equal(await balance(user), 7);
    await assert.rejects(move(user, 8, "ALLOCATE", key), { code: "CREDIT_REFERENCE_REUSED" });
    assert.equal(await Transaction.countDocuments({ operationKey: key }), 1);
});

test("temporary conflicts retry fresh transactions and permanent failures do not retry", async () => {
    const user = await account(); let calls = 0;
    await operations.runCreditTransaction(async session => {
        calls++;
        const result = await service.postCreditMovement({ session, operationKey: `retry:${user._id}`, type: "ALLOCATE", amount: 10, toUser: user._id, performedBy: admin._id });
        if (calls < 3) throw transient(); return result;
    }, { backoff: false, walletIds: [user._id] });
    assert.equal(calls, 3); assert.equal(await balance(user), 10); assert.equal(await Transaction.countDocuments({ operationKey: `retry:${user._id}` }), 1);
    calls = 0;
    await assert.rejects(operations.runCreditTransaction(async () => { calls++; throw new Error("Invalid source evidence"); }, { backoff: false }), /Invalid source evidence/);
    assert.equal(calls, 1);
});

test("retry limits abort every attempted movement without leaving success records", async () => {
    const user = await account(); let calls = 0;
    await assert.rejects(operations.runCreditTransaction(async session => {
        calls++; await service.postCreditMovement({ session, operationKey: `exhausted:${user._id}`, type: "ALLOCATE", amount: 10, toUser: user._id, performedBy: admin._id }); throw transient();
    }, { attempts: 3, backoff: false }), /temporary write conflict/);
    assert.equal(calls, 3); assert.equal(await balance(user), 0); assert.equal(await Transaction.countDocuments({ toUser: user._id }), 0);
});

test("a lost commit acknowledgement retries the same commit, not the operation", async () => {
    const user = await account(); const session = await mongoose.startSession(); session.startTransaction();
    const actualCommit = session.commitTransaction.bind(session); let commits = 0;
    session.commitTransaction = async (...args) => { commits++; await actualCommit(...args); if (commits === 1) throw Object.assign(new Error("Commit response lost"), { hasErrorLabel: label => label === "UnknownTransactionCommitResult" }); };
    guard.guardCreditSession(session);
    try { await service.postCreditMovement({ session, operationKey: `commit-retry:${user._id}`, type: "ALLOCATE", amount: 10, toUser: user._id, performedBy: admin._id }); await session.commitTransaction(); }
    finally { await session.endSession(); }
    assert.equal(commits, 2); assert.equal(await balance(user), 10); assert.equal(await Transaction.countDocuments({ toUser: user._id }), 1);
});

test("a hot wallet accepts 40 simultaneous valid postings without visible conflict failures", async () => {
    const user = await account("User", 100); const started = Date.now();
    const outcomes = await Promise.allSettled(Array.from({ length: 40 }, (_, index) => move(user, 1, "DEDUCT", `load:${user._id}:${index}`)));
    assert.equal(outcomes.filter(item => item.status === "rejected").length, 0, outcomes.filter(item => item.status === "rejected").map(item => item.reason.message).join("; "));
    assert.equal(await balance(user), 60); assert.equal((await view(user)).summary.classification, "matched");
    console.log(`40 simultaneous hot-wallet postings completed in ${Date.now() - started}ms.`);
});

test("concurrent opposite-direction transfers conserve the combined balance without deadlock", async () => {
    const a = await account("Reseller", 50), b = await account("Reseller", 50);
    const transfers = Array.from({ length: 12 }, (_, index) => operations.runCreditTransaction(session => service.postCreditMovement({ session, operationKey: `opposite:${a._id}:${index}`, type: "ALLOCATE", amount: 1, fromUser: index % 2 ? a._id : b._id, toUser: index % 2 ? b._id : a._id, performedBy: admin._id }), { walletIds: index % 2 ? [a._id, b._id] : [b._id, a._id] }));
    await Promise.all(transfers); assert.equal(await balance(a) + await balance(b), 100);
    assert.equal((await view(a)).summary.classification, "matched"); assert.equal((await view(b)).summary.classification, "matched");
});

test("concurrent overspending has only legitimate insufficient-credit failures", async () => {
    const user = await account("User", 5);
    const outcomes = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => move(user, 1, "DEDUCT", `spend:${user._id}:${index}`)));
    assert.equal(outcomes.filter(item => item.status === "fulfilled").length, 5);
    assert(outcomes.filter(item => item.status === "rejected").every(item => item.reason.code === "CREDIT_INSUFFICIENT"));
    assert.equal(await balance(user), 0); assert.equal((await view(user)).summary.classification, "matched");
});

test("the controller retries rolled-back conflicts and reads a saved success after an uncertain response", async () => {
    const req = { creditOperation: { key: `receipt:${oid()}`, fingerprint: "verified-input" }, body: {}, user: admin };
    let calls = 0;
    const handler = operations.retryCreditController(async (request, res) => { calls++; if (calls < 3) return res.status(409).json({ ...operations.creditErrorDetails(transient(), request), success: false }); return res.status(200).json({ success: true }); }, { backoff: false });
    const res = response(); await handler(req, res); assert.equal(calls, 3); assert.equal(res.statusCode, 200);
    calls = 0;
    const uncertain = operations.retryCreditController(async (request, result) => {
        calls++; await CreditOperation.create({ ...request.creditOperation, status: 200, response: { success: true, saved: true } });
        return result.status(503).json({ code: "CREDIT_RESULT_UNCONFIRMED", success: false });
    }, { backoff: false });
    const replay = response(); await uncertain(req, replay); assert.equal(calls, 1); assert.equal(replay.statusCode, 200); assert.equal(replay.body.saved, true);
});

test("allocation, deduction and reclaim controllers use the same posting path", async () => {
    const reseller = await account("Reseller", 30), user = await account("User", 0, reseller._id);
    const invoke = async (fn, body) => { const req = { user: reseller, body, params: {}, query: {} }, res = response(); await operations.retryCreditController(fn, { walletIds: [reseller._id, user._id] })(req, res); assert.equal(res.statusCode, 200, JSON.stringify(res.body)); return res.body; };
    await invoke(controllers.allocateCredits, { toUserId: String(user._id), amount: 10 });
    await invoke(controllers.deductCredits, { userId: String(user._id), amount: 2 });
    await invoke(controllers.reclaimCredits, { fromUserId: String(user._id), amount: 3, notes: "Returning unused credits to the reseller." });
    assert.equal(await balance(reseller), 23); assert.equal(await balance(user), 5);
    assert.equal((await view(reseller)).summary.classification, "matched"); assert.equal((await view(user)).summary.classification, "matched");
});

test("campaign creation and cancellation charge and refund exactly once", async () => {
    const user = await account("User", 20);
    const req = { user, body: { campaignTitle: "Credit posting test", messageBody: "A test message", recipients: ["919876543210", "919876543211"], schedule: "now" }, params: {}, query: {}, files: {} }, created = response();
    await operations.retryCreditController(campaigns.createCampaign, { walletIds: [user._id] })(req, created);
    assert.equal(created.statusCode, 201, JSON.stringify(created.body)); assert.equal(await balance(user), 16);
    const id = created.body.data._id;
    const charge = await Transaction.findOne({ campaignId: id, type: "DEDUCT" }); assert(charge); assert.equal(charge.amount, 4);
    const cancel = response(); await operations.retryCreditController(campaigns.cancelScheduledCampaign, { walletIds: [user._id] })({ user, body: {}, params: { id } }, cancel);
    assert.equal(cancel.statusCode, 200, JSON.stringify(cancel.body)); assert.equal(await balance(user), 20);
    const again = response(); await campaigns.cancelScheduledCampaign({ user, body: {}, params: { id } }, again);
    assert.equal(again.statusCode, 400); assert.equal(await balance(user), 20);
    assert.equal(await Transaction.countDocuments({ campaignId: id, type: "REFUND" }), 1); assert.equal((await view(user)).summary.classification, "matched");
});

test("campaign report refund adjustments and reversals preserve the ledger", async () => {
    const user = await account("User", 20), campaignId = oid();
    await Campaign.collection.insertOne({ _id: campaignId, userId: user._id, campaignTitle: "Report posting test", status: "ongoing", creditsDeducted: 4, rateSnapshot: 2, totalRecipients: 2, recipients: [{ phoneNumber: "919876543210", status: "queued" }, { phoneNumber: "919876543211", status: "queued" }], originalRecipients: ["919876543210", "919876543211"], campaignSummary: {}, createdAt: new Date(), updatedAt: new Date() });
    await move(user, 4, "DEDUCT", `campaign-original:${campaignId}`, { campaignId });
    const handler = operations.retryCreditController(campaigns.saveCampaignReport, { walletIds: [user._id] });
    for (const [billingAction, expected] of [["refund", 18], ["deduct", 16]]) {
        const res = response(); await handler({ user: admin, params: { id: String(campaignId) }, body: { categories: [{ name: "Review", billingAction, numbers: ["919876543210"] }] } }, res);
        assert.equal(res.statusCode, 200, JSON.stringify(res.body)); assert.equal(await balance(user), expected); assert.equal((await view(user)).summary.classification, "matched");
    }
});

test("a campaign total without an original charge cannot authorize a refund", async () => {
    const user = await account("User", 20), campaignId = oid();
    await Campaign.collection.insertOne({ _id: campaignId, userId: user._id, campaignTitle: "Unverified imported charge", status: "pending", creditsDeducted: 4, rateSnapshot: 2, totalRecipients: 2, createdAt: new Date(), updatedAt: new Date() });
    const res = response(); await campaigns.cancelScheduledCampaign({ user, params: { id: String(campaignId) }, body: {} }, res);
    assert.equal(res.statusCode, 409); assert.equal(await balance(user), 20); assert.equal(await Transaction.countDocuments({ campaignId }), 0);
});

test("a missing campaign rate uses the original charge rate, never the user's newer price", async () => {
    const user = await account("User", 20), campaignId = oid();
    await Campaign.collection.insertOne({ _id: campaignId, userId: user._id, campaignTitle: "Original price evidence", status: "ongoing", creditsDeducted: 4, totalRecipients: 2, campaignSummary: {}, createdAt: new Date(), updatedAt: new Date() });
    await move(user, 4, "DEDUCT", `original-price:${campaignId}`, { campaignId, rateSnapshot: 2 });
    await User.collection.updateOne({ _id: user._id }, { $set: { ratePerMsg: 20 } });
    const req = { user: admin, params: { id: String(campaignId) }, body: { categories: [{ name: "Refund one", billingAction: "refund", numbers: ["919876543210"] }] } }, res = response();
    await campaigns.saveCampaignReport(req, res);
    assert.equal(res.statusCode, 200, JSON.stringify(res.body)); assert.equal(await balance(user), 18);
    assert.equal((await Transaction.findOne({ campaignId, type: "REFUND" })).rateSnapshot, 2);
    await Campaign.collection.updateOne({ _id: campaignId }, { $set: { rateSnapshot: 20 } });
    const rejected = response(); await campaigns.saveCampaignReport(req, rejected);
    assert.equal(rejected.statusCode, 409); assert.equal(await balance(user), 18);
});

async function chargedCampaign(user, status = "ongoing") {
    const campaignId = oid();
    await Campaign.collection.insertOne({ _id: campaignId, userId: user._id, campaignTitle: "Settlement coverage", status, creditsDeducted: 4, rateSnapshot: 2, totalRecipients: 2, recipients: [{ phoneNumber: "919876543210", status: "queued" }, { phoneNumber: "919876543211", status: "queued" }], originalRecipients: ["919876543210", "919876543211"], campaignSummary: {}, createdAt: new Date(), updatedAt: new Date() });
    await move(user, 4, "DEDUCT", `settlement-charge:${campaignId}`, { campaignId, rateSnapshot: 2 });
    return campaignId;
}

test("metrics refunds are incremental and a repeated report does not repay them", async () => {
    const user = await account("User", 20), campaignId = await chargedCampaign(user);
    for (const [failed, expected] of [[1, 18], [1, 18], [2, 20]]) {
        const res = response();
        await campaigns.updateCampaignMetrics({ user: admin, params: { id: String(campaignId) }, body: { sent: 2, delivered: 2 - failed, failed } }, res);
        assert.equal(res.statusCode, 200, JSON.stringify(res.body)); assert.equal(await balance(user), expected);
    }
    assert.equal(await Transaction.countDocuments({ campaignId, type: "REFUND" }), 2);
    assert.equal((await view(user)).summary.classification, "matched");
});

test("recipient management refunds and reversals settle only their exact difference", async () => {
    const user = await account("User", 20), campaignId = await chargedCampaign(user);
    for (const [billingAction, expected] of [["refund", 18], ["refund", 18], ["deduct", 16]]) {
        const res = response();
        await campaigns.updateCampaignRecipientsManagement({ user: admin, params: { id: String(campaignId) }, body: { entries: [{ rowNumber: 1, phoneNumber: "919876543210", billingAction, category: "Review" }, { rowNumber: 2, phoneNumber: "919876543211", billingAction: "deduct", category: "Delivered" }] } }, res);
        assert.equal(res.statusCode, 200, JSON.stringify(res.body)); assert.equal(await balance(user), expected);
        assert.equal((await view(user)).summary.classification, "matched");
    }
    assert.equal(await Transaction.countDocuments({ campaignId, type: "REFUND" }), 1);
});

test("publishing a failure report returns the original remaining charge exactly once", async () => {
    const user = await account("User", 20), campaignId = await chargedCampaign(user, "failed");
    for (const spreadsheetRevision of [0, 1]) {
        const res = response();
        await campaigns.updateCampaignRecipientsManagement({ user: admin, params: { id: String(campaignId) }, body: { entries: [], saveMode: "publish", spreadsheetRevision, reportNotes: "Verified delivery failure for the original campaign." } }, res);
        assert.equal(res.statusCode, 200, JSON.stringify(res.body)); assert.equal(await balance(user), 20);
    }
    assert.equal(await Transaction.countDocuments({ campaignId, type: "REFUND" }), 1);
    assert.equal((await view(user)).summary.classification, "matched");
});

test("unverified original charges return a review response instead of changing report billing", async () => {
    const user = await account("User", 20), campaignId = oid();
    await Campaign.collection.insertOne({ _id: campaignId, userId: user._id, campaignTitle: "Missing charge proof", status: "ongoing", creditsDeducted: 4, rateSnapshot: 2, totalRecipients: 2, campaignSummary: {}, createdAt: new Date(), updatedAt: new Date() });
    const res = response();
    await campaigns.saveCampaignReport({ user: admin, params: { id: String(campaignId) }, body: { categories: [{ name: "Refund", billingAction: "refund", numbers: ["919876543210"] }] } }, res);
    assert.equal(res.statusCode, 409); assert.equal(await balance(user), 20); assert.equal(await Transaction.countDocuments({ campaignId }), 0);
});

test("fractional credits do not accumulate rounding drift and an interrupted transfer rolls back both wallets", async () => {
    const reseller = await account("Reseller", 2), user = await account("User", 0, reseller._id);
    for (let index = 0; index < 10; index++) await move(user, 0.01, "ALLOCATE", `fraction:${user._id}:${index}`);
    assert.equal(await balance(user), 0.1);
    await assert.rejects(operations.runCreditTransaction(async session => {
        await service.postCreditMovement({ session, operationKey: `interrupted:${user._id}`, type: "ALLOCATE", amount: 1, fromUser: reseller._id, toUser: user._id, performedBy: reseller._id });
        throw new Error("Interrupted before commit");
    }, { walletIds: [user._id, reseller._id] }), /Interrupted before commit/);
    assert.equal(await balance(reseller), 2); assert.equal(await balance(user), 0.1);
    assert.equal(await Transaction.countDocuments({ operationKey: `interrupted:${user._id}` }), 0);
    assert.equal((await view(user)).summary.classification, "matched");
});
