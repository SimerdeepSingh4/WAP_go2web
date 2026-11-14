import mongoose from "mongoose";
import Conversation from "../models/supportConversation.model.js";
import User from "../models/user.model.js";
import Wallet from "../models/wallet.model.js";
import Transaction from "../models/transaction.model.js";
import { hasConversationAccess, canManageSupportAccount } from "../helpers/support-access.js";
import { recordSupportAction, publishSupportAction } from "../helpers/support-action.js";
import { transactionObjectId } from "../helpers/transaction-reference.js";
import { creditTransactionOptions } from "../helpers/credit-amount.js";
import { reconcileWallet } from "../helpers/credit.helper.js";
import { supportTransactionView } from "../helpers/support-transaction.js";
import { notifyUser } from "../services/socket.service.js";
import { accountRestriction } from "../../../shared/accountAccess.js";

async function supportAccount(req, session = null) {
    const conversation = await Conversation.findById(req.params.id).session(session);
    if (!conversation) throw Object.assign(new Error("Conversation not found."), { statusCode: 404 });
    if (!hasConversationAccess(conversation, req.user)) throw Object.assign(new Error("You cannot access this conversation."), { statusCode: 403 });
    const account = await User.findById(conversation.user).select("username role resellerId status expiresAt accessReason updatedAt ratePerMsg").session(session);
    if (!account) throw Object.assign(new Error("Account not found."), { statusCode: 404 });
    const requester = String(account._id) === String(req.user._id);
    const canManage = canManageSupportAccount(account, req.user);
    // Historical conversation membership does not grant access to a reassigned wallet.
    if (!requester && !canManage) throw Object.assign(new Error("This account is no longer assigned to you."), { statusCode: 403 });
    return { conversation, account, requester, canManage };
}

function failure(res, error) {
    if (!error.statusCode) console.error("Support tools error:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Could not complete this support action. Please try again." });
}

export async function getSupportContext(req, res) {
    try {
        const { account, requester, canManage } = await supportAccount(req);
        const wallet = await Wallet.findOne({ userId: account._id }).lean();
        const isExpired = Boolean(wallet?.expiresAt && new Date(wallet.expiresAt) <= new Date());
        const restriction = accountRestriction(account);
        return res.json({ success: true, data: {
            account: { id: account._id, username: account.username, role: account.role, status: account.status, restriction, expiresAt: account.expiresAt, accessReason: account.accessReason || "", updatedAt: account.updatedAt },
            wallet: { balance: wallet?.balance || 0, expiresAt: wallet?.expiresAt || null, isExpired, isLocked: Boolean(wallet?.isLocked || isExpired), lockEnabled: Boolean(wallet?.isLocked), updatedAt: wallet?.updatedAt || null },
            capabilities: { manageAccount: canManage, allocate: canManage, requestCredits: requester && !restriction && !req.isPreview, manageCreditValidity: canManage && req.user.role === "Super Admin", auditLedger: canManage && req.user.role === "Super Admin", escalate: canManage && req.user.role === "Reseller" },
            checkedAt: new Date(),
        } });
    } catch (error) { return failure(res, error); }
}

export async function getSupportLedger(req, res) {
    try {
        if (req.user.role !== "Super Admin") return res.status(403).json({ success: false, message: "Only Super Admin can audit another account's ledger." });
        const { account, canManage } = await supportAccount(req);
        if (!canManage) return res.status(403).json({ success: false, message: "You cannot audit this account." });
        const report = await reconcileWallet(account._id);
        return res.json({ success: true, data: report });
    } catch (error) { return failure(res, error); }
}

