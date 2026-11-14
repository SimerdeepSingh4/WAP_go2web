import mongoose from "mongoose";
import User from "../models/user.model.js";
import Wallet from "../models/wallet.model.js";
import Campaign from "../models/campaign.model.js";
import Transaction from "../models/transaction.model.js";
import { AuditEvent } from "../models/audit.model.js";
import { CreditCase, CreditCaseEvent, CreditAuditJob, CreditAuditState, CreditBalanceResult, CreditRepairPlan, CreditRepair } from "../models/credit-reconciliation.model.js";
import { inspectCreditAccount, reconciliationError } from "../services/credit-evidence.service.js";
import { checkCreditAccount, prepareCreditRepair, executeCreditRepair, requireReconciliationAdmin } from "../services/credit-reconciliation.service.js";
import { requestCreditFullScan } from "../workers/credit-reconciliation.worker.js";
import { creditTransactionOptions } from "../helpers/credit-amount.js";
import { appendAudit } from "../services/audit.service.js";

export function reconciliationAdminOnly(req, res, next) {
    try { requireReconciliationAdmin(req); next(); }
    catch (error) { res.status(error.statusCode || 403).json({ success: false, message: error.message }); }
}
const handle = fn => async (req, res) => {
    try { requireReconciliationAdmin(req); return await fn(req, res); }
    catch (error) {
        if (!error.statusCode) console.error("Credit reconciliation:", error.message);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "The credit check could not complete. Refresh the evidence before trying again." });
    }
};
// Also excludes old matching flags immediately, before the next worker recheck
// records their resolved status and permanent clearance event.
const reviewFilter = { state: "open", $or: [{ "summary.difference": { $ne: 0 } }, { "summary.minorMismatch": true }, { "summary.evidenceConflict": true }, { "summary.calculationsAgree": false }, { "summary.audit.verified": false }, { "summary.walletId": null }] };
export const reconciliationSummary = handle(async (_req, res) => {
    const [open, confirmed, unverified, matched, pending, retrying, monitor] = await Promise.all([
        CreditCase.countDocuments(reviewFilter), CreditCase.countDocuments({ ...reviewFilter, classification: "confirmed" }),
        CreditCase.countDocuments({ ...reviewFilter, classification: "cannot_confirm" }), CreditCase.countDocuments({ ...reviewFilter, classification: "matched" }),
        CreditAuditJob.countDocuments({ dirty: true }), CreditAuditJob.countDocuments({ dirty: true, attempts: { $gt: 0 } }), CreditAuditState.findById("monitor").lean(),
    ]);
    res.json({ success: true, open, confirmed, unverified, matched, pending, retrying, monitor: monitor ? { state: monitor.scanState, lastTickAt: monitor.lastTickAt, lastScanAt: monitor.scanFinishedAt, nextScanAt: monitor.nextFullScanAt, queued: monitor.scanQueued, error: monitor.error, healthy: Boolean(monitor.lastTickAt && Date.now() - new Date(monitor.lastTickAt).getTime() < 90000) } : { state: "not_started", healthy: false } });
});
export const listReconciliationCases = handle(async (req, res) => {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1)), limit = 25;
    const filter = {};
    if (req.query.state !== "all") Object.assign(filter, req.query.state === "resolved" ? { state: "resolved" } : reviewFilter);
    if (["confirmed", "cannot_confirm", "matched"].includes(req.query.classification)) filter.classification = req.query.classification;
    const search = String(req.query.search || "").trim().slice(0, 100);
    if (search) {
        const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        filter["summary.account.username"] = pattern;
    }
    const [items, total] = await Promise.all([CreditCase.find(filter).sort({ lastCheckedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), CreditCase.countDocuments(filter)]);
    res.json({ success: true, items, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
});
export const searchRecoveryAccounts = handle(async (req, res) => {
    const search = String(req.query.q || "").trim().slice(0, 100);
    if (search.length < 2) return res.json({ success: true, items: [], hasMore: false });
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const candidates = [{ username: pattern }, { email: pattern }];
    if (mongoose.isObjectIdOrHexString(search)) candidates.push({ _id: search });
    const users = await User.find({ role: { $in: ["User", "Reseller"] }, $or: candidates }).select("_id username role").sort({ username: 1, _id: 1 }).limit(21).lean();
    res.json({ success: true, items: users.slice(0, 20), hasMore: users.length > 20 });
});
export const startReconciliationScan = handle(async (req, res) => {
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            result = await requestCreditFullScan(session);
            await appendAudit({ stream: "reconciliation:monitor", action: "reconciliation.scan_requested", actor: { id: String(req.user._id), role: req.user.role, name: req.user.username }, data: result }, session);
        }, creditTransactionOptions);
    } finally { await session.endSession(); }
    return res.status(202).json({ success: true, ...result });
});
export const recheckReconciliation = handle(async (req, res) => {
    const view = await checkCreditAccount(new mongoose.Types.ObjectId(req.params.userId));
    res.json({ success: true, summary: view.summary, snapshot: view.snapshot });
});
export const reconciliationEvidence = handle(async (req, res) => {
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const userId = new mongoose.Types.ObjectId(req.params.userId);
            result = await inspectCreditAccount(userId, session, req.query);
            const campaignIds = [...new Set(result.entries.map(row => row.campaignId).filter(Boolean).map(String))];
            const actorIds = [...new Set(result.entries.map(row => row.performedBy).filter(Boolean).map(String))].filter(id => mongoose.isObjectIdOrHexString(id));
            const campaigns = await Campaign.find({ _id: { $in: campaignIds }, userId }).select("campaignTitle totalRecipients creditsDeducted rateSnapshot").session(session).lean();
            const actors = await User.find({ _id: { $in: actorIds } }).select("username role").session(session).lean();
            const related = campaignIds.length ? await Transaction.find({ campaignId: { $in: campaignIds }, $or: [{ fromUser: userId }, { toUser: userId }] }).select("campaignId type amount createdAt refundOperationId").session(session).lean() : [];
            const campaignMap = new Map(campaigns.map(campaign => {
                const rows = related.filter(row => String(row.campaignId) === String(campaign._id));
                const charged = rows.filter(row => row.type === "DEDUCT").reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
                const refunded = rows.filter(row => row.type === "REFUND").reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
                return [String(campaign._id), { id: String(campaign._id), title: campaign.campaignTitle, currentRecipientCount: campaign.totalRecipients, originalCharge: campaign.creditsDeducted, totalCharged: charged, totalRefunded: refunded, remainingCharged: Math.round((charged - refunded) * 100) / 100 }];
            }));
            const actorMap = new Map(actors.map(actor => [String(actor._id), { name: actor.username, role: actor.role, id: String(actor._id) }]));
            result.entries = result.entries.map(row => ({ ...row, actor: actorMap.get(String(row.performedBy)) || { name: "Not recorded", role: "Unknown" }, campaign: campaignMap.get(String(row.campaignId)) || null,
                billedCount: row.rate > 0 && Number.isSafeInteger(Math.abs(row.delta) / row.rate) ? Math.abs(row.delta) / row.rate : null,
                previousCampaignRefunds: row.campaignId ? related.filter(item => item.type === "REFUND" && String(item.campaignId) === String(row.campaignId) && item.createdAt < row.createdAt).reduce((sum, item) => sum + Math.round(item.amount * 100), 0) / 100 : null }));
        }, creditTransactionOptions);
        const { wallet, ...publicResult } = result;
        res.json({ success: true, ...publicResult });
    } finally { await session.endSession(); }
});
export const reconciliationHistory = handle(async (req, res) => {
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1)), limit = 30;
    const filter = { userId: req.params.userId };
    const [items, total] = await Promise.all([CreditCaseEvent.find(filter).sort({ _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), CreditCaseEvent.countDocuments(filter)]);
    res.json({ success: true, items, pagination: { page, pages: Math.max(1, Math.ceil(total / limit)), total } });
});
export const walletAuditEvidence = handle(async (req, res) => {
    const wallet = await Wallet.findOne({ userId: req.params.userId }).select("_id").lean();
    if (!wallet) throw reconciliationError("Wallet not found.", 404);
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1)), limit = 30;
    const filter = { stream: `wallet:${wallet._id}` };
    const [items, total] = await Promise.all([AuditEvent.find(filter).select("sequence action occurredAt actor data hash previousHash request.id request.path").sort({ sequence: 1 }).skip((page - 1) * limit).limit(limit).lean(), AuditEvent.countDocuments(filter)]);
    res.json({ success: true, items, pagination: { page, pages: Math.max(1, Math.ceil(total / limit)), total } });
});
export const previewReconciliationRepair = handle(async (req, res) => res.status(201).json({ success: true, plan: await prepareCreditRepair(req) }));
export const confirmReconciliationRepair = handle(async (req, res) => res.json({ success: true, result: await executeCreditRepair(req) }));
export const reconciliationRepairResult = handle(async (req, res) => {
    const plan = await CreditRepairPlan.findOne({ _id: req.params.planId, userId: req.params.userId, actorId: req.user._id }).select("_id expiresAt").lean();
    if (!plan) throw reconciliationError("This review does not belong to your account and the selected wallet.", 404);
    const receipt = await CreditRepair.findOne({ planId: plan._id }).select("_id after").lean();
    if (receipt) return res.json({ success: true, state: "completed", result: { id: String(receipt._id), after: receipt.after, replayed: true } });
    const last = await CreditCaseEvent.findOne({ userId: req.params.userId, "details.planId": String(plan._id), action: { $in: ["repair_started", "repair_failed", "repair_outcome_unconfirmed"] } }).sort({ auditSequence: -1, _id: -1 }).select("action").lean();
    const state = last?.action === "repair_started" ? "processing" : last?.action === "repair_outcome_unconfirmed" ? "unconfirmed" : last?.action === "repair_failed" ? "failed" : plan.expiresAt <= new Date() ? "expired" : "not_started";
    return res.json({ success: true, state, result: null });
});

// This is deliberately the only user-facing reconciliation endpoint. It never
// returns a discrepancy, source evidence, internal reason, or another wallet.
export async function ownCreditBalanceResult(req, res) {
    try {
        if (req.isPreview) return res.json({ success: true, result: null });
        const notice = await CreditBalanceResult.findOne({ userId: req.user._id }).lean();
        const wallet = notice && await Wallet.findOne({ userId: req.user._id }).select("balance").lean();
        res.json({ success: true, result: notice && wallet ? { version: notice.version, at: notice.at, balance: wallet.balance } : null });
    } catch { res.status(500).json({ success: false, message: "Could not refresh the credit balance." }); }
}
