// src/helpers/credit.helper.js

/**
 * Internal reusable credit helper functions.
 * These functions enforce SQL-level ACID properties:
 * - Atomicity: Transactions with majority write concern
 * - Consistency: Min-balance invariants and ledger reconciliation
 * - Isolation: Guarded atomic compare-and-swap ($inc with $gte)
 * - Durability: Journaled writes flushed to disk (j: true)
 */

import mongoose from "mongoose";
import walletModel from "../models/wallet.model.js";
import userModel from "../models/user.model.js";
import transactionModel from "../models/transaction.model.js";

/**
 * Deduct credits from a user's wallet using atomic Compare-And-Swap (CAS).
 * @param {string|mongoose.Types.ObjectId} userId - Target user ID.
 * @param {number} count - Number of messages / units to deduct.
 * @param {mongoose.ClientSession} [session] - Optional active mongoose session.
 * @param {object} [options] - Optional overrides (e.g. { directAmount, rate })
 * @returns {Promise<{amount: number, newBalance: number}>}
 */
export async function deductCredits(userId, count, session = null, options = {}) {
    const ownSession = !session;
    const mongoSession = ownSession ? await mongoose.startSession() : session;

    if (ownSession) {
        mongoSession.startTransaction({
            readConcern: { level: "snapshot" },
            writeConcern: { w: "majority", j: true },
        });
    }

    try {
        let deductionAmount = 0;

        if (options.directAmount !== undefined && options.directAmount !== null) {
            deductionAmount = Number(options.directAmount);
        } else {
            const msgCount = Number(count);
            if (isNaN(msgCount) || msgCount <= 0) {
                throw new Error("count must be a positive number");
            }

            const targetUser = await userModel.findById(userId).session(mongoSession);
            if (!targetUser) {
                throw new Error("User not found");
            }

            const rate = options.rate ?? targetUser.ratePerMsg;
            if (!rate || rate <= 0) {
                throw new Error("User does not have a valid rate per message");
            }

            deductionAmount = rate * msgCount;
        }

        if (isNaN(deductionAmount) || deductionAmount <= 0) {
            throw new Error("Deduction amount must be a positive number");
        }

        // ── ATOMIC ISOLATION GUARD (Compare-And-Swap) ──────────
        // Decrements balance ONLY IF balance >= deductionAmount at database engine level
        const updatedWallet = await walletModel.findOneAndUpdate(
            {
                userId,
                balance: { $gte: deductionAmount }, // Atomic Guard
            },
            {
                $inc: { balance: -deductionAmount }, // Atomic decrement
            },
            {
                returnDocument: 'after',
                session: mongoSession,
            }
        );

        if (!updatedWallet) {
            const currentWallet = await walletModel.findOne({ userId }).session(mongoSession);
            const available = currentWallet ? currentWallet.balance : 0;
            throw new Error(
                `Insufficient credits or concurrent deduction in progress. Required: ${deductionAmount}, Available: ${available}`
            );
        }

        if (ownSession) {
            await mongoSession.commitTransaction();
            mongoSession.endSession();
        }

        return { amount: deductionAmount, newBalance: updatedWallet.balance };
    } catch (err) {
        if (ownSession) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
        }
        throw err;
    }
}

/**
 * Refund credits to a user's wallet using atomic CAS ($inc).
 * @param {string|mongoose.Types.ObjectId} userId - Target user ID.
 * @param {number} count - Number of messages / units to refund.
 * @param {mongoose.ClientSession} [session] - Optional active mongoose session.
 * @param {object} [options] - Optional overrides (e.g. { directAmount, rate })
 * @returns {Promise<{amount: number, newBalance: number}>}
 */
