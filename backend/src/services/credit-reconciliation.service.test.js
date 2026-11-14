import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

Object.assign(process.env, { MONGO_URI: "mongodb://127.0.0.1:1/unused", JWT_SECRET: "reconciliation-test", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379", REDIS_PASSWORD: "test-only", AUDIT_SIGNING_KEY: "reconciliation-tests-only-signing-key-123456", DOTENV_CONFIG_QUIET: "true" });
let replica, User, Wallet, Transaction, models, evidence, service, controller, worker, AuditEvent;
const admin = { _id: new mongoose.Types.ObjectId(), username: "Super administrator", role: "Super Admin", status: "active" };
const manager = { _id: new mongoose.Types.ObjectId(), username: "Reseller", role: "Reseller", status: "active" };
const oid = () => new mongoose.Types.ObjectId();
const req = (userId, body = {}, actor = admin) => ({ user: actor, params: { userId: String(userId) }, body, isPreview: false });
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; } });
async function inspect(userId, options) { const session = await mongoose.startSession(); try { return await session.withTransaction(() => evidence.inspectCreditAccount(userId, session, options)); } finally { await session.endSession(); } }
async function makeAccount(name, openingKnown = true) {
    const account = { _id: oid(), username: name, role: "User", resellerId: manager._id, status: "active" };
    await User.collection.insertOne({ ...account, email: `${account._id}@example.test`, password: "unused" });
    if (openingKnown) await Wallet.create({ userId: account._id, balance: 0 });
    else await Wallet.collection.insertOne({ userId: account._id, balance: 0, balanceMinor: 0, createdAt: new Date(), updatedAt: new Date() });
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const wallet = await Wallet.findOneAndUpdate({ userId: account._id }, { $inc: { balance: 100 } }, { session, returnDocument: "after" });
            await Transaction.create([{ type: "ALLOCATE", amount: 100, fromUser: null, toUser: account._id, balanceAfterTo: wallet.balance, performedBy: admin._id }], { session });
        });
    } finally { await session.endSession(); }
    return account;
}
async function drift(account, delta) { await Wallet.collection.updateOne({ userId: account._id }, { $inc: { balance: delta, balanceMinor: Math.round(delta * 100) }, $set: { updatedAt: new Date() } }); }
const reason = "Verified against the original allocation receipt and account records.";
const recoveryDetails = (extra = {}) => ({ amount: 10, originalType: "ALLOCATE", effectiveAt: new Date().toISOString(), transactionVerified: true, ...extra });
async function plan(account, mode, extra = {}) { return service.prepareCreditRepair(req(account._id, { mode, reason, sourceReference: `PROOF-${account._id}-${mode}`, ...extra })); }
async function execute(account, review) { const request = req(account._id); request.params.planId = review.id; return service.executeCreditRepair(request); }

before(async () => {
    const cached = fileURLToPath(new URL("../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe", import.meta.url));
    replica = await MongoMemoryReplSet.create({ ...(existsSync(cached) ? { binary: { systemBinary: cached } } : {}), replSet: { count: 1 } });
    mongoose.set("autoIndex", false);
    await mongoose.connect(replica.getUri("credit_reconciliation_tests"));
    ({ default: User } = await import("../models/user.model.js"));
    ({ default: Wallet } = await import("../models/wallet.model.js"));
    ({ default: Transaction } = await import("../models/transaction.model.js"));
    models = await import("../models/credit-reconciliation.model.js");
    ({ AuditEvent } = await import("../models/audit.model.js"));
    evidence = await import("./credit-evidence.service.js");
    service = await import("./credit-reconciliation.service.js");
    controller = await import("../controllers/credit-reconciliation.controller.js");
    worker = await import("../workers/credit-reconciliation.worker.js");
    await Promise.all([User, Wallet, Transaction, AuditEvent, ...Object.values(models)].map(model => model.init()));
    await Promise.all(Object.values(models).map(model => model.createIndexes()));
    await User.collection.insertMany([admin, manager].map(user => ({ ...user, email: `${user._id}@example.test`, password: "unused" })));
});
after(async () => { await worker?.closeCreditReconciliationWorker(); await mongoose.disconnect(); await replica?.stop(); });

