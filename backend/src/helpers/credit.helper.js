import mongoose from "mongoose";
import userModel from "../models/user.model.js";
import { creditAmount, creditsForCount, creditTransactionOptions } from "./credit-amount.js";
import { inspectCreditAccount } from "../services/credit-evidence.service.js";
import { postCreditMovement } from "../services/credit-posting.service.js";
import { runCreditTransaction } from "./credit-operation.js";

async function moveCredits(userId, count, session, options, direction) {
    if (!session) {
        return runCreditTransaction(owned => moveCredits(userId, count, owned, options, direction), { walletIds: [userId] });
    }
    if (!session.inTransaction()) throw new Error("An active transaction is required");
    const user = await userModel.findById(userId).session(session);
    if (!user) throw new Error("User not found");
    const rate = options.rate ?? user.ratePerMsg;
    const amount = options.directAmount != null ? creditAmount(options.directAmount) : creditsForCount(rate, count);
    if (amount <= 0) throw new Error("Credit amount must be positive");
    const { wallet, transaction } = await postCreditMovement({
        session, operationKey: options.operationKey || (options.refundOperationId ? `refund:${options.refundOperationId}` : ""),
        type: direction > 0 ? "REFUND" : "DEDUCT", amount,
        fromUser: direction < 0 ? userId : null, toUser: userId,
        performedBy: options.performedBy || userId,
        campaignId: options.campaignId || null,
        refundOperationId: options.refundOperationId,
        notes: options.notes || (direction > 0 ? "Credit refund" : "Credit deduction"),
        rateSnapshot: rate,
    });
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
