import mongoose from "mongoose";
import walletModel from "../models/wallet.model.js";
import userModel from "../models/user.model.js";
import transactionModel from "../models/transaction.model.js";
import { creditAmount, creditsForCount, creditTransactionOptions } from "./credit-amount.js";
import { inspectCreditAccount } from "../services/credit-evidence.service.js";

async function moveCredits(userId, count, session, options, direction) {
    if (!session) {
        const owned = await mongoose.startSession();
        let result;
        try {
            await owned.withTransaction(async () => {
                result = await moveCredits(userId, count, owned, options, direction);
            }, creditTransactionOptions);
            return result;
        } finally { await owned.endSession(); }
    }
    if (!session.inTransaction()) throw new Error("An active transaction is required");
    const user = await userModel.findById(userId).session(session);
    if (!user) throw new Error("User not found");
    const rate = options.rate ?? user.ratePerMsg;
    const amount = options.directAmount != null ? creditAmount(options.directAmount) : creditsForCount(rate, count);
    if (amount <= 0) throw new Error("Credit amount must be positive");
    const wallet = await walletModel.findOneAndUpdate(
        { userId, ...(direction < 0 ? { balance: { $gte: amount } } : {}) },
        { $inc: { balance: direction * amount }, $setOnInsert: { resellerId: user.resellerId || null } },
        { returnDocument: "after", upsert: direction > 0, session }
    );
    if (!wallet) throw new Error("Insufficient credits. No balance or ledger changes were saved.");
    const [transaction] = await transactionModel.create([{
        type: direction > 0 ? "REFUND" : "DEDUCT", amount,
        fromUser: direction < 0 ? userId : null, toUser: userId,
        performedBy: options.performedBy || userId,
        campaignId: options.campaignId || null,
        ...(direction > 0 ? { refundOperationId: options.refundOperationId || new mongoose.Types.ObjectId() } : {}),
        notes: options.notes || (direction > 0 ? "Credit refund" : "Credit deduction"),
        rateSnapshot: rate,
        balanceAfterFrom: direction < 0 ? wallet.balance : null,
        balanceAfterTo: wallet.balance,
    }], { session });
    return { amount, newBalance: wallet.balance, transactionId: transaction._id };
}

export const deductCredits = (userId, count, session = null, options = {}) => moveCredits(userId, count, session, options, -1);
export const refundCredits = (userId, count, session = null, options = {}) => moveCredits(userId, count, session, options, 1);

// Read both documents from the same snapshot so an in-flight transfer cannot
// produce a false mismatch. This is read-only: historic drift is never hidden.
export async function reconcileWallet(userId) {
    const session = await mongoose.startSession();
    let report;
    try {
        await session.withTransaction(async () => {
            const { summary } = await inspectCreditAccount(new mongoose.Types.ObjectId(userId), session);
            report = { userId, currentBalance: summary.walletBalance, calculatedBalance: summary.expectedBalance,
                openingBalance: summary.opening.amount, totalInflow: summary.totals.inflow, totalOutflow: summary.totals.outflow,
                isReconciled: summary.classification === "matched", classification: summary.classification,
                drift: summary.difference, openingVerified: summary.opening.verified, concerns: summary.concerns };
        }, creditTransactionOptions);
        return report;
    } finally { await session.endSession(); }
}

export default { deductCredits, refundCredits, reconcileWallet };