test("only an active Super Admin outside preview and impersonation can use reconciliation", () => {
    assert.doesNotThrow(() => service.requireReconciliationAdmin(req(oid())));
    for (const request of [req(oid(), {}, manager), req(oid(), {}, { role: "User" }), { ...req(oid()), isPreview: true }, { ...req(oid()), isImpersonation: true }, req(oid(), {}, { ...admin, status: "blocked" })]) assert.throws(() => service.requireReconciliationAdmin(request), { statusCode: 403 });
});
test("matching legacy test accounts do not create flags or require opening verification", async () => {
    const known = await makeAccount("Verified opening");
    assert.equal((await inspect(known._id)).summary.classification, "matched");
    const legacy = await makeAccount("Historical opening", false);
    const view = await inspect(legacy._id);
    assert.equal(view.summary.opening.amount, 0);
    assert.equal(view.summary.opening.verified, false);
    assert.equal(view.summary.classification, "matched");
    assert.equal(view.summary.needsReview, false);
    await service.checkCreditAccount(legacy._id);
    assert.equal(await models.CreditCase.countDocuments({ userId: legacy._id, state: "open" }), 0);
    await assert.rejects(plan(legacy, "wallet"), { statusCode: 409 });
    await drift(legacy, 1);
    assert.equal((await inspect(legacy._id)).summary.classification, "confirmed");
    const correction = await plan(legacy, "wallet");
    assert.equal((await execute(legacy, correction)).after.classification, "matched");
    assert.equal((await Wallet.findOne({ userId: legacy._id })).balance, 100);
});
test("over-credit repair changes only the wallet, with signed audit and a neutral user result", async () => {
    const account = await makeAccount("Extra credit"); await drift(account, 1);
    await service.checkCreditAccount(account._id); await service.checkCreditAccount(account._id);
    assert.equal(await models.CreditCase.countDocuments({ userId: account._id }), 1);
    assert.equal(await models.CreditCaseEvent.countDocuments({ userId: account._id, action: "detected" }), 1);
    const count = await Transaction.countDocuments({ toUser: account._id });
    const review = await plan(account, "wallet");
    assert.equal(review.before.walletBalance, 101); assert.equal(review.proposed.walletBalance, 100); assert.equal(review.proposed.delta, -1);
    await execute(account, review);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 100);
    assert.equal(await Transaction.countDocuments({ toUser: account._id }), count);
    assert.equal((await inspect(account._id)).summary.classification, "matched");
    assert.equal((await models.CreditCase.findOne({ userId: account._id })).state, "resolved");
    const res = response(); await controller.ownCreditBalanceResult({ user: account, query: { userId: String(admin._id) } }, res);
    assert.deepEqual(Object.keys(res.body.result).sort(), ["at", "balance", "version"]);
    assert.equal(res.body.result.balance, 100);
    const wallet = await Wallet.findOne({ userId: account._id });
    assert(await AuditEvent.exists({ stream: `wallet:${wallet._id}`, action: "wallet.reconciled" }));
    assert.equal((await execute(account, review)).replayed, true);
    assert.equal(await models.CreditRepair.countDocuments({ userId: account._id }), 1);
});
test("under-credit repair restores missing wallet credits without another economic allocation", async () => {
    const account = await makeAccount("Missing wallet credit"); await drift(account, -3);
    const review = await plan(account, "wallet"); assert.equal(review.proposed.delta, 3);
    await execute(account, review);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 100);
    assert.equal(await Transaction.countDocuments({ toUser: account._id }), 1);
});
test("restoring missing ledger evidence never credits the wallet again", async () => {
    const account = await makeAccount("Missing refund record"); await drift(account, 4);
    const review = await plan(account, "ledger", { originalType: "REFUND", effectiveAt: new Date().toISOString() });
    await execute(account, review);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 104);
    const view = await inspect(account._id);
    assert.equal(view.summary.expectedBalance, 104); assert.equal(view.summary.classification, "matched");
    assert.equal(await models.CreditRecovery.countDocuments({ userId: account._id }), 1);
    assert(view.entries.some(entry => entry.restored && entry.originalType === "REFUND"));
});
test("stale reviews cannot repair a wallet; failure evidence survives rollback", async () => {
    const account = await makeAccount("Concurrent credit"); await drift(account, 1);
    const review = await plan(account, "wallet"); await drift(account, 1);
    await assert.rejects(execute(account, review), { statusCode: 409 });
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 102);
    assert.equal(await models.CreditRepair.countDocuments({ userId: account._id }), 0);
    assert.equal(await models.CreditCaseEvent.countDocuments({ userId: account._id, action: "repair_failed" }), 1);
});
test("concurrent confirmation is idempotent and does not repair twice", async () => {
    const account = await makeAccount("Retry confirmation"); await drift(account, 2);
    const review = await plan(account, "wallet");
    await Promise.all([execute(account, review), execute(account, review)]);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 100);
    assert.equal(await models.CreditRepair.countDocuments({ planId: review.id }), 1);
});
test("full evidence pagination keeps its calculation complete and account-specific", async () => {
    const account = await makeAccount("Full history"); const other = await makeAccount("Other wallet");
    await Transaction.collection.insertMany(Array.from({ length: 60 }, (_, index) => ({ _id: oid(), fromUser: null, toUser: account._id, type: "REQUEST", amount: index + 1, notes: `Request ${index}`, createdAt: new Date(Date.now() + index) })));
    const view = await inspect(account._id, { page: 2, limit: 25, search: "Request" });
    assert.equal(view.entries.length, 25); assert.equal(view.pagination.total, 60);
    assert.equal(view.summary.transactionCount, 61); assert.equal(view.summary.expectedBalance, 100);
    assert(!view.entries.some(entry => String(entry.performedBy) === String(other._id)));
});
test("an independently conflicting ledger blocks correction instead of showing a genuine flag", async () => {
    const account = await makeAccount("Conflicting postings");
    await Transaction.collection.updateOne({ toUser: account._id, type: "ALLOCATE" }, { $set: { amountMinor: 9999 } });
    await drift(account, 1);
    const view = await inspect(account._id);
    assert.equal(view.summary.classification, "cannot_confirm");
    assert.equal(view.summary.calculationsAgree, false);
    await assert.rejects(plan(account, "wallet"), { statusCode: 409 });
});
test("credit checks roll back with their operation and remain durable after successful writes", async () => {
    const account = await makeAccount("Durable checks");
    const before = await models.CreditAuditJob.findOne({ userId: account._id }).lean();
    const session = await mongoose.startSession();
    try { await assert.rejects(session.withTransaction(async () => { await Wallet.findOneAndUpdate({ userId: account._id }, { $inc: { balance: 1 } }, { session }); throw new Error("rollback"); })); }
    finally { await session.endSession(); }
    const after = await models.CreditAuditJob.findOne({ userId: account._id }).lean();
    assert.equal(after.generation, before.generation);
    assert.equal(after.dirty, true);
});
test("a matched recheck can close a flag with no balance change", async () => {
    const account = await makeAccount("False flag closure"); await drift(account, 1); await service.checkCreditAccount(account._id); await drift(account, -1);
    const review = await plan(account, "close"); await execute(account, review);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 100);
    assert.equal(await models.CreditCaseEvent.countDocuments({ userId: account._id, action: "closed_without_change" }), 1);
    assert.equal(await models.CreditBalanceResult.countDocuments({ userId: account._id }), 0);
});
test("database-wide scans queue all wallets without changing credit balances", async () => {
    const before = await Wallet.find().select("userId balance").lean();
    await worker.requestCreditFullScan(); await worker.runCreditCheckCycle();
    const after = await Wallet.find().select("userId balance").lean();
    assert.deepEqual(after, before);
    for (const wallet of before) assert(await models.CreditAuditJob.exists({ userId: wallet.userId }));
});

