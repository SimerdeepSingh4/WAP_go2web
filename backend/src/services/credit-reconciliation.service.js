import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import Wallet from "../models/wallet.model.js";
import Transaction from "../models/transaction.model.js";
import { CreditCase, CreditCaseEvent, CreditRepairPlan, CreditRepair, CreditRecovery, CreditBalanceResult } from "../models/credit-reconciliation.model.js";
import { inspectCreditAccount, evidenceHash, reconciliationError } from "./credit-evidence.service.js";
import { appendAudit } from "./audit.service.js";
import { creditMinor, creditTransactionOptions } from "../helpers/credit-amount.js";
import { queueCreditCheck } from "../helpers/credit-audit-job.js";
import { notifyRole, notifyUser } from "./socket.service.js";
import { accountRestriction } from "../../../shared/accountAccess.js";
import { normalizedRecoveryReference, recoveryReferenceKey } from "../helpers/credit-recovery-reference.js";

export function requireReconciliationAdmin(req) {
    if (req.user?.role !== "Super Admin" || req.isPreview || req.isImpersonation || accountRestriction(req.user)) throw reconciliationError("Only an active Super Admin in their own account can access reconciliation.", 403);
}
const actorOf = req => req?.user ? { id: String(req.user._id), role: req.user.role, name: req.user.username } : { role: "System", name: "Credit monitor" };
export async function recordCreditCaseEvent(userId, action, details, actor, session) {
    const signed = await appendAudit({ stream: `reconciliation:${userId}`, action: `reconciliation.${action}`, actor,
        data: { userId: String(userId), eventDigest: evidenceHash({ userId: String(userId), action, actor, details }), ...details } }, session);
    await CreditCaseEvent.create([{ userId, action, actor, details, auditSequence: signed.sequence, auditHash: signed.hash }], { session });
}

export async function updateCreditCase(view, session, actor = actorOf()) {
    const { summary, snapshot } = view;
    if (summary.account.role === "Super Admin") return;
    const userId = summary.account.id;
    const existing = await CreditCase.findOne({ userId }).session(session).lean();
    if (!existing && summary.classification === "matched") return;
    const reopened = existing?.state === "resolved" && summary.classification !== "matched";
    const cleared = existing?.state === "open" && summary.classification === "matched";
    const changed = !existing || reopened || existing.classification !== summary.classification || existing.summary?.difference !== summary.difference;
    await CreditCase.updateOne({ userId }, { $set: { summary, snapshot, classification: summary.classification, lastCheckedAt: summary.checkedAt, lastFailure: null,
        state: summary.classification === "matched" ? "resolved" : "open", ...(cleared ? { resolvedAt: new Date() } : reopened ? { resolvedAt: null } : {}) }, $setOnInsert: { firstDetectedAt: new Date() } }, { upsert: true, session });
    if (changed || cleared) await recordCreditCaseEvent(userId, cleared ? "cleared_by_check" : reopened ? "reopened" : !existing ? "detected" : "rechecked", { classification: summary.classification, walletBalance: summary.walletBalance, expectedBalance: summary.expectedBalance, difference: summary.difference, snapshot, concerns: summary.concerns.join(" ") }, actor, session);
}

export async function checkCreditAccount(userId) {
    const session = await mongoose.startSession();
    let view;
    try {
        await session.withTransaction(async () => { view = await inspectCreditAccount(userId, session); await updateCreditCase(view, session); }, creditTransactionOptions);
        await Promise.allSettled([notifyRole("Super Admin", "CREDIT_RECONCILIATION_CHANGED", { userId: String(userId) })]);
        return view;
    } finally { await session.endSession(); }
}

function requiredText(value, label, min = 3, max = 1000) {
    if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw reconciliationError(`${label} must contain ${min}–${max} characters.`);
    return value.trim();
}
const planSummary = summary => ({ walletBalance: summary.walletBalance, expectedBalance: summary.expectedBalance, difference: summary.difference, classification: summary.classification, openingBalance: summary.opening.amount });

