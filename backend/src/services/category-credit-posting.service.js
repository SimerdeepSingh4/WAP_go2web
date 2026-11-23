import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Wallet from "../models/wallet.model.js";
import User from "../models/user.model.js";
import Transaction from "../models/transaction.model.js";
import CreditPurchase from "../models/credit-purchase.model.js";
import { categoryBalances, creditBalancePath, CREDIT_CATEGORIES, isCreditQuantity } from "../helpers/credit-categories.js";
import { categoryWalletMovements } from "../helpers/category-ledger-postings.js";

const failure = (message, statusCode = 400, code = "CREDIT_POSTING_REJECTED") => Object.assign(new Error(message), { statusCode, code });
const same = (a, b) => String(a ?? "") === String(b ?? "");
const manages = (reseller, buyer) => reseller?.role === "Reseller" && buyer?.role === "User" && same(reseller._id, buyer.resellerId);

async function validatePurchase(record, actor, source, target, session) {
    if (!record.purchaseId) return;
    const purchase = await CreditPurchase.findById(record.purchaseId).select("+paymentProofKey").session(session).lean();
    if (!purchase || purchase.category !== record.category || purchase.quantity !== record.amount) {
        throw failure("The credit category and quantity must match the purchase.", 409);
    }
    const events = await Transaction.find({ purchaseId: purchase._id }).select("type").session(session).lean();
    const posted = new Set(events.map(event => event.type));
    const { sellerId, buyerId } = purchase;
    if (record.type === "ALLOCATE") {
        if (!same(sellerId, actor._id) || !same(buyerId, target._id) || (source && !same(sellerId, source._id))) {
            throw failure("Only the recorded seller can fulfill this buyer's purchase.", 403);
        }
        if (!["PENDING", "REVIEW_REQUIRED"].includes(purchase.status) || !purchase.paymentProofKey || posted.has("ALLOCATE")) {
            throw failure("This purchase is no longer awaiting fulfillment.", 409);
        }
        record.fromReserved = posted.has("RESERVE") && !posted.has("RELEASE");
        return;
    }
    if (!["RESERVE", "RELEASE"].includes(record.type)) throw failure("This movement cannot use a purchase reference.");
    if (source?.role !== "Reseller" || !same(sellerId, source._id) || !same(sellerId, target._id)
        || !(same(actor._id, sellerId) || (record.type === "RESERVE" && same(actor._id, buyerId)) || actor.role === "Super Admin")) {
        throw failure("This account cannot reserve or release the seller's credits.", 403);
    }
    if (record.type === "RESERVE" ? purchase.reservationFree || purchase.status !== "QUOTED" || posted.size
        : !posted.has("RESERVE") || posted.has("ALLOCATE") || posted.has("RELEASE")) {
        throw failure("The credits for this purchase have already moved or cannot be reserved.", 409);
    }
}

async function validateRefund(record, actor, session) {
    if (!record.originalTransactionId) return;
    const original = await Transaction.findById(record.originalTransactionId).session(session).lean();
    if (!original || original.type !== "DEDUCT" || original.originalTransactionId || original.category !== record.category
        || !same(original.campaignId, record.campaignId) || !same(original.toUser, record.toUser)) {
        throw failure("The adjustment must belong to this account's original campaign debit.", 409);
    }
    if (record.type === "DEDUCT" && actor.role !== "Super Admin") throw failure("Only Super Admin can reverse a campaign refund.", 403);
    const adjustments = await Transaction.find({ originalTransactionId: original._id }).select("type amount").session(session).lean();
    const settled = adjustments.reduce((quantity, entry) => quantity + (entry.type === "REFUND" ? entry.amount : -entry.amount), 0);
    const next = settled + (record.type === "REFUND" ? record.amount : -record.amount);
    if (!isCreditQuantity(next) || next > original.amount) throw failure("The adjustment exceeds the original campaign debit or settled refund.", 409);
}