test("unverified signed evidence cannot be used to justify a correction", async () => {
    const account = await makeAccount("Altered signed evidence"); await drift(account, 1);
    const wallet = await Wallet.findOne({ userId: account._id });
    await AuditEvent.collection.updateOne({ stream: `wallet:${wallet._id}` }, { $set: { "data.after.balance": 987 } });
    const view = await inspect(account._id);
    assert.equal(view.summary.audit.verified, false);
    assert.equal(view.summary.classification, "cannot_confirm");
    await assert.rejects(plan(account, "wallet"), { statusCode: 409 });
    assert.equal((await Wallet.findById(wallet._id)).balance, 101);
});

test("a negative expected balance cannot become a negative wallet repair", async () => {
    const account = await makeAccount("Negative ledger result");
    // Simulate a damaged historical debit without changing the live wallet.
    await Transaction.collection.insertOne({ type: "DEDUCT", amount: 101, fromUser: account._id, toUser: null, createdAt: new Date() });
    assert.equal((await inspect(account._id)).summary.expectedBalance, -1);
    await assert.rejects(plan(account, "wallet"), /negative balance/);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 100);
});

test("a missing debit is restored without charging the wallet again, and existing references are rejected", async () => {
    const account = await makeAccount("Missing debit record"); await drift(account, -2);
    await assert.rejects(plan(account, "ledger", { originalType: "REFUND", effectiveAt: new Date().toISOString() }), /direction/);
    const existing = await Transaction.findOne({ toUser: account._id });
    await assert.rejects(plan(account, "ledger", { originalType: "DEDUCT", effectiveAt: new Date().toISOString(), sourceReference: `TXN-${existing._id}` }), /already in this account/);
    const review = await plan(account, "ledger", { originalType: "DEDUCT", effectiveAt: new Date().toISOString() });
    await execute(account, review);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 98);
    assert.equal((await inspect(account._id)).summary.classification, "matched");
    await assert.rejects(models.CreditRecovery.updateOne({ userId: account._id }, { $set: { deltaMinor: 0 } }), /overwritten/);
});

