import { createHash } from "node:crypto";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import Wallet from "../models/wallet.model.js";
import Transaction from "../models/transaction.model.js";
import Campaign from "../models/campaign.model.js";
import CreditPurchase from "../models/credit-purchase.model.js";
import NumberFilterRequest from "../models/number-filter-request.model.js";
import { AuditEvent, AuditHead } from "../models/audit.model.js";
import { CreditRecovery, CreditCaseEvent } from "../models/credit-reconciliation.model.js";
import { canonical, validAuditHash } from "./audit.service.js";
import { creditMinor } from "../helpers/credit-amount.js";
import { recoveryReferenceKey } from "../helpers/credit-recovery-reference.js";
import { categoryBalances, CAMPAIGN_CREDITS, CREDIT_BUCKETS, CREDIT_CATEGORIES, NUMBER_FILTERING_CREDITS, validCategoryBalance } from "../helpers/credit-categories.js";
import { buildCategoryPostings } from "../helpers/category-ledger-postings.js";

// Bump when reconciliation rules change so the monitor rechecks stored cases.
export const CREDIT_EVIDENCE_VERSION = 2;
export const staleCreditEvidence = { "summary.evidenceVersion": { $not: { $gte: CREDIT_EVIDENCE_VERSION } } };
export const evidenceHash = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export const reconciliationError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const same = (a, b) => String(a) === String(b);
const credits = value => value / 100;

function categoryEvidence(wallet, userId) {
    const balances = categoryBalances(wallet);
    const lanes = Object.fromEntries(CREDIT_CATEGORIES.map(category => [category, {
        quantities: { available: 0n, reserved: 0n }, transactionCount: 0, invalidCount: 0,
    }]));
    let unsupported = false;
    return {
        record(row) {
            const lane = Object.hasOwn(lanes, row.category) ? lanes[row.category] : null;
            if (!lane) { unsupported = true; return; }
            lane.transactionCount++;
            try {
                const expected = buildCategoryPostings(row, { systemReclaim: row.type === "RECLAIM" && row.balanceAfterTo == null });
                if (evidenceHash(expected) !== evidenceHash(row.postings || [])) throw new Error("Category ledger mismatch");
                for (const posting of expected) {
                    if (posting.userId && same(posting.userId, userId)) lane.quantities[posting.bucket] += BigInt(posting.deltaQuantity);
                }
            } catch {
                lane.invalidCount++;
            }
        },
        summary(concerns) {
            if (unsupported) concerns.push("A ledger entry has an unsupported credit category.");
            return Object.fromEntries(CREDIT_CATEGORIES.map(category => {
                const { quantities, transactionCount, invalidCount } = lanes[category];
                const walletBalance = balances[category];
                const expectedBalance = Object.fromEntries(CREDIT_BUCKETS.map(bucket => {
                    const value = quantities[bucket];
                    return [bucket, value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value)];
                }));
                const invalidBalance = !validCategoryBalance(walletBalance) || !validCategoryBalance(expectedBalance);
                const matches = !invalidCount && !invalidBalance && CREDIT_BUCKETS.every(bucket => walletBalance[bucket] === expectedBalance[bucket]);
                if (!matches) concerns.push(`${category} credit quantities require reconciliation against their own ledger.`);
                return [category, { walletBalance, expectedBalance, transactionCount, invalidCount, matches }];
            }));
        },
    };
}

async function checkPurchaseHolds(user, userId, movements, categorized, session, updateDigest, concerns) {
    if (user?.role !== "Reseller" && !movements.size) return;
    const expectedHeld = Object.fromEntries(CREDIT_CATEGORIES.map(category => [category, 0]));
    let mismatch = false;
    const orders = CreditPurchase.find({ sellerId: userId })
        .select("sellerId buyerId status category quantity reservationFree reviewReason fulfillmentTransactionId").sort({ _id: 1 }).session(session).lean();
    for await (const order of orders.cursor()) {
        const key = String(order._id);
        const postings = movements.get(key) || [];
        const needsHold = !order.reservationFree && user?.role === "Reseller" && order.reviewReason !== "LATE_PROOF"
            && ["QUOTED", "PENDING", "REVIEW_REQUIRED", "FLAGGED"].includes(order.status);
        const held = postings.reduce((sum, row) => sum + (row.type === "RESERVE" ? row.amount : -row.amount), 0);
        if (needsHold && Object.hasOwn(expectedHeld, order.category)) expectedHeld[order.category] += order.quantity;
        if (held !== (needsHold ? order.quantity : 0)
            || new Set(postings.map(row => row.type)).size !== postings.length
            || postings.some(row => row.category !== order.category || row.amount !== order.quantity
                || (row.type === "ALLOCATE" ? !same(row.toUser, order.buyerId) || !same(row._id, order.fulfillmentTransactionId) : !same(row.toUser, userId)))) mismatch = true;
        movements.delete(key);
        updateDigest(order);
    }
    if (mismatch || movements.size || CREDIT_CATEGORIES.some(category => expectedHeld[category] !== categorized[category].walletBalance.reserved)) {
        concerns.push("Recharge orders do not match the credits held for them.");
    }
}

