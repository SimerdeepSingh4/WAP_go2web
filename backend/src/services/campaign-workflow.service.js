import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import Campaign from "../models/campaign.model.js";
import Workflow from "../models/campaign-workflow.model.js";
import User from "../models/user.model.js";
import Wallet from "../models/wallet.model.js";
import Transaction from "../models/transaction.model.js";
import { creditAmount, creditDifference, creditsForCount, creditTransactionOptions } from "../helpers/credit-amount.js";
import { saveSpreadsheetRows, loadSpreadsheetRows } from "../helpers/spreadsheet-storage.js";
import { buildPublishedSheet } from "../../../shared/campaignSpreadsheet.js";
import { dispatchToProvider, normalizeProviderResults } from "../helpers/campaign-provider.js";
import { appendAudit, canonical } from "./audit.service.js";

function conflict(message) { const error = new Error(message); error.statusCode = 409; return error; }
async function transaction(callback) {
    const session = await mongoose.startSession();
    try { return await session.withTransaction(() => callback(session), creditTransactionOptions); }
    finally { await session.endSession(); }
}

async function verifyCreditReservation(campaign, session) {
    const owner = await User.findById(campaign.userId).session(session);
    if (!owner) throw conflict("Campaign owner is missing");
    if (owner.role === "Super Admin") return;
    const [ledger] = await Transaction.aggregate([
        { $match: { campaignId: campaign._id, type: "DEDUCT", refundOperationId: { $exists: false } } },
        { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]).session(session);
    if (creditAmount(ledger?.amount || 0) !== creditAmount(campaign.creditsDeducted) || creditAmount(campaign.creditsDeducted) !== creditsForCount(campaign.rateSnapshot, campaign.totalRecipients)) throw conflict("Campaign credit reservation does not reconcile; dispatch stopped");
}

export async function acceptCampaignCompletion({ campaignId, dispatchKey, jobId, results }) {
    if (!mongoose.isValidObjectId(campaignId) || typeof dispatchKey !== "string" || !dispatchKey || typeof jobId !== "string" || !jobId.trim() || jobId.length > 200) { const error = new Error("Invalid campaign completion identity"); error.statusCode = 400; throw error; }
    return transaction(async (session) => {
        const workflow = await Workflow.findById(campaignId).session(session);
        const campaign = await Campaign.findById(campaignId).session(session);
        if (!workflow || !campaign || workflow.dispatchKey !== dispatchKey) throw conflict("Unknown campaign dispatch");
        if (workflow.providerJobId && workflow.providerJobId !== jobId) throw conflict("Provider job does not match the dispatch");
        const rows = normalizeProviderResults(campaign, results);
        const hash = createHash("sha256").update(JSON.stringify(canonical(rows))).digest("hex");
        if (workflow.completionHash) {
            if (hash !== workflow.completionHash) throw conflict("A different completion was already accepted; use an admin report correction");
            return { accepted: true, duplicate: true };
        }
        if (!["ready", "waiting_webhook"].includes(workflow.stage) || !["ongoing", "scheduled"].includes(campaign.status) || campaign.manualStatusOverride || campaign.campaignSummary?.reportedBy) throw conflict("Campaign no longer accepts automatic results");
        // A synchronous provider callback can arrive before its HTTP response.
        if (workflow.stage === "ready" && !workflow.dispatchStartedAt) throw conflict("Campaign has not been dispatched");
        await saveSpreadsheetRows(campaign._id, "provider", rows, session);
        workflow.stage = "settling";
        workflow.providerJobId = jobId;
        workflow.completionHash = hash;
        workflow.dispatchedAt ||= new Date();
        workflow.nextRunAt = new Date();
        workflow.lease = undefined; workflow.leaseUntil = undefined;
        await workflow.save({ session });
        await appendAudit({ stream: `campaign:${campaign._id}`, action: "campaign.webhook.accepted", data: { jobId, completionHash: hash, count: rows.length } }, session);
        return { accepted: true, duplicate: false };
    });
}

export async function settleCampaignWorkflow(campaignId, lease) {
    return transaction(async (session) => {
        const workflow = await Workflow.findOne({ _id: campaignId, stage: "settling", lease }).session(session);
        if (!workflow) return { skipped: true };
        const campaign = await Campaign.findById(campaignId).session(session);
        if (!campaign || campaign.manualStatusOverride || campaign.campaignSummary?.reportedBy || !["ongoing", "scheduled"].includes(campaign.status)) throw conflict("Campaign changed before settlement; manual review required");
        await verifyCreditReservation(campaign, session);
        const rows = await loadSpreadsheetRows(campaign._id, "provider", session);
        if (!rows.length || rows.length !== campaign.totalRecipients) throw conflict("Completion rows do not match the reserved recipient count");
        const failed = rows.filter((row) => row.status === "failed").length;
        const read = rows.filter((row) => row.status === "read").length;
        const [ledger] = await Transaction.aggregate([
            { $match: { campaignId: campaign._id, $or: [{ type: "REFUND" }, { type: "DEDUCT", refundOperationId: { $exists: true } }] } },
            { $group: { _id: null, amount: { $sum: { $cond: [{ $eq: ["$type", "REFUND"] }, "$amount", { $multiply: ["$amount", -1] }] } } } },
        ]).session(session);
        const settled = creditAmount(ledger?.amount || 0);
        const target = Math.min(creditAmount(campaign.creditsDeducted), creditsForCount(campaign.rateSnapshot, failed));
        if (settled < 0 || settled > target) throw conflict("Existing refunds require manual review");
        const refund = creditDifference(target, settled);
        if (refund > 0) {
            const wallet = await Wallet.findOneAndUpdate({ userId: campaign.userId }, { $inc: { balance: refund } }, { returnDocument: "after", session });
            if (!wallet) throw conflict("Campaign owner's wallet is missing");
            await Transaction.create([{
                campaignId: campaign._id, type: "REFUND", amount: refund,
                // Stable across retries, with a unique refund index as a second guard.
                refundOperationId: campaign._id, fromUser: null, toUser: campaign.userId, performedBy: campaign.userId,
                rateSnapshot: campaign.rateSnapshot, balanceAfterTo: wallet.balance,
                notes: `Automatic delivery refund for ${failed} failed recipient(s)`,
            }], { session });
        }
        const now = new Date();
        const sheet = buildPublishedSheet(rows, []);
        await saveSpreadsheetRows(campaign._id, "draft", rows, session);
        await saveSpreadsheetRows(campaign._id, "published", sheet.rows, session);
        campaign.$locals.skipWorkflowSync = true;
        campaign.status = "completed"; campaign.publicStatus = "completed";
        campaign.campaignEndDate = now;
        campaign.spreadsheetRevision = (campaign.spreadsheetRevision || 0) + 1;
        campaign.spreadsheetColumns = sheet.columns; campaign.recipientEntries = [];
        campaign.campaignSummary = { sent: rows.length, delivered: rows.length - failed, read, failed, creditsRefunded: target, reportedAt: now, reportedBy: null };
        campaign.publishedSpreadsheet = { columns: sheet.columns, status: "completed", publishedAt: now, publishedBy: null, notes: "Delivery results received from the sending provider.", summary: { total: rows.length, delivered: rows.length - failed, failed, read, refunded: failed, creditsRefunded: target, creditsCharged: campaign.creditsDeducted } };
        await campaign.save({ session });
        workflow.stage = "completed"; workflow.completedAt = now;
        workflow.lease = undefined; workflow.leaseUntil = undefined; workflow.lastError = undefined;
        await workflow.save({ session });
        await appendAudit({ stream: `campaign:${campaign._id}`, action: "campaign.workflow.completed", data: { failed, refund, completionHash: workflow.completionHash } }, session);
        return { completed: true, refund };
    });
}

export async function runCampaignWorkflow(campaignId, dispatch = dispatchToProvider) {
    const lease = randomUUID();
    const now = new Date();
    const workflow = await Workflow.findOneAndUpdate({
        _id: campaignId, stage: { $in: ["ready", "settling"] }, nextRunAt: { $lte: now },
        $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: now } }],
    }, { $set: { lease, leaseUntil: new Date(Date.now() + 120000) }, $inc: { attempts: 1 } }, { returnDocument: "after" });
    if (!workflow) return { skipped: true };
    try {
        if (workflow.stage === "settling") return await settleCampaignWorkflow(campaignId, lease);
        const campaign = await Campaign.findById(campaignId);
        if (!campaign || !["ongoing", "scheduled"].includes(campaign.status) || campaign.manualStatusOverride || campaign.campaignSummary?.reportedBy) {
            await Workflow.updateOne({ _id: campaignId, lease }, { $set: { nextRunAt: new Date(Date.now() + 60000) }, $unset: { lease: "", leaseUntil: "" } });
            return { skipped: true };
        }
        if ((campaign.status === "scheduled" || campaign.schedule === "later") && campaign.scheduledTime > now) {
            await Workflow.updateOne({ _id: campaignId, lease }, { $set: { nextRunAt: campaign.scheduledTime }, $unset: { lease: "", leaseUntil: "" } });
            return { scheduled: true };
        }
        await transaction(async (session) => {
            const locked = await Workflow.findOne({ _id: campaignId, lease, stage: "ready" }).session(session);
            const live = await Campaign.findById(campaignId).session(session);
            if (!locked || !live || !["ongoing", "scheduled"].includes(live.status)) throw conflict("Campaign approval changed");
            await verifyCreditReservation(live, session);
            // Persist uncertainty before any network I/O. A lost response must
            // not unlock cancellation/refunds while the provider may be sending.
            locked.dispatchStartedAt ||= new Date();
            await locked.save({ session });
            if (live.status === "scheduled") {
                live.$locals.skipWorkflowSync = true;
                live.status = "ongoing"; live.publicStatus = "ongoing"; live.campaignStartDate ||= new Date();
                await live.save({ session });
            }
            await appendAudit({ stream: `campaign:${campaignId}`, action: "campaign.dispatch.attempted", data: { dispatchKey: workflow.dispatchKey, attempt: workflow.attempts } }, session);
        });
        const jobId = await dispatch(campaign, workflow);
        // Do not overwrite a completion received during the provider request.
        await Workflow.updateOne({ _id: campaignId, lease, stage: "ready" }, { $set: { stage: "waiting_webhook", providerJobId: jobId, dispatchedAt: new Date(), lastError: null }, $unset: { lease: "", leaseUntil: "" } });
        return { waiting: true };
    } catch (error) {
        await Workflow.updateOne({ _id: campaignId, lease }, { $set: { lastError: String(error.message).slice(0, 300), nextRunAt: new Date(Date.now() + Math.min(3600000, 5000 * 2 ** Math.min(workflow.attempts, 9))) }, $unset: { lease: "", leaseUntil: "" } });
        throw error;
    }
}