async function assertRecoverySourceUnused(userId, sourceReference, session, wholeTransaction = false) {
    const originalId = normalizedRecoveryReference(sourceReference).replace(/^(TXN|REC)-/, "");
    if (mongoose.isObjectIdOrHexString(originalId) && await Transaction.exists({ _id: originalId, ...(!wholeTransaction ? { $or: [{ fromUser: userId }, { toUser: userId }] } : {}) }).session(session)) {
        throw reconciliationError("That transaction is already in this account's ledger or another account's ledger. Do not record it a second time.", 409);
    }
    if (mongoose.isObjectIdOrHexString(originalId) && await CreditRecovery.exists({ _id: originalId, ...(!wholeTransaction ? { userId } : {}) }).session(session)) throw reconciliationError("That reference identifies an existing recovered ledger entry. Use the original transaction evidence and do not recover it again.", 409);
    const sourceKey = recoveryReferenceKey(sourceReference);
    // Older immutable recovery records have no normalized key. Check them as
    // well; new records also have unique indexes to stop concurrent replays.
    const scope = wholeTransaction ? {} : { userId };
    if (await CreditRecovery.exists({ ...scope, sourceKey }).session(session)) throw reconciliationError("This source transaction has already been restored or recovered.", 409);
    for await (const entry of CreditRecovery.find({ ...scope, sourceKey: null }).select("sourceReference").session(session).lean().cursor()) {
        if (recoveryReferenceKey(entry.sourceReference) === sourceKey) throw reconciliationError("This source transaction has already been restored or recovered.", 409);
    }
    return sourceKey;
}

export async function prepareCreditRepair(req) {
    requireReconciliationAdmin(req);
    const userId = req.params.userId;
    const { mode } = req.body;
    if (!["wallet", "ledger", "transaction", "close"].includes(mode)) throw reconciliationError("Choose a correction, transaction recovery, or a no-change closure.");
    const reason = requiredText(req.body.reason, "The investigation reason", 10, 2000);
    const sourceReference = mode === "close" ? "" : requiredText(req.body.sourceReference, "The source evidence reference", 3, 500);
    const session = await mongoose.startSession();
    let response;
    try {
        await session.withTransaction(async () => {
            const view = await inspectCreditAccount(userId, session);
            const s = view.summary;
            if (!view.wallet || !["User", "Reseller"].includes(s.account.role)) throw reconciliationError("The original wallet and account must exist before a correction.", 409);
            if (!s.audit.verified && s.audit.count) throw reconciliationError("The audit history must be verified before a correction.", 409);
            if (!s.calculationsAgree) throw reconciliationError("The ledger calculations disagree. Investigate the conflicting entries before a correction.", 409);
            const proposed = { ...planSummary(s), delta: 0 };
            let effectiveAt = null, originalType = null, sourceKey;
            if (mode === "wallet" || mode === "ledger") {
                if (s.classification !== "confirmed") throw reconciliationError("Resolve conflicting records or run a fresh check before preparing a repair.", 409);
                if (mode === "wallet") {
                    if (s.expectedMinor < 0) throw reconciliationError("This repair would create a negative balance. Further investigation is required.", 409);
                    proposed.walletBalance = s.expectedBalance; proposed.delta = -s.difference; proposed.difference = 0;
                } else {
                    if (!s.differenceMinor) throw reconciliationError("There is no missing ledger amount to restore.", 409);
                    originalType = req.body.originalType;
                    const allowed = s.differenceMinor > 0 ? ["ALLOCATE", "REFUND"] : ["DEDUCT", "RECLAIM"];
                    if (!allowed.includes(originalType)) throw reconciliationError("The original transaction type must match the direction of the missing credit movement.");
                    effectiveAt = new Date(req.body.effectiveAt);
                    if (!Number.isFinite(effectiveAt.getTime()) || effectiveAt > new Date() || view.wallet.createdAt && effectiveAt < view.wallet.createdAt) throw reconciliationError("Use the original transaction time, after the wallet was created and no later than now.");
                    sourceKey = await assertRecoverySourceUnused(userId, sourceReference, session);
                    proposed.expectedBalance = s.walletBalance; proposed.delta = s.difference; proposed.difference = 0;
                }
            } else if (mode === "transaction") {
                if (s.classification !== "matched") throw reconciliationError("Resolve the existing wallet discrepancy before recovering a transaction missing from both records.", 409);
                if (req.body.transactionVerified !== true) throw reconciliationError("Verify that the original transaction completed, belongs to this account, and is missing from both the wallet and ledger.");
                originalType = req.body.originalType;
                if (!["ALLOCATE", "REFUND", "DEDUCT", "RECLAIM"].includes(originalType)) throw reconciliationError("Select the original completed credit movement. Requests cannot be recovered as completed transactions.");
                const amountMinor = creditMinor(req.body.amount);
                if (amountMinor <= 0) throw reconciliationError("Enter the original transaction amount greater than zero.");
                const deltaMinor = ["ALLOCATE", "REFUND"].includes(originalType) ? amountMinor : -amountMinor;
                const target = s.walletMinor + deltaMinor;
                if (!Number.isSafeInteger(target) || target < 0) throw reconciliationError("This recovery would create a negative or unsupported balance.", 409);
                effectiveAt = new Date(req.body.effectiveAt);
                if (!Number.isFinite(effectiveAt.getTime()) || effectiveAt > new Date() || view.wallet.createdAt && effectiveAt < view.wallet.createdAt) throw reconciliationError("Use the original transaction time, after the wallet was created and no later than now.");
                sourceKey = await assertRecoverySourceUnused(userId, sourceReference, session, true);
                proposed.walletBalance = target / 100; proposed.expectedBalance = target / 100; proposed.delta = deltaMinor / 100; proposed.difference = 0;
            } else if (s.classification !== "matched") throw reconciliationError("A no-change closure requires a fresh check with matching balances and no conflicting records.", 409);
            await updateCreditCase(view, session, actorOf(req));
            const [plan] = await CreditRepairPlan.create([{ userId, actorId: req.user._id, mode, snapshot: view.snapshot, before: planSummary(s), proposed, reason, sourceReference, sourceKey, effectiveAt, originalType, transactionVerified: mode === "transaction", expiresAt: new Date(Date.now() + 10 * 60000) }], { session });
            await recordCreditCaseEvent(userId, "review_prepared", { planId: String(plan._id), mode, before: plan.before, proposed, sourceReference, reason, effectiveAt, originalType, transactionVerified: plan.transactionVerified, snapshot: view.snapshot }, actorOf(req), session);
            response = { id: String(plan._id), account: s.account, mode, before: plan.before, proposed, sourceReference, reason, effectiveAt, originalType, transactionVerified: plan.transactionVerified, expiresAt: plan.expiresAt };
        }, creditTransactionOptions);
        return response;
    } finally { await session.endSession(); }
}