// Only the shared posting entry point calls this, with an active guarded session.
export async function postCategoryCreditMovement({
    session, operationKey, type, category, amount, fromUser = null, toUser, performedBy,
    campaignId = null, filterRequestId, purchaseId, originalTransactionId, notes = "",
    rateSnapshot, allowLockedDebit, toWalletSet,
}) {
    if (!CREDIT_CATEGORIES.includes(category) || !isCreditQuantity(amount) || amount === 0) throw failure("Choose a credit category and a positive whole credit quantity.");
    if (type === "REQUEST" || rateSnapshot != null || allowLockedDebit || Object.keys(toWalletSet || {}).length) throw failure("This posting cannot change wallet settings or include legacy rate fields.");
    const sourceId = type === "DEDUCT" ? fromUser || toUser : fromUser;
    const record = { type, category, amount, fromUser: sourceId, toUser, performedBy, campaignId, filterRequestId, purchaseId, originalTransactionId, notes };
    const operationFingerprint = createHash("sha256").update(JSON.stringify(record)).digest("hex");
    const previous = await Transaction.findOne({ operationKey }).session(session);
    if (previous) {
        if (previous.operationFingerprint !== operationFingerprint) throw failure("This operation reference already belongs to different credit details.", 409, "CREDIT_REFERENCE_REUSED");
        const toWallet = await Wallet.findOne({ userId: toUser }).session(session);
        const fromWallet = sourceId && (same(sourceId, toUser) ? toWallet : await Wallet.findOne({ userId: sourceId }).session(session));
        return { transaction: previous, fromWallet, toWallet, wallet: toWallet || fromWallet, replayed: true };
    }

    const fields = "role resellerId";
    const target = await User.findById(toUser).select(fields).session(session).lean();
    const actor = await User.findById(performedBy).select(fields).session(session).lean();
    const source = sourceId && (same(sourceId, toUser) ? target : await User.findById(sourceId).select(fields).session(session).lean());
    if (!actor || !target || (sourceId && !source)) throw failure("A credit operation account was not found.", 404);
    const admin = actor.role === "Super Admin";
    const systemReclaim = type === "RECLAIM" && target.role === "Super Admin";
    if (target.role === "Super Admin" && !systemReclaim
        || type === "ALLOCATE" && (source ? !manages(source, target) || !(admin || same(actor._id, sourceId)) : !admin)
        || type === "RECLAIM" && (systemReclaim ? !admin || !same(actor._id, toUser) : !same(actor._id, toUser) || !manages(target, source))
        || ["DEDUCT", "REFUND"].includes(type) && !(admin || same(actor._id, toUser) || (type === "REFUND" && manages(actor, target)))) {
        throw failure("This account cannot perform the credit movement.", 403);
    }
    await validatePurchase(record, actor, source, target, session);
    let movements;
    try { movements = categoryWalletMovements(record, { systemReclaim }); }
    catch (error) { throw failure(error.message); }
    await validateRefund(record, actor, session);

    let fromWallet = null, toWallet = null;
    const affected = new Map();
    for (const movement of movements) {
        const id = String(movement.userId);
        const fields = affected.get(id) || [];
        fields.push(movement);
        affected.set(id, fields);
    }
    for (const [id, fields] of affected) {
        let wallet = await Wallet.findOne({ userId: id }).session(session);
        const spending = fields.some(movement => movement.deltaQuantity < 0);
        if (wallet?.isLocked && spending && !["RECLAIM", "RELEASE"].includes(type)) throw failure("This wallet is locked.", 403);
        if (!wallet && !spending) {
            [wallet] = await Wallet.create([{ userId: id, resellerId: target.resellerId || null }], { session });
        }
        const increments = Object.fromEntries(fields.map(({ bucket, deltaQuantity }) => [creditBalancePath(category, bucket), deltaQuantity]));
        const updated = wallet && await Wallet.findOneAndUpdate({ _id: wallet._id }, { $inc: increments }, { session, returnDocument: "after" });
        if (!updated) throw failure("Insufficient credits in this category. No changes were saved.", 400, "CREDIT_INSUFFICIENT");
        const balance = categoryBalances(updated)[category];
        for (const { side, bucket } of fields) record[`balanceAfter${side}`] = balance[bucket];
        if (same(id, sourceId)) fromWallet = updated;
        if (same(id, toUser)) toWallet = updated;
    }

    const [transaction] = await Transaction.create([{
        ...record, operationKey, operationFingerprint,
        ...(originalTransactionId ? { refundOperationId: new mongoose.Types.ObjectId(createHash("sha256").update(operationKey).digest("hex").slice(0, 24)) } : {}),
    }], { session });
    if (type === "ALLOCATE" && purchaseId) {
        const review = await CreditPurchase.updateOne({ _id: purchaseId, status: { $in: ["PENDING", "REVIEW_REQUIRED"] } }, {
            $set: { status: "APPROVED", reviewedBy: performedBy, reviewedAt: new Date(), fulfillmentTransactionId: transaction._id },
        }, { session });
        if (review.matchedCount !== 1) throw failure("The purchase changed during fulfillment.", 409);
    }
    return { transaction, fromWallet, toWallet, wallet: toWallet || fromWallet, replayed: false };
}