export async function refundCredits(userId, count, session = null, options = {}) {
    const ownSession = !session;
    const mongoSession = ownSession ? await mongoose.startSession() : session;

    if (ownSession) {
        mongoSession.startTransaction({
            readConcern: { level: "snapshot" },
            writeConcern: { w: "majority", j: true },
        });
    }

    try {
        let refundAmount = 0;

        if (options.directAmount !== undefined && options.directAmount !== null) {
            refundAmount = Number(options.directAmount);
        } else {
            const msgCount = Number(count);
            if (isNaN(msgCount) || msgCount <= 0) {
                throw new Error("count must be a positive number");
            }

            const targetUser = await userModel.findById(userId).session(mongoSession);
            if (!targetUser) {
                throw new Error("User not found");
            }

            const rate = options.rate ?? targetUser.ratePerMsg;
            if (!rate || rate <= 0) {
                throw new Error("User does not have a valid rate per message");
            }

            refundAmount = rate * msgCount;
        }

        if (isNaN(refundAmount) || refundAmount <= 0) {
            throw new Error("Refund amount must be a positive number");
        }

        // Target user lookup for default resellerId if inserting
        const targetUser = await userModel.findById(userId).session(mongoSession);

        // ── ATOMIC INCREMENT (Handles Upsert Safely) ───────────
        const updatedWallet = await walletModel.findOneAndUpdate(
            { userId },
            {
                $inc: { balance: refundAmount },
                $setOnInsert: { resellerId: targetUser?.resellerId || null },
            },
            {
                returnDocument: 'after',
                upsert: true,
                session: mongoSession,
            }
        );

        if (ownSession) {
            await mongoSession.commitTransaction();
            mongoSession.endSession();
        }

        return { amount: refundAmount, newBalance: updatedWallet.balance };
    } catch (err) {
        if (ownSession) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
        }
        throw err;
    }
}

/**
 * Reconcile wallet balance against double-entry transaction ledger.
 * Balance Invariant: Wallet Balance === Total Inflow - Total Outflow
 * @param {string|mongoose.Types.ObjectId} userId
 * @returns {Promise<{userId, currentBalance, calculatedBalance, totalInflow, totalOutflow, isReconciled, drift}>}
 */
export async function reconcileWallet(userId) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const wallet = await walletModel.findOne({ userId: userObjectId });

    if (!wallet) {
        throw new Error(`Wallet not found for user ${userId}`);
    }

    const transactions = await transactionModel.aggregate([
        {
            $match: {
                $or: [{ toUser: userObjectId }, { fromUser: userObjectId }],
            },
        },
        {
            $project: {
                amount: 1,
                type: 1,
                fromUser: 1,
                toUser: 1,
                inflow: {
                    $cond: [
                        {
                            $or: [
                                {
                                    $and: [
                                        { $eq: ["$type", "ALLOCATE"] },
                                        { $eq: ["$toUser", userObjectId] },
                                        { $ne: ["$fromUser", userObjectId] },
                                    ],
                                },
                                {
                                    $and: [
                                        { $eq: ["$type", "REFUND"] },
                                        { $eq: ["$toUser", userObjectId] },
                                    ],
                                },
                                {
                                    $and: [
                                        { $eq: ["$type", "RECLAIM"] },
                                        { $eq: ["$toUser", userObjectId] },
                                    ],
                                },
                            ],
                        },
                        "$amount",
                        0,
                    ],
                },
                outflow: {
                    $cond: [
                        {
                            $or: [
                                { $eq: ["$type", "DEDUCT"] },
                                {
                                    $and: [
                                        { $eq: ["$type", "ALLOCATE"] },
                                        { $eq: ["$fromUser", userObjectId] },
                                        { $ne: ["$toUser", userObjectId] },
                                    ],
                                },
                                {
                                    $and: [
                                        { $eq: ["$type", "RECLAIM"] },
                                        { $eq: ["$fromUser", userObjectId] },
                                    ],
                                },
                            ],
                        },
                        "$amount",
                        0,
                    ],
                },
            },
        },
        {
            $group: {
                _id: null,
                totalInflow: { $sum: "$inflow" },
                totalOutflow: { $sum: "$outflow" },
            },
        },
    ]);

    const inflow = transactions[0]?.totalInflow || 0;
    const outflow = transactions[0]?.totalOutflow || 0;
    const calculatedBalance = inflow - outflow;

    const isReconciled = wallet.balance === calculatedBalance;
    const drift = wallet.balance - calculatedBalance;

    if (!isReconciled) {
        console.warn(
            `⚠️ INTEGRITY DRIFT DETECTED for user ${userId}: Wallet Balance = ${wallet.balance}, Calculated Ledger = ${calculatedBalance}, Drift = ${drift}`
        );
    }

    return {
        userId,
        currentBalance: wallet.balance,
        calculatedBalance,
        totalInflow: inflow,
        totalOutflow: outflow,
        isReconciled,
        drift,
    };
}

export default {
    deductCredits,
    refundCredits,
    reconcileWallet,
};
