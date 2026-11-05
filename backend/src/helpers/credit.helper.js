import mongoose from "mongoose";
import walletModel from "../models/wallet.model.js";
import userModel from "../models/user.model.js";
import transactionModel from "../models/transaction.model.js";
import { creditAmount, creditMinor, creditsForCount, creditTransactionOptions } from "./credit-amount.js";

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
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const session = await mongoose.startSession();
    let report;
    try {
        await session.withTransaction(async () => {
            const wallet = await walletModel.findOne({ userId: userObjectId }).session(session);
            if (!wallet) throw new Error(`Wallet not found for user ${userId}`);
            const isFrom = { $eq: ["$fromUser", userObjectId] };
            const isTo = { $eq: ["$toUser", userObjectId] };
            const is = (type) => ({ $eq: ["$type", type] });
            const and = (...args) => ({ $and: args });
            const [totals] = await transactionModel.aggregate([
                { $match: { $or: [{ fromUser: userObjectId }, { toUser: userObjectId }, { "postings.userId": userObjectId }] } },
                { $project: {
                    amountMinor: { $ifNull: ["$amountMinor", { $round: [{ $multiply: ["$amount", 100] }, 0] }] },
                    postings: { $ifNull: ["$postings", []] },
                    inflow: { $or: [and(is("ALLOCATE"), isTo, { $ne: ["$fromUser", userObjectId] }), and(is("REFUND"), isTo), and(is("RECLAIM"), isTo)] },
                    outflow: { $or: [and(is("DEDUCT"), { $or: [isFrom, and({ $eq: ["$fromUser", null] }, isTo)] }), and(is("ALLOCATE"), isFrom, { $ne: ["$toUser", userObjectId] }), and(is("RECLAIM"), isFrom)] },
                } },
                { $project: { deltaMinor: { $cond: [
                    { $gt: [{ $size: "$postings" }, 0] },
                    { $sum: { $map: { input: { $filter: { input: "$postings", as: "entry", cond: { $eq: ["$$entry.userId", userObjectId] } } }, as: "entry", in: "$$entry.deltaMinor" } } },
                    { $subtract: [{ $cond: ["$inflow", "$amountMinor", 0] }, { $cond: ["$outflow", "$amountMinor", 0] }] },
                ] } } },
                { $group: { _id: null, totalInflowMinor: { $sum: { $max: ["$deltaMinor", 0] } }, totalOutflowMinor: { $sum: { $max: [{ $multiply: ["$deltaMinor", -1] }, 0] } } } },
            ]).session(session);
            const inflow = Number(totals?.totalInflowMinor || 0);
            const outflow = Number(totals?.totalOutflowMinor || 0);
            const current = creditMinor(wallet.balance);
            const expected = inflow - outflow;
            if (![inflow, outflow, expected].every(Number.isSafeInteger)) throw new Error("Ledger totals exceed the supported credit range");
            report = { userId, currentBalance: wallet.balance, calculatedBalance: expected / 100, totalInflow: inflow / 100, totalOutflow: outflow / 100, isReconciled: current === expected, drift: (current - expected) / 100 };
        }, creditTransactionOptions);
        return report;
    } finally { await session.endSession(); }
}

export default { deductCredits, refundCredits, reconcileWallet };