test("expiry, admin ownership, and neutral result scoping are enforced", async () => {
    const account = await makeAccount("Expired review"); await drift(account, 1);
    const review = await plan(account, "wallet");
    const otherAdmin = { ...admin, _id: oid() };
    await assert.rejects(service.executeCreditRepair({ ...req(account._id, {}, otherAdmin), params: { userId: String(account._id), planId: review.id } }), { statusCode: 404 });
    await models.CreditRepairPlan.collection.updateOne({ _id: new mongoose.Types.ObjectId(review.id) }, { $set: { expiresAt: new Date(0) } });
    await assert.rejects(execute(account, review), /expired/);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 101);
    const res = response(); await controller.ownCreditBalanceResult({ user: account, query: { userId: String(admin._id) } }, res);
    assert.equal(res.body.result, null);
});

test("a failure after the wallet write rolls back the balance, success audit, and user result", async (t) => {
    const account = await makeAccount("Atomic repair rollback"); await drift(account, 1);
    const review = await plan(account, "wallet");
    const wallet = await Wallet.findOne({ userId: account._id });
    const receiptFailure = t.mock.method(models.CreditRepair, "create", async () => { throw new Error("Simulated receipt storage failure"); });
    try { await assert.rejects(execute(account, review), /receipt storage failure/); }
    finally { receiptFailure.mock.restore(); }
    assert.equal((await Wallet.findById(wallet._id)).balance, 101);
    assert.equal(await models.CreditRepair.countDocuments({ userId: account._id }), 0);
    assert.equal(await models.CreditBalanceResult.countDocuments({ userId: account._id }), 0);
    assert.equal(await AuditEvent.countDocuments({ stream: `wallet:${wallet._id}`, action: "wallet.reconciled" }), 0);
    assert.equal(await models.CreditCaseEvent.countDocuments({ userId: account._id, action: "repair_completed" }), 0);
    assert.equal(await models.CreditCaseEvent.countDocuments({ userId: account._id, action: "repair_failed" }), 1);
});

