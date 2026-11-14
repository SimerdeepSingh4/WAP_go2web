import { createHash } from "node:crypto";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import Wallet from "../models/wallet.model.js";
import Transaction from "../models/transaction.model.js";
import { AuditEvent, AuditHead } from "../models/audit.model.js";
import { CreditRecovery, CreditCaseEvent } from "../models/credit-reconciliation.model.js";
import { canonical, validAuditHash } from "./audit.service.js";
import { creditMinor } from "../helpers/credit-amount.js";
import { recoveryReferenceKey } from "../helpers/credit-recovery-reference.js";

export const evidenceHash = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export const reconciliationError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const same = (a, b) => String(a) === String(b);
const credits = value => value / 100;

export function ledgerDelta(row, userId) {
    const from = same(row.fromUser, userId), to = same(row.toUser, userId);
    const amount = creditMinor(row.amount);
    let typed = 0;
    if (row.type === "ALLOCATE") typed = to && !from ? amount : from && !to ? -amount : 0;
    else if (row.type === "REFUND" && to) typed = amount;
    else if (row.type === "DEDUCT" && (from || (!row.fromUser && to))) typed = -amount;
    else if (row.type === "RECLAIM") typed = (to ? amount : 0) - (from ? amount : 0);
    else if (row.type !== "REQUEST") throw reconciliationError("An entry has an unsupported credit movement.");
    const postings = row.postings || [];
    const delta = postings.length ? postings.filter(entry => same(entry.userId, userId)).reduce((sum, entry) => sum + entry.deltaMinor, 0) : typed;
    const valid = amount > 0 && Number.isSafeInteger(delta) && delta === typed && (row.amountMinor == null || row.amountMinor === amount)
        && (!postings.length || postings.every(entry => Number.isSafeInteger(entry.deltaMinor)) && postings.reduce((sum, entry) => sum + entry.deltaMinor, 0) === 0);
    const after = row.type === "REQUEST" ? null : from && to ? row.balanceAfterTo ?? row.balanceAfterFrom : to ? row.balanceAfterTo : row.balanceAfterFrom;
    return { delta, typed, valid, recordedAfterMinor: after == null ? null : creditMinor(after), legacy: !postings.length };
}