async function checkCampaignAdjustments(userId, movements, session, updateDigest, concerns) {
    let mismatch = movements.has("null") || movements.has("undefined");
    const campaigns = Campaign.find({ userId, $or: [{ category: CAMPAIGN_CREDITS }, { "campaignCreditCharge.transactionId": { $exists: true } }] })
        .select("creditsDeducted campaignCreditCharge campaignSummary.creditsRefunded").sort({ _id: 1 }).session(session).lean();
    function valid(rows, campaign) {
        const original = rows.filter(row => row.type === "DEDUCT" && !row.originalTransactionId && !row.refundOperationId);
        if (!rows.length) return campaign?.creditsDeducted === 0;
        if (original.length !== 1) return false;
        const [debit] = original;
        const adjustments = rows.filter(row => row !== debit);
        if (adjustments.some(row => !same(row.originalTransactionId, debit._id) || !["DEDUCT", "REFUND"].includes(row.type))) return false;
        const refunded = adjustments.reduce((sum, row) => sum + (row.type === "REFUND" ? row.amount : -row.amount), 0);
        if (refunded < 0 || refunded > debit.amount) return false;
        if (!campaign) return true; // Deleting a published campaign preserves its ledger.
        const charge = campaign.campaignCreditCharge;
        return debit.amount === campaign.creditsDeducted && (!charge || (same(charge.transactionId, debit._id) && charge.submittedRowCount === debit.amount))
            && (campaign.campaignSummary?.creditsRefunded || 0) === refunded;
    }
    for await (const campaign of campaigns.cursor()) {
        const key = String(campaign._id);
        if (!valid(movements.get(key) || [], campaign)) mismatch = true;
        movements.delete(key);
        updateDigest(campaign);
    }
    if (mismatch || [...movements.values()].some(rows => !valid(rows))) concerns.push("Campaign settlements do not match their original debits and recorded refunds.");
}