test("matching legacy flags are excluded immediately and cleared with an audit record", async () => {
    const account = await makeAccount("Old matching flag", false);
    const view = await inspect(account._id);
    await models.CreditCase.create({ userId: account._id, state: "open", classification: "cannot_confirm", summary: { ...view.summary, classification: "cannot_confirm", concerns: ["Legacy opening verification required"] }, snapshot: view.snapshot });
    const res = response(); await controller.listReconciliationCases({ ...req(account._id), query: { state: "open", search: "Old matching flag" } }, res);
    assert.equal(res.body.pagination.total, 0);
    await service.checkCreditAccount(account._id);
    assert.equal((await models.CreditCase.findOne({ userId: account._id })).state, "resolved");
    assert.equal(await models.CreditCaseEvent.countDocuments({ userId: account._id, action: "cleared_by_check" }), 1);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 100);
});

test("a verified transaction missing from both records updates wallet and ledger once", async () => {
    const account = await makeAccount("Completed transaction missing from both");
    const review = await plan(account, "transaction", recoveryDetails());
    assert.equal(review.before.walletBalance, 100); assert.equal(review.before.expectedBalance, 100);
    assert.equal(review.proposed.walletBalance, 110); assert.equal(review.proposed.expectedBalance, 110);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 100, "Preview never moves credits");
    assert.equal(await models.CreditRecovery.countDocuments({ userId: account._id }), 0);
    await execute(account, review);
    const view = await inspect(account._id, { search: review.sourceReference });
    assert.equal(view.summary.walletBalance, 110); assert.equal(view.summary.expectedBalance, 110);
    assert.equal(view.summary.classification, "matched"); assert.equal(view.entries.length, 1);
    assert.equal(view.entries[0].walletApplied, true); assert.equal(view.entries[0].delta, 10);
    assert.equal((await models.CreditCase.findOne({ userId: account._id })).state, "resolved");
    const receipt = await models.CreditRepair.findOne({ planId: review.id });
    assert.equal(receipt.evidence.transactionVerified, true);
    assert.equal(await Transaction.countDocuments({ toUser: account._id }), 1, "Preserve posted transaction history");
    assert.equal((await execute(account, review)).replayed, true);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 110);
    const res = response(); await controller.ownCreditBalanceResult({ user: account }, res);
    assert.deepEqual(Object.keys(res.body.result).sort(), ["at", "balance", "version"]);
    assert.equal(res.body.result.balance, 110);
});

test("reseller refunds can be recovered and later ordinary transactions remain consistent", async () => {
    const account = await makeAccount("Reseller transaction recovery");
    await User.collection.updateOne({ _id: account._id }, { $set: { role: "Reseller" } });
    const review = await plan(account, "transaction", recoveryDetails({ amount: "0.25", originalType: "REFUND" }));
    await execute(account, review);
    assert.equal((await inspect(account._id)).summary.walletBalance, 100.25);
    const session = await mongoose.startSession();
    try { await session.withTransaction(async () => {
        const wallet = await Wallet.findOneAndUpdate({ userId: account._id }, { $inc: { balance: 5 } }, { session, returnDocument: "after" });
        await Transaction.create([{ type: "ALLOCATE", amount: 5, fromUser: null, toUser: account._id, balanceAfterTo: wallet.balance, performedBy: admin._id }], { session });
    }); } finally { await session.endSession(); }
    const view = await inspect(account._id);
    assert.equal(view.summary.walletBalance, 105.25); assert.equal(view.summary.expectedBalance, 105.25);
    assert.equal(view.summary.classification, "matched");
});

