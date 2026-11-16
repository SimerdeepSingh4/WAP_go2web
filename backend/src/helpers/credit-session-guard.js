import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { creditMinor } from "./credit-amount.js";

const states = new WeakMap();
export const creditInvariantError = message => Object.assign(new Error(message), { statusCode: 503, code: "CREDIT_INVARIANT_FAILED", hasErrorLabel: () => false });
const empty = () => ({ movements: [], postings: [], wallets: new Map(), repairs: [], verified: false });

// Guard the actual commit boundary, including callers using withTransaction().
// A transaction can contain several postings; every movement must be paired.
export function guardCreditSession(session) {
    if (!session?.inTransaction()) throw creditInvariantError("An active transaction is required for credit changes.");
    if (states.has(session)) return states.get(session);
    states.set(session, empty());
    const start = session.startTransaction.bind(session);
    const commit = session.commitTransaction.bind(session);
    const abort = session.abortTransaction.bind(session);
    session.startTransaction = function (...args) { const result = start(...args); states.set(session, empty()); return result; };
    session.abortTransaction = async function (...args) { try { if (session.inTransaction()) return await abort(...args); } finally { states.set(session, empty()); } };
    session.commitTransaction = async function (...args) {
        const state = states.get(session);
        if (!state.verified && session.inTransaction()) {
            try { await verifyCreditSession(session, state); state.verified = true; }
            catch (error) {
                try { if (session.inTransaction()) await abort(); } catch { /* Preserve the original consistency failure. */ }
                states.set(session, empty());
                if (typeof error.hasErrorLabel !== "function") error.hasErrorLabel = () => false;
                if (error.code === "CREDIT_INVARIANT_FAILED") await reportCreditPostingFailure(error, [...state.movements, ...state.postings].map(row => row.userId));
                throw error;
            }
        }
        // Retry a lost commit acknowledgement using this same transaction.
        // Never rerun a financial operation merely because its reply was lost.
        for (let attempt = 0; ; attempt++) {
            try { return await commit(...args); }
            catch (error) {
                if (!error.hasErrorLabel?.("UnknownTransactionCommitResult") || attempt >= 2) throw error;
            }
        }
    };
    return states.get(session);
}

export function recordWalletMovement(session, before, after) {
    const beforeMinor = creditMinor(before?.balance ?? 0), afterMinor = creditMinor(after.balance);
    const state = guardCreditSession(session), walletId = String(after._id), previous = state.wallets.get(walletId);
    if (previous && previous.afterMinor !== beforeMinor) throw creditInvariantError("Wallet movements are not consecutive within the operation.");
    if (before && String(before.userId) !== String(after.userId)) throw creditInvariantError("A wallet cannot change its owning account.");
    state.wallets.set(walletId, { walletId: after._id, userId: after.userId, afterMinor });
    if (beforeMinor !== afterMinor) state.movements.push({ walletId, userId: String(after.userId), deltaMinor: afterMinor - beforeMinor, beforeMinor, afterMinor });
}

export function recordLedgerPostings(session, transaction) {
    if (transaction.type === "REQUEST") return;
    const state = guardCreditSession(session);
    for (const row of transaction.postings || []) if (row.userId) state.postings.push({ userId: String(row.userId), deltaMinor: row.deltaMinor, beforeMinor: row.balanceBeforeMinor, afterMinor: row.balanceAfterMinor });
}

// Reconciliation is an explicit, separately audited exception to ordinary
// economic postings. It must have its own immutable successful repair receipt.
export function recordApprovedRepair(session, { wallet, afterBalance, planId, mode }) {
    const state = guardCreditSession(session);
    state.repairs.push({ walletId: wallet._id, userId: wallet.userId, beforeMinor: creditMinor(wallet.balance), afterMinor: creditMinor(afterBalance), planId, mode });
}

async function verifyCreditSession(session, state) {
    const unmatched = [...state.movements];
    for (const posting of state.postings) {
        const index = unmatched.findIndex(row => row.userId === posting.userId && row.deltaMinor === posting.deltaMinor && row.beforeMinor === posting.beforeMinor && row.afterMinor === posting.afterMinor);
        if (index < 0) throw creditInvariantError("A ledger posting has no matching wallet movement and balance snapshots.");
        unmatched.splice(index, 1);
    }
    if (unmatched.length) throw creditInvariantError("A wallet movement has no equal ledger posting.");
    const Wallet = mongoose.model("Wallet");
    for (const entry of state.wallets.values()) {
        const wallet = await Wallet.findById(entry.walletId).select("userId balance balanceMinor").session(session).lean();
        if (!wallet || String(wallet.userId) !== String(entry.userId) || creditMinor(wallet.balance) !== entry.afterMinor || wallet.balanceMinor !== entry.afterMinor) throw creditInvariantError("The saved wallet does not match the operation's final balance.");
    }
    for (const repair of state.repairs) {
        const receipt = await mongoose.model("CreditRepair").findOne({ planId: repair.planId, userId: repair.userId, mode: repair.mode }).session(session).lean();
        const wallet = await Wallet.findById(repair.walletId).select("userId balance balanceMinor").session(session).lean();
        if (!receipt || creditMinor(receipt.before.walletBalance) !== repair.beforeMinor || creditMinor(receipt.after.walletBalance) !== repair.afterMinor
            || !wallet || String(wallet.userId) !== String(repair.userId) || creditMinor(wallet.balance) !== repair.afterMinor || wallet.balanceMinor !== repair.afterMinor) throw creditInvariantError("The correction has no matching committed audit receipt and wallet result.");
    }
}

export async function reportCreditPostingFailure(error, userIds = []) {
    try {
        const { appendAudit } = await import("../services/audit.service.js");
        await appendAudit({ stream: `credit-posting:${randomUUID()}`, action: "credit.posting_blocked", data: { code: error.code || "CREDIT_INVARIANT_FAILED", detail: error.message, affectedAccounts: [...new Set(userIds.map(String))].join(",") } });
        error.creditIncidentRecorded = true;
        const { notifyRole } = await import("../services/socket.service.js");
        await notifyRole("Super Admin", "CREDIT_RECONCILIATION_CHANGED", {});
    } catch { console.error("[credit-posting] A blocked operation could not be recorded in the audit log."); }
}