export function ledgerDelta(row, userId) {
    if (row.category != null) throw reconciliationError("Categorized credit movements require category reconciliation.");
    const from = same(row.fromUser, userId), to = same(row.toUser, userId);
    const amount = creditMinor(row.amount);
    let typed = 0;
    if (row.type === "ALLOCATE") typed = to && !from ? amount : from && !to ? -amount : 0;
    else if (row.type === "REFUND" && to) typed = amount;
    else if (row.type === "DEDUCT" && (from || (!row.fromUser && to))) typed = -amount;
    else if (row.type === "RECLAIM") typed = (to ? amount : 0) - (from ? amount : 0);
    else if (row.type !== "REQUEST") throw reconciliationError("An entry has an unsupported credit movement.");
    const postings = row.postings ?? [];
    const hasPostings = Array.isArray(postings) && postings.length > 0;
    const validPostings = Array.isArray(postings) && postings.every(entry => Number.isSafeInteger(entry?.deltaMinor));
    // Keep totals finite when historical postings are malformed. The invalid
    // evidence still prevents a repair based on this calculation.
    const postedDelta = hasPostings && validPostings ? postings.filter(entry => same(entry.userId, userId)).reduce((sum, entry) => sum + entry.deltaMinor, 0) : typed;
    const delta = Number.isSafeInteger(postedDelta) ? postedDelta : typed;
    const valid = validPostings && amount > 0 && Number.isSafeInteger(postedDelta) && postedDelta === typed && (row.amountMinor == null || row.amountMinor === amount)
        && (!hasPostings || postings.reduce((sum, entry) => sum + entry.deltaMinor, 0) === 0);
    const after = row.type === "REQUEST" ? null : from && to ? row.balanceAfterTo ?? row.balanceAfterFrom : to ? row.balanceAfterTo : row.balanceAfterFrom;
    return { delta, typed, valid, recordedAfterMinor: after == null ? null : creditMinor(after), legacy: validPostings && !hasPostings };
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
    updateDigest({ evidenceVersion: CREDIT_EVIDENCE_VERSION, userId, wallet, recoveries });

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
    const category = String(options.category || "");
    const entries = [];
    const categorized = categoryEvidence(wallet, userId);
    const filteringCharges = new Map();
    const campaignMovements = new Map();
    const purchaseMovements = new Map();
    let filteringMismatch = false;
    function include(entry) {
        if (type && entry.type !== type) return;
        if (category && (entry.category || "LEGACY") !== category) return;
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
        if (row.category != null) {
            categorized.record(row);
            if (row.category === NUMBER_FILTERING_CREDITS && row.type === "DEDUCT" && same(row.toUser, userId)) {
                const key = String(row.filterRequestId);
                if (filteringCharges.has(key)) filteringMismatch = true;
                filteringCharges.set(key, row);
            }
            if (row.campaignId && same(row.toUser, userId)) {
                const key = String(row.campaignId);
                const movements = campaignMovements.get(key) || [];
                movements.push(row);
                campaignMovements.set(key, movements);
            }
            if (row.purchaseId && same(row.fromUser, userId) && (["RESERVE", "RELEASE"].includes(row.type) || row.fromReserved)) {
                const key = String(row.purchaseId);
                const movements = purchaseMovements.get(key) || [];
                movements.push(row);
                purchaseMovements.set(key, movements);
            }
            const buckets = (row.postings || []).filter(posting => posting.userId && same(posting.userId, userId))
                .map(posting => ({
                    bucket: posting.bucket, delta: posting.deltaQuantity,
                    before: posting.balanceBeforeQuantity, after: posting.balanceAfterQuantity,
                }));
            include({
                id: String(row._id), reference: 'TXN-' + String(row._id).toUpperCase(), type: row.type, category: row.category,
                delta: buckets.reduce((sum, posting) => sum + posting.delta, 0), buckets, createdAt: row.createdAt,
                performedBy: row.performedBy, campaignId: row.campaignId,
                purchaseId: row.purchaseId, filterRequestId: row.filterRequestId, originalTransactionId: row.originalTransactionId,
                sourceReference: row.purchaseId || row.filterRequestId || row.campaignId,
            });
            continue;
        }
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
    for await (const request of NumberFilterRequest.find({ userId }).select("submittedRowCount chargeTransactionId creditResetAt").sort({ _id: 1 }).session(session).lean().cursor()) {
        const key = String(request._id);
        updateDigest(request);
        if (request.creditResetAt && !request.chargeTransactionId) continue;
        const charge = filteringCharges.get(key);
        if (!charge || charge.amount !== request.submittedRowCount || !same(charge._id, request.chargeTransactionId)) filteringMismatch = true;
        filteringCharges.delete(key);
    }
    if (filteringMismatch || filteringCharges.size) concerns.push("Number filtering requests do not match their recorded charges.");
    const categories = categorized.summary(concerns);
    await checkPurchaseHolds(user, userId, purchaseMovements, categories, session, updateDigest, concerns);
    await checkCampaignAdjustments(userId, campaignMovements, session, updateDigest, concerns);
    const differenceMinor = walletMinor - running;
    // Legacy test accounts follow the same zero-opening policy as new accounts.
    // Missing old creation records alone never creates a warning or blocks repair.
    const evidenceConflict = concerns.length > 0;
    const needsReview = Boolean(differenceMinor || minorMismatch || evidenceConflict);
    const classification = !needsReview ? "matched" : concerns.length ? "cannot_confirm" : "confirmed";
    const summary = {
        evidenceVersion: CREDIT_EVIDENCE_VERSION,
        account: { id: String(userId), username: user?.username || "Missing account", role: user?.role || "Unknown" },
        walletId: wallet ? String(wallet._id) : null, walletBalance: credits(walletMinor), walletMinor,
        expectedBalance: credits(running), expectedMinor: running, difference: credits(differenceMinor), differenceMinor,
        opening: { amount: 0, verified: openingVerified, source: openingSource },
        totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, key === "requestCount" ? value : credits(value)])),
        transactionCount: count, recoveryCount: recoveries.length, legacyCount, invalidCount,
        independentBalance: credits(typedRunning), calculationsAgree: invalidCount === 0 && typedRunning === running,
        minorMismatch, evidenceConflict, needsReview, classification, concerns, firstBreak, firstEntry, lastEntry, categories,
        audit: { count: auditCount, verified: auditCount ? auditValid : null }, checkedAt: new Date(),
    };
    updateDigest({ openingMinor, openingVerified, auditValid });
    return { summary, snapshot: digest.digest("hex"), entries, pagination: { page, limit, total: matchedCount, pages: Math.max(1, Math.ceil(matchedCount / limit)) }, wallet };
}