// All evidence, both independent calculations and the wallet are read from one
// committed snapshot. The entire history is traversed, even for a filtered page.
export async function inspectCreditAccount(userId, session, options = {}) {
    const user = await User.findById(userId).select("username role createdAt").session(session).lean();
    const wallet = await Wallet.findOne({ userId }).session(session).lean();
    const digest = createHash("sha256");
    const updateDigest = value => digest.update(JSON.stringify(canonical(value)) + "\n");
    const concerns = [];
    async function signedCaseEvent(event) {
        if (!event) return false;
        const signed = await AuditEvent.findOne({ stream: `reconciliation:${userId}`, sequence: event.auditSequence, hash: event.auditHash }).session(session).lean();
        return Boolean(signed && validAuditHash(signed) && signed.data?.eventDigest === evidenceHash({ userId: String(userId), action: event.action, actor: event.actor, details: event.details }));
    }
    if (!user) concerns.push("The account record is missing; verify ownership before a repair.");
    if (!wallet) concerns.push("The wallet is missing. An administrator must investigate its original records.");
    let walletMinor = 0;
    try { walletMinor = creditMinor(wallet?.balance || 0); }
    catch { concerns.push("The saved wallet balance is not a valid two-decimal credit amount."); }
    const minorMismatch = wallet?.balanceMinor != null && wallet.balanceMinor !== walletMinor;
    const recoveryTime = entry => entry.walletApplied ? entry.createdAt : entry.effectiveAt;
    const recoveries = await CreditRecovery.find({ userId }).session(session).lean();
    // Wallet recovery takes effect when it is confirmed. Preserve the original
    // date as source evidence without changing earlier saved wallet snapshots.
    recoveries.sort((a, b) => new Date(recoveryTime(a)) - new Date(recoveryTime(b)) || String(a._id).localeCompare(String(b._id)));
    updateDigest({ userId, wallet, recoveries });

    let auditCount = 0, auditValid = true, auditHash = "GENESIS", auditSequence = 0, zeroOpening = false;
    if (wallet) {
        for await (const event of AuditEvent.find({ stream: `wallet:${wallet._id}` }).sort({ sequence: 1 }).session(session).lean().cursor()) {
            auditCount++;
            if (event.sequence !== auditSequence + 1 || event.previousHash !== auditHash || !validAuditHash(event)) auditValid = false;
            auditSequence = event.sequence; auditHash = event.hash;
            if (event.action === "wallet.created" && event.data?.after?.balance === 0 && validAuditHash(event)) zeroOpening = true;
        }
        const head = await AuditHead.findById(`wallet:${wallet._id}`).session(session).lean();
        if (auditCount && (!head || head.sequence !== auditSequence || head.hash !== auditHash)) auditValid = false;
        updateDigest({ auditHash, auditSequence, head });
        if (!auditValid) concerns.push("The saved wallet audit trail has missing or altered evidence.");
    }
    const openingVerified = zeroOpening && auditValid;
    const openingMinor = 0, openingSource = openingVerified ? "Zero starting balance recorded at wallet creation" : "Accounts start at zero; only recorded credit movements are counted";
    for (const recovery of recoveries) {
        const event = await CreditCaseEvent.findOne({ userId, action: "ledger_restored", "details.recoveryId": String(recovery._id) }).session(session).lean();
        if (!await signedCaseEvent(event) || event.details.delta !== recovery.deltaMinor / 100 || event.details.sourceReference !== recovery.sourceReference || event.details.originalType !== recovery.originalType || String(new Date(event.details.effectiveAt)) !== String(recovery.effectiveAt) || event.details.reason !== recovery.reason
            || Boolean(event.details.walletApplied) !== Boolean(recovery.walletApplied)
            || recovery.sourceKey && (recovery.sourceKey !== recoveryReferenceKey(recovery.sourceReference) || event.details.sourceKey !== recovery.sourceKey)
            || recovery.walletApplied && recovery.transactionKey !== recovery.sourceKey) concerns.push("A restored ledger entry no longer matches its signed source evidence.");
    }
    const totals = { received: 0, refunded: 0, usage: 0, reclaimed: 0, transferred: 0, recovered: 0, requestCount: 0, inflow: 0, outflow: 0 };
    let running = openingMinor, typedRunning = openingMinor, count = 0, legacyCount = 0, invalidCount = 0;
    let firstBreak = null, previousRecorded = null, sinceSnapshot = 0, recoveryIndex = 0;
    let firstEntry = null, lastEntry = null, matchedCount = 0;
    const page = Math.max(1, Math.floor(Number(options.page) || 1)), limit = Math.min(100, Math.max(1, Math.floor(Number(options.limit) || 50)));
    const search = String(options.search || "").trim().toLowerCase().slice(0, 120);
    const type = String(options.type || "");
    const entries = [];
    function include(entry) {
        if (type && entry.type !== type) return;
        if (search && !`${entry.reference} ${entry.sourceReference || ""} ${entry.notes || ""} ${entry.campaignId || ""} ${entry.performedBy || ""}`.toLowerCase().includes(search)) return;
        if (matchedCount >= (page - 1) * limit && entries.length < limit) entries.push(entry);
        matchedCount++;
    }
    function applyRecovery(recovery) {
        const before = running;
        running += recovery.deltaMinor; typedRunning += recovery.deltaMinor;
        sinceSnapshot += recovery.deltaMinor;
        totals.recovered += recovery.deltaMinor;
        if (recovery.deltaMinor > 0) totals.inflow += recovery.deltaMinor; else totals.outflow -= recovery.deltaMinor;
        include({ id: String(recovery._id), reference: `REC-${recovery._id}`, type: "RECOVERY", originalType: recovery.originalType, delta: credits(recovery.deltaMinor), expectedBefore: credits(before), expectedAfter: credits(running), recordedAfter: null, createdAt: recoveryTime(recovery), originalEffectiveAt: recovery.effectiveAt, recordedAt: recovery.createdAt, notes: recovery.reason, sourceReference: recovery.sourceReference, performedBy: recovery.performedBy, restored: true, walletApplied: Boolean(recovery.walletApplied) });
    }
    const filter = { $or: [{ fromUser: userId }, { toUser: userId }, { "postings.userId": userId }] };
    for await (const row of Transaction.find(filter).sort({ createdAt: 1, _id: 1 }).session(session).lean().cursor()) {
        updateDigest(row);
        while (recoveryIndex < recoveries.length && recoveryTime(recoveries[recoveryIndex]) <= row.createdAt) applyRecovery(recoveries[recoveryIndex++]);
        let movement;
        try { movement = ledgerDelta(row, userId); }
        catch { movement = { delta: 0, typed: 0, valid: false, recordedAfterMinor: null, legacy: !row.postings?.length }; }
        if (!firstEntry && row.type !== "REQUEST") {
            firstEntry = { id: String(row._id), reference: `TXN-${String(row._id).toUpperCase()}`, at: row.createdAt };
        }
        count++; if (movement.legacy) legacyCount++; if (!movement.valid) invalidCount++;
        const before = running;
        running += movement.delta; typedRunning += movement.typed;
        if (movement.delta > 0) totals.inflow += movement.delta; else totals.outflow -= movement.delta;
        if (row.type === "ALLOCATE") movement.delta > 0 ? totals.received += movement.delta : totals.transferred -= movement.delta;
        if (row.type === "REFUND") totals.refunded += movement.delta;
        if (row.type === "DEDUCT") totals.usage -= movement.delta;
        if (row.type === "RECLAIM") totals.reclaimed -= movement.delta;
        if (row.type === "REQUEST") totals.requestCount++;
        sinceSnapshot += movement.delta;
        let snapshotExpected = null, snapshotGap = null;
        if (movement.recordedAfterMinor != null && row.type !== "REQUEST") {
            snapshotExpected = previousRecorded == null ? before + movement.delta : previousRecorded.balanceMinor + sinceSnapshot;
            snapshotGap = movement.recordedAfterMinor - snapshotExpected;
            if (snapshotGap && !firstBreak) firstBreak = { transactionId: String(row._id), reference: `TXN-${String(row._id).toUpperCase()}`, at: row.createdAt, type: row.type, previousRecorded: previousRecorded ? credits(previousRecorded.balanceMinor) : credits(before), movement: credits(sinceSnapshot), expectedAfter: credits(snapshotExpected), savedAfter: credits(movement.recordedAfterMinor), difference: credits(snapshotGap), previousReference: previousRecorded?.reference || null };
            previousRecorded = { balanceMinor: movement.recordedAfterMinor, reference: `TXN-${String(row._id).toUpperCase()}` };
            sinceSnapshot = 0;
        }
        lastEntry = { id: String(row._id), reference: `TXN-${String(row._id).toUpperCase()}`, at: row.createdAt };
        include({ id: String(row._id), reference: lastEntry.reference, type: row.type, amount: row.amount, delta: credits(movement.delta), expectedBefore: credits(before), expectedAfter: credits(running), recordedAfter: movement.recordedAfterMinor == null ? null : credits(movement.recordedAfterMinor), snapshotExpected: snapshotExpected == null ? null : credits(snapshotExpected), snapshotGap: snapshotGap == null ? null : credits(snapshotGap), createdAt: row.createdAt, notes: row.notes, campaignId: row.campaignId || null, performedBy: row.performedBy, rate: row.rateSnapshot, legacy: movement.legacy, valid: movement.valid });
    }
    while (recoveryIndex < recoveries.length) applyRecovery(recoveries[recoveryIndex++]);
    if (invalidCount || running !== typedRunning) concerns.push("Transaction amounts and ledger postings disagree. Resolve this evidence conflict before a correction.");
    if (!Number.isSafeInteger(running) || !Number.isSafeInteger(typedRunning) || openingMinor < 0) concerns.push("The recorded credit totals or opening balance are invalid.");
    const differenceMinor = walletMinor - running;
    // Legacy test accounts follow the same zero-opening policy as new accounts.
    // Missing old creation records alone never creates a warning or blocks repair.
    const evidenceConflict = concerns.length > 0;
    const needsReview = Boolean(differenceMinor || minorMismatch || evidenceConflict);
    const classification = !needsReview ? "matched" : concerns.length ? "cannot_confirm" : "confirmed";
    const summary = {
        account: { id: String(userId), username: user?.username || "Missing account", role: user?.role || "Unknown" },
        walletId: wallet ? String(wallet._id) : null, walletBalance: credits(walletMinor), walletMinor,
        expectedBalance: credits(running), expectedMinor: running, difference: credits(differenceMinor), differenceMinor,
        opening: { amount: 0, verified: openingVerified, source: openingSource },
        totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, key === "requestCount" ? value : credits(value)])),
        transactionCount: count, recoveryCount: recoveries.length, legacyCount, invalidCount,
        independentBalance: credits(typedRunning), calculationsAgree: invalidCount === 0 && typedRunning === running,
        minorMismatch, evidenceConflict, needsReview, classification, concerns, firstBreak, firstEntry, lastEntry,
        audit: { count: auditCount, verified: auditCount ? auditValid : null }, checkedAt: new Date(),
    };
    updateDigest({ openingMinor, openingVerified, auditValid });
    return { summary, snapshot: digest.digest("hex"), entries, pagination: { page, limit, total: matchedCount, pages: Math.max(1, Math.ceil(matchedCount / limit)) }, wallet };
}