test("recovery requires completed evidence, a supported movement, a valid amount and original time", async () => {
    const account = await makeAccount("Invalid transaction recovery");
    await assert.rejects(plan(account, "transaction", recoveryDetails({ transactionVerified: false })), /Verify that the original transaction completed/);
    for (const amount of [0, -1, "", 0.001, Infinity, Number.MAX_SAFE_INTEGER]) await assert.rejects(plan(account, "transaction", recoveryDetails({ amount })), { statusCode: 400 });
    await assert.rejects(plan(account, "transaction", recoveryDetails({ originalType: "REQUEST" })), /Requests cannot/);
    for (const effectiveAt of [null, "invalid", new Date(Date.now() + 60000).toISOString(), "2000-01-01T00:00:00.000Z"]) await assert.rejects(plan(account, "transaction", recoveryDetails({ effectiveAt })), /original transaction time/);
    await assert.rejects(service.prepareCreditRepair(req(account._id, { mode: "transaction", ...recoveryDetails(), reason, sourceReference: "proof" }, manager)), { statusCode: 403 });
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 100);
    assert.equal(await models.CreditRecovery.countDocuments({ userId: account._id }), 0);
});

test("recovery is blocked by existing discrepancies, conflicting audit evidence and insufficient credits", async () => {
    const account = await makeAccount("Recovery existing discrepancy"); await drift(account, 1);
    await assert.rejects(plan(account, "transaction", recoveryDetails()), /existing wallet discrepancy/);
    await drift(account, -1);
    await assert.rejects(plan(account, "transaction", recoveryDetails({ originalType: "DEDUCT", amount: 101 })), /negative or unsupported/);
    const wallet = await Wallet.findOne({ userId: account._id });
    await AuditEvent.collection.updateOne({ stream: `wallet:${wallet._id}` }, { $set: { "data.after.balance": 123 } });
    await assert.rejects(plan(account, "transaction", recoveryDetails()), /audit history must be verified/);
});

test("already posted references and normalized duplicate recoveries are rejected across accounts", async () => {
    const account = await makeAccount("Original reference owner"), other = await makeAccount("Other recovery target");
    const posted = await Transaction.findOne({ toUser: account._id });
    await assert.rejects(plan(account, "transaction", recoveryDetails({ sourceReference: `TXN-${posted._id}` })), /already in this account/);
    await assert.rejects(plan(other, "transaction", recoveryDetails({ sourceReference: String(posted._id) })), /already in this account/);
    const sourceReference = `Receipt-${account._id}-001`;
    const review = await plan(account, "transaction", recoveryDetails({ sourceReference })); await execute(account, review);
    const recovered = await models.CreditRecovery.findOne({ userId: account._id });
    await assert.rejects(plan(other, "transaction", recoveryDetails({ sourceReference: `REC-${recovered._id}` })), /existing recovered ledger entry/);
    await assert.rejects(plan(account, "transaction", recoveryDetails({ sourceReference: String(recovered._id) })), /existing recovered ledger entry/);
    await assert.rejects(plan(account, "transaction", recoveryDetails({ sourceReference: sourceReference.toLowerCase() })), /already been restored or recovered/);
    await assert.rejects(plan(other, "transaction", recoveryDetails({ sourceReference: `  ${sourceReference.toUpperCase()}  ` })), /already been restored or recovered/);
    assert.equal((await Wallet.findOne({ userId: other._id })).balance, 100);
});

test("older immutable ledger restoration evidence cannot be paid again through transaction recovery", async () => {
    const original = await makeAccount("Legacy restoration original"), target = await makeAccount("Legacy restoration duplicate");
    const sourceReference = `OLD-RECEIPT-${original._id}`;
    await models.CreditRecovery.collection.insertOne({ userId: original._id, sourceReference, deltaMinor: 100, effectiveAt: new Date(), originalType: "REFUND", reason, performedBy: admin._id, planId: oid(), createdAt: new Date() });
    await assert.rejects(plan(target, "transaction", recoveryDetails({ sourceReference: sourceReference.toLowerCase() })), /already been restored or recovered/);
});