export async function executeCreditRepair(req) {
    requireReconciliationAdmin(req);
    const plan = await CreditRepairPlan.findOne({ _id: req.params.planId, userId: req.params.userId, actorId: req.user._id }).lean();
    if (!plan) throw reconciliationError("This review does not belong to your account and the selected wallet.", 404);
    if (!["wallet", "ledger", "transaction", "close"].includes(plan.mode)) throw reconciliationError("This review uses an option that is no longer available. Prepare a new review.", 409);
    const previous = await CreditRepair.findOne({ planId: plan._id }).lean();
    if (previous) return { id: String(previous._id), after: previous.after, replayed: true };
    const actor = actorOf(req);
    const attemptSession = await mongoose.startSession();
    try { await attemptSession.withTransaction(() => recordCreditCaseEvent(plan.userId, "repair_started", { planId: String(plan._id), mode: plan.mode }, actor, attemptSession), creditTransactionOptions); }
    finally { await attemptSession.endSession(); }
    const session = await mongoose.startSession();
    let response;
    try {
        await session.withTransaction(async () => {
            const replay = await CreditRepair.findOne({ planId: plan._id }).session(session).lean();
            if (replay) { response = { id: String(replay._id), after: replay.after, replayed: true }; return; }
            if (plan.expiresAt <= new Date()) throw reconciliationError("This review expired. Run a fresh check and prepare a new review.", 409);
            const before = await inspectCreditAccount(plan.userId, session);
            if (before.snapshot !== plan.snapshot) throw reconciliationError("The wallet or evidence changed after your review. Run a fresh check before confirming again.", 409);
            if (plan.mode === "transaction" && !plan.transactionVerified) throw reconciliationError("Verify the completed transaction before preparing another recovery.", 409);
            const changesWallet = ["wallet", "transaction"].includes(plan.mode);
            const sourceKey = ["ledger", "transaction"].includes(plan.mode) ? await assertRecoverySourceUnused(plan.userId, plan.sourceReference, session, plan.mode === "transaction") : undefined;
            const update = { $inc: { reconciliationVersion: 1 } };
            if (changesWallet) update.$set = { balance: plan.proposed.walletBalance, balanceMinor: creditMinor(plan.proposed.walletBalance), updatedAt: new Date() };
            const fence = await Wallet.collection.updateOne({ _id: before.wallet._id, balance: before.wallet.balance }, update, { session });
            if (fence.matchedCount !== 1) throw reconciliationError("The wallet changed during review.", 409);
            // The same job is written by every economic ledger movement. This
            // fences ledger-only repairs against concurrent credit operations.
            await queueCreditCheck([plan.userId], session);
            if (changesWallet) {
                await appendAudit({ stream: `wallet:${before.wallet._id}`, action: "wallet.reconciled", actor,
                    data: { before: { balance: before.wallet.balance, balanceMinor: before.wallet.balanceMinor }, after: { balance: plan.proposed.walletBalance, balanceMinor: creditMinor(plan.proposed.walletBalance) }, planId: String(plan._id), mode: plan.mode, reason: plan.reason, sourceReference: plan.sourceReference } }, session);
            }
            if (["ledger", "transaction"].includes(plan.mode)) {
                const [recovery] = await CreditRecovery.create([{ userId: plan.userId, deltaMinor: creditMinor(plan.proposed.delta), originalType: plan.originalType, sourceReference: plan.sourceReference, sourceKey, ...(plan.mode === "transaction" ? { transactionKey: sourceKey } : {}), walletApplied: plan.mode === "transaction", effectiveAt: plan.effectiveAt, reason: plan.reason, performedBy: req.user._id, planId: plan._id }], { session });
                await recordCreditCaseEvent(plan.userId, "ledger_restored", { recoveryId: String(recovery._id), planId: String(plan._id), originalType: plan.originalType, delta: plan.proposed.delta, sourceReference: plan.sourceReference, sourceKey, walletApplied: recovery.walletApplied, effectiveAt: plan.effectiveAt, reason: plan.reason }, actor, session);
            }
            const after = await inspectCreditAccount(plan.userId, session);
            if (after.summary.classification !== "matched") throw reconciliationError("The proposed correction did not reconcile the account. No correction was committed.", 409);
            await updateCreditCase(after, session, actor);
            if (after.summary.classification === "matched") await CreditCase.updateOne({ userId: plan.userId }, { $set: { state: "resolved", resolvedAt: new Date(), summary: after.summary, classification: "matched", snapshot: after.snapshot, lastCheckedAt: after.summary.checkedAt }, $setOnInsert: { firstDetectedAt: new Date() } }, { session, upsert: true });
            const [repair] = await CreditRepair.create([{ planId: plan._id, userId: plan.userId, actorId: req.user._id, mode: plan.mode, before: plan.before, after: planSummary(after.summary), reason: plan.reason,
                evidence: { sourceReference: plan.sourceReference, originalType: plan.originalType, effectiveAt: plan.effectiveAt, transactionVerified: plan.transactionVerified, beforeSnapshot: plan.snapshot, afterSnapshot: after.snapshot } }], { session });
            await recordCreditCaseEvent(plan.userId, plan.mode === "close" ? "closed_without_change" : "repair_completed", { planId: String(plan._id), repairId: String(repair._id), mode: plan.mode, before: plan.before, after: repair.after, reason: plan.reason, sourceReference: plan.sourceReference }, actor, session);
            if (plan.mode !== "close") await CreditBalanceResult.updateOne({ userId: plan.userId }, { $set: { version: randomUUID(), at: new Date() } }, { upsert: true, session });
            response = { id: String(repair._id), after: repair.after, replayed: false };
        }, creditTransactionOptions);
    } catch (error) {
        if (error.code === 11000 && (error.keyPattern?.transactionKey || error.keyPattern?.sourceKey)) error = reconciliationError("This source transaction has already been recovered. Refresh the evidence before trying again.", 409);
        // A lost commit acknowledgement is not proof of rollback. The receipt
        // lives in the same transaction and is the authority for safe retries.
        let receipt, receiptReadFailed = false;
        try { receipt = await CreditRepair.findOne({ planId: plan._id }).lean(); }
        catch { receiptReadFailed = true; }
        if (receipt) response = { id: String(receipt._id), after: receipt.after, replayed: true };
        else {
            const uncertain = receiptReadFailed || error.hasErrorLabel?.("UnknownTransactionCommitResult");
            const failureSession = await mongoose.startSession();
            try {
                await failureSession.withTransaction(() => recordCreditCaseEvent(plan.userId, uncertain ? "repair_outcome_unconfirmed" : "repair_failed", {
                    planId: String(plan._id), mode: plan.mode,
                    error: uncertain ? "Commit could not be verified. Retry this same review to retrieve its receipt before preparing another correction." : error.statusCode ? error.message : "The repair transaction could not commit.",
                }, actor, failureSession), creditTransactionOptions);
            } catch (auditError) { console.error("[credit-reconciliation] Failed to record repair outcome:", auditError.name); }
            finally { await failureSession.endSession(); }
            if (uncertain) throw reconciliationError("The result could not be verified. Retry this same review to check its receipt before preparing another correction.", 503);
            throw error;
        }
    } finally { await session.endSession(); }
    await Promise.allSettled([
        notifyRole("Super Admin", "CREDIT_RECONCILIATION_CHANGED", { userId: String(plan.userId) }),
        ...(plan.mode !== "close" ? [notifyUser(plan.userId, "WALLET_UPDATED", { reason: "BALANCE_UPDATED" })] : []),
    ]);
    return response;
}