export async function applySupportWalletAction(req, res) {
    let session, accountId;
    try {
        if (req.user.role !== "Super Admin" || req.isPreview || accountRestriction(req.user)) return res.status(403).json({ success: false, message: "Only an active Super Admin can change credit validity or wallet locks." });
        if (typeof req.body.isLocked !== "boolean" || !Object.hasOwn(req.body, "expectedUpdatedAt")) return res.status(400).json({ success: false, message: "Review the wallet lock and validity settings first." });
        let expiresAt = null;
        if (req.body.expiresAt !== null) {
            const value = req.body.expiresAt;
            if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return res.status(400).json({ success: false, message: "Choose a future credit expiry date, or no expiry." });
            expiresAt = new Date(`${value}T23:59:59.999Z`);
            if (!Number.isFinite(expiresAt.getTime()) || expiresAt.toISOString().slice(0, 10) !== value || expiresAt <= new Date()) return res.status(400).json({ success: false, message: "Credit expiry must be a valid future date." });
        }
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            const { account, canManage } = await supportAccount(req, session);
            if (!canManage) throw Object.assign(new Error("You cannot manage this wallet."), { statusCode: 403 });
            accountId = account._id;
            let wallet = await Wallet.findOne({ userId: accountId }).session(session);
            const version = wallet?.updatedAt?.toISOString() || null;
            if (version !== req.body.expectedUpdatedAt) throw Object.assign(new Error("Wallet details changed. Refresh and review the settings again."), { statusCode: 409 });
            if (!wallet) wallet = new Wallet({ userId: accountId, balance: 0, resellerId: account.resellerId || null });
            wallet.expiresAt = expiresAt;
            wallet.isLocked = req.body.isLocked;
            await wallet.save({ session });
            req.body.supportConversationId = req.params.id;
            const validity = expiresAt ? `through ${req.body.expiresAt}` : "to no expiry";
            await recordSupportAction(req, session, accountId, `Credit validity updated ${validity}. Wallet ${wallet.isLocked ? "locked" : "unlocked"}. Account access and credit balance are unchanged.`, new mongoose.Types.ObjectId());
        }, creditTransactionOptions);
        await Promise.allSettled([publishSupportAction(req), notifyUser(accountId, "WALLET_UPDATED", { reason: "EXPIRY_UPDATED" })]);
        return res.json({ success: true, message: "Credit validity and wallet lock updated." });
    } catch (error) { return failure(res, error); }
    finally { if (session) await session.endSession(); }
}

export async function getSupportTransactions(req, res) {
    try {
        const { account } = await supportAccount(req);
        const filter = { $or: [{ fromUser: account._id }, { toUser: account._id }] };
        if (req.query.reference) {
            const id = transactionObjectId(req.query.reference);
            if (!id) return res.status(400).json({ success: false, message: "Enter a complete TXN reference." });
            filter._id = id;
        }
        const transactions = await Transaction.find(filter).sort({ createdAt: -1 }).limit(20).lean();
        return res.json({ success: true, accountId: String(account._id), data: transactions.map(item => supportTransactionView(item, account._id)).filter(Boolean) });
    } catch (error) { return failure(res, error); }
}

export async function applySupportAccessAction(req, res) {
    let session;
    let updatedConversation;
    try {
        if (!["extend-expiry", "unblock"].includes(req.body.action)) return res.status(400).json({ success: false, message: "Choose a supported account action." });
        if (req.isPreview || accountRestriction(req.user)) return res.status(403).json({ success: false, message: "Account changes are unavailable in this session." });
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
            const { account, canManage, conversation } = await supportAccount(req, session);
            updatedConversation = conversation;
            if (!canManage) throw Object.assign(new Error("Only the assigned administrator can change account access."), { statusCode: 403 });
            if (!req.body.expectedUpdatedAt || new Date(req.body.expectedUpdatedAt).getTime() !== new Date(account.updatedAt).getTime()) {
                throw Object.assign(new Error("Account details changed. Refresh and review the action again."), { statusCode: 409 });
            }
            let text;
            if (req.body.action === "extend-expiry") {
                if (typeof req.body.expiresAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(req.body.expiresAt)) throw Object.assign(new Error("Choose a valid expiry date."), { statusCode: 400 });
                const date = new Date(`${req.body.expiresAt}T23:59:59.999Z`);
                if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== req.body.expiresAt || date <= new Date() || (account.expiresAt && date <= new Date(account.expiresAt))) {
                    throw Object.assign(new Error("Choose a future date later than the current expiry."), { statusCode: 400 });
                }
                account.expiresAt = date;
                if (account.status === "expired") account.status = "active";
                text = `Account expiry extended through ${req.body.expiresAt}.${account.status === "blocked" ? " The account remains blocked pending review." : ""}`;
            } else {
                if (account.status !== "blocked") throw Object.assign(new Error("This account is no longer blocked. Refresh its status."), { statusCode: 409 });
                account.status = "active";
                account.accessReason = "";
                text = `Account block removed.${accountRestriction(account) === "expired" ? " The account still requires renewal." : ""}`;
            }
            await account.save({ session });
            req.body.supportConversationId = req.params.id;
            await recordSupportAction(req, session, account._id, text, new mongoose.Types.ObjectId());
        }, creditTransactionOptions);
        // A receipt is already committed; notification failures must not report a failed action.
        await Promise.allSettled([
            notifyUser(updatedConversation.user, "ACCOUNT_ACCESS_CHANGED", {}),
            publishSupportAction(req),
        ]);
        return res.json({ success: true, message: "Account updated. The result has been recorded in this conversation." });
    } catch (error) { return failure(res, error); }
    finally { if (session) await session.endSession(); }
}