test("concurrent cross-account recovery of one source transaction commits exactly once", async () => {
    const first = await makeAccount("Concurrent recovery first"), second = await makeAccount("Concurrent recovery second");
    const sourceReference = `SHARED-SOURCE-${oid()}`;
    const one = await plan(first, "transaction", recoveryDetails({ sourceReference })), two = await plan(second, "transaction", recoveryDetails({ sourceReference }));
    const outcomes = await Promise.allSettled([execute(first, one), execute(second, two)]);
    assert.equal(outcomes.filter(outcome => outcome.status === "fulfilled").length, 1);
    assert.equal(outcomes.find(outcome => outcome.status === "rejected").reason.statusCode, 409);
    const wallets = await Wallet.find({ userId: { $in: [first._id, second._id] } }).lean();
    assert.deepEqual(wallets.map(wallet => wallet.balance).sort(), [100, 110]);
    assert.equal(await models.CreditRecovery.countDocuments({ sourceReference }), 1);
});

test("same-plan concurrent recovery and changed-wallet confirmation never pay twice", async () => {
    const account = await makeAccount("Idempotent transaction recovery");
    const review = await plan(account, "transaction", recoveryDetails());
    await Promise.all([execute(account, review), execute(account, review)]);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 110);
    assert.equal(await models.CreditRecovery.countDocuments({ userId: account._id }), 1);
    const stale = await plan(account, "transaction", recoveryDetails({ sourceReference: `SECOND-${oid()}` }));
    await drift(account, 1);
    await assert.rejects(execute(account, stale), /changed after your review/);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 111);
    assert.equal(await models.CreditRecovery.countDocuments({ userId: account._id }), 1);
});

test("a recovered debit changes both records and retains signed provenance", async () => {
    const account = await makeAccount("Missing completed debit");
    const review = await plan(account, "transaction", recoveryDetails({ amount: 5, originalType: "DEDUCT" }));
    await execute(account, review);
    let view = await inspect(account._id); assert.equal(view.summary.walletBalance, 95); assert.equal(view.summary.expectedBalance, 95);
    assert.equal(view.summary.classification, "matched");
    await models.CreditRecovery.collection.updateOne({ userId: account._id }, { $set: { walletApplied: false } });
    view = await inspect(account._id); assert.equal(view.summary.classification, "cannot_confirm");
    assert(view.summary.concerns.some(concern => concern.includes("signed source evidence")));
});

test("transaction recovery rolls back the wallet, ledger, source claim and result if its receipt fails", async (t) => {
    const account = await makeAccount("Transaction recovery rollback");
    const review = await plan(account, "transaction", recoveryDetails());
    const job = await models.CreditAuditJob.findOne({ userId: account._id }).lean();
    const failure = t.mock.method(models.CreditRepair, "create", async () => { throw new Error("Recovery receipt unavailable"); });
    try { await assert.rejects(execute(account, review), /receipt unavailable/); } finally { failure.mock.restore(); }
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 100);
    assert.equal((await models.CreditAuditJob.findOne({ userId: account._id })).generation, job.generation);
    assert.equal(await models.CreditRecovery.countDocuments({ userId: account._id }), 0);
    assert.equal(await models.CreditBalanceResult.countDocuments({ userId: account._id }), 0);
    assert.equal(await models.CreditCaseEvent.countDocuments({ userId: account._id, action: "repair_failed" }), 1);
    await execute(account, review);
    assert.equal((await Wallet.findOne({ userId: account._id })).balance, 110);
});

test("account lookup includes unflagged matching clients and resellers and excludes Super Admin and private fields", async () => {
    const account = await makeAccount("Lookup unflagged matching client");
    const request = { ...req(account._id), query: { q: "Lookup unflagged" } };
    const res = response(); await controller.searchRecoveryAccounts(request, res);
    assert.equal(res.statusCode, 200); assert(res.body.items.some(item => item._id === String(account._id)));
    assert.deepEqual(Object.keys(res.body.items[0]).sort(), ["_id", "role", "username"]);
    const denied = response(); await controller.searchRecoveryAccounts({ ...request, user: manager }, denied); assert.equal(denied.statusCode, 403);
    const empty = response(); await controller.searchRecoveryAccounts({ ...request, query: { q: "[.*" } }, empty); assert.equal(empty.body.items.length, 0);
    const short = response(); await controller.searchRecoveryAccounts({ ...request, query: { q: "" } }, short); assert.equal(short.body.items.length, 0);
});
