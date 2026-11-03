import { notifyUser } from "../services/socket.service.js";
import { reconcileWallet as verifyReconcile } from "../helpers/credit.helper.js";
import mongoose from "mongoose";
import walletModel from "../models/wallet.model.js";
import transactionModel from "../models/transaction.model.js";
import userModel from "../models/user.model.js";

/**
 * GET /api/credits/balance
 * ------------------------
 * Returns the current user's wallet balance and rate per message.
 * Super Admin / Reseller can also query ?userId=xxx to check any user's balance.
 */
export async function getBalance(req, res) {
    try {
        let targetUserId = req.user._id;

        // Allow Super Admin / Reseller to check another user's balance
        if (req.query.userId) {
            if (req.user.role === "User") {
                return res.status(403).json({
                    message: "Users can only check their own balance.",
                    success: false,
                });
            }

            // Resellers can only check their own users
            if (req.user.role === "Reseller") {
                const targetUser = await userModel.findById(req.query.userId);
                if (
                    !targetUser ||
                    String(targetUser.resellerId) !== String(req.user._id)
                ) {
                    return res.status(403).json({
                        message:
                            "Resellers can only view balance of their own users.",
                        success: false,
                    });
                }
            }

            targetUserId = req.query.userId;
        }

        const targetUser = await userModel.findById(targetUserId);
        if (!targetUser) {
            return res.status(404).json({
                message: "User not found.",
                success: false,
            });
        }

        // Auto-create wallet if it doesn't exist
        let wallet = await walletModel.findOne({ userId: targetUserId });
        if (!wallet) {
            wallet = await walletModel.create({
                userId: targetUserId,
                balance: 0,
                resellerId: targetUser.resellerId || null,
            });
        }

        // Determine expiry & locked state
        const isExpired = Boolean(wallet.expiresAt && new Date(wallet.expiresAt) <= new Date());
        const isLocked = Boolean(wallet.isLocked || isExpired);

        return res.status(200).json({
            success: true,
            wallet: {
                userId: wallet.userId,
                balance: wallet.balance,
                resellerId: wallet.resellerId,
                ratePerMsg: targetUser.ratePerMsg,
                expiresAt: wallet.expiresAt || null,
                isExpired,
                isLocked,
                messagesRemaining: isLocked
                    ? 0
                    : (targetUser.ratePerMsg > 0
                        ? Math.floor(wallet.balance / targetUser.ratePerMsg)
                        : 0),
            },
        });
    } catch (error) {
        console.error("GetBalance error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}

/**
 * POST /api/credits/allocate
 * --------------------------
 * Allocate credits from one wallet to another.
 *
 * Rules:
 *   1. Super Admin → Reseller: Super Admin has unlimited pool, directly adds to Reseller wallet.
 *   2. Reseller → User: Reseller can only give from their own balance.
 *      If reseller has insufficient balance, the request is rejected.
 *   3. Users cannot allocate credits to anyone.
 *
 * Body: { toUserId, amount, notes? }
 */
export async function allocateCredits(req, res) {
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction();

    try {
        const { toUserId, amount, notes, password, expiryYears, expiryMonths, expiresAt } = req.body;

        // ── Validation ──────────────────────────────────────────
        if (!toUserId || !amount) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: "toUserId and amount are required.",
                success: false,
            });
        }

        const creditAmount = Number(amount);
        if (isNaN(creditAmount) || creditAmount <= 0) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: "Amount must be a positive number.",
                success: false,
            });
        }

        // Verify password if provided (for double-confirmation security)
        if (password) {
            const caller = await userModel.findById(req.user._id).select("+password");
            if (!caller || !(await caller.comparePassword(password))) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(401).json({
                    message: "Incorrect password. Credit transfer aborted for security.",
                    success: false,
                });
            }
        }

        if (req.user.role === "User") {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(403).json({
                message: "Users cannot allocate credits.",
                success: false,
            });
        }

        // ── Fetch target user ───────────────────────────────────
        const toUser = await userModel
            .findById(toUserId)
            .session(mongoSession);
        if (!toUser) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(404).json({
                message: "Target user not found.",
                success: false,
            });
        }

        // ── Role-based allocation rules ─────────────────────────
        let fromWallet = null;
        let balanceAfterFrom = null;

        if (req.user.role === "Super Admin") {
            // Super Admin can allocate to Resellers (or directly to Users)
            // Super Admin has unlimited pool — no deduction from their own wallet
            if (toUser.role === "Super Admin") {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({
                    message: "Cannot allocate credits to another Super Admin.",
                    success: false,
                });
            }
        } else if (req.user.role === "Reseller") {
            // Reseller can ONLY allocate to their own Users
            if (toUser.role !== "User") {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(403).json({
                    message: "Resellers can only allocate credits to Users.",
                    success: false,
                });
            }

            if (String(toUser.resellerId) !== String(req.user._id)) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(403).json({
                    message:
                        "Resellers can only allocate credits to their own users.",
                    success: false,
                });
            }

            // Reseller must have enough balance — deduct from their wallet
            fromWallet = await walletModel
                .findOne({ userId: req.user._id })
                .session(mongoSession);

            if (!fromWallet) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({
                    message: "Reseller wallet not found. Cannot allocate credits.",
                    success: false,
                });
            }

            if (fromWallet.expiresAt && new Date(fromWallet.expiresAt) <= new Date()) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(403).json({
                    message: "Your credit balance has expired and is locked. Cannot allocate credits.",
                    success: false,
                    isLocked: true,
                });
            }

            if (fromWallet.balance < creditAmount) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({
                    message: `Insufficient balance. Your balance: ${fromWallet.balance}, requested: ${creditAmount}.`,
                    success: false,
                    currentBalance: fromWallet.balance,
                });
            }

            // Atomic CAS Guard: Deduct from Reseller strictly if balance >= creditAmount
            const updatedFrom = await walletModel.findOneAndUpdate(
                {
                    userId: req.user._id,
                    balance: { $gte: creditAmount },
                },
                {
                    $inc: { balance: -creditAmount },
                },
                {
                    new: true,
                    session: mongoSession,
                }
            );

            if (!updatedFrom) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({
                    message: `Insufficient balance or concurrent transaction in progress. Your balance: ${fromWallet.balance}, requested: ${creditAmount}.`,
                    success: false,
                    currentBalance: fromWallet.balance,
                });
            }
            balanceAfterFrom = updatedFrom.balance;
        }

        // ── Calculate Expiry Date for Target User ─────────────────
        let targetExpiresAt = undefined;
        if (expiresAt) {
            targetExpiresAt = new Date(expiresAt);
        } else if (expiryYears != null && Number(expiryYears) > 0) {
            targetExpiresAt = new Date(Date.now() + Number(expiryYears) * 365.25 * 24 * 60 * 60 * 1000);
        } else if (expiryMonths != null && Number(expiryMonths) > 0) {
            targetExpiresAt = new Date(Date.now() + Number(expiryMonths) * 30 * 24 * 60 * 60 * 1000);
        } else if (expiryYears === 0 || expiryYears === "0") {
            targetExpiresAt = null; // explicit never expires
        } else if (req.user.role === "Super Admin") {
            // Default 2 years expiry when allocated by Super Admin
            targetExpiresAt = new Date(Date.now() + 2 * 365.25 * 24 * 60 * 60 * 1000);
        }

        // ── Add credits to target user's wallet (Atomic Upsert Increment) ─
        const updateOps = {
            $inc: { balance: creditAmount },
            $setOnInsert: { resellerId: toUser.resellerId || null },
        };
        if (targetExpiresAt !== undefined) {
            updateOps.$set = {
                expiresAt: targetExpiresAt,
                isLocked: false,
            };
        } else {
            updateOps.$set = { isLocked: false };
        }

        const updatedToWallet = await walletModel.findOneAndUpdate(
            { userId: toUserId },
            updateOps,
            {
                new: true,
                upsert: true,
                session: mongoSession,
            }
        );
        const balanceAfterTo = updatedToWallet.balance;

        // ── Create audit log ────────────────────────────────────
        const transaction = await transactionModel.create(
            [
                {
                    fromUser:
                        req.user.role === "Super Admin"
                            ? null
                            : req.user._id,
                    toUser: toUserId,
                    amount: creditAmount,
                    type: "ALLOCATE",
                    notes: notes || "",
                    rateSnapshot: toUser.ratePerMsg || null,
                    balanceAfterFrom,
                    balanceAfterTo,
                    performedBy: req.user._id,
                },
            ],
            { session: mongoSession }
        );

        await mongoSession.commitTransaction();
        mongoSession.endSession();

        // ── Real-Time WebSockets (POST-COMMIT) ────────────────────
        if (balanceAfterFrom !== null) {
            notifyUser(req.user._id, "WALLET_UPDATED", {
                newBalance: balanceAfterFrom,
                delta: -creditAmount,
                reason: "ALLOCATE",
                toUser: toUser.username,
            });
        }
        notifyUser(toUserId, "WALLET_UPDATED", {
            newBalance: balanceAfterTo,
            delta: +creditAmount,
            reason: "ALLOCATE",
            fromUser: req.user.username,
        });

        return res.status(200).json({
            success: true,
            message: `Successfully allocated ${creditAmount} credits to ${toUser.username}.`,
            transaction: {
                id: transaction[0]._id,
                amount: creditAmount,
                toUser: {
                    id: toUser._id,
                    username: toUser.username,
                    role: toUser.role,
                    ratePerMsg: toUser.ratePerMsg,
                },
                balanceAfterFrom,
                balanceAfterTo,
            },
        });
    } catch (error) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        console.error("AllocateCredits error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}
// New: User requests credits (creates a pending transaction)
export async function requestCredits(req, res) {
  try {
    const { amount, note } = req.body;
    const creditAmount = Number(amount);
    if (isNaN(creditAmount) || creditAmount <= 0) {
      return res.status(400).json({ message: "Invalid credit amount.", success: false });
    }
    // Create a pending request transaction
    const transaction = await transactionModel.create([
      {
        fromUser: null,
        toUser: req.user._id,
        amount: creditAmount,
        type: "REQUEST",
        notes: note || "",
        performedBy: req.user._id,
      },
    ]);
    return res.status(200).json({
      success: true,
      message: `Credit request of ${creditAmount} submitted.`,
      transaction: transaction[0],
    });
  } catch (error) {
    console.error("RequestCredits error:", error);
    return res.status(500).json({ message: "Internal server error", success: false });
  }
}

/**
 * POST /api/credits/reclaim
 * -------------------------
 * Reclaim credits back from a target user's wallet.
 * - Super Admin can reclaim from Resellers or Users.
 * - Reseller can only reclaim from their own Users (credits return to Reseller wallet).
 *
 * Body: { fromUserId, amount, notes? }
 */
export async function reclaimCredits(req, res) {
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction();

    try {
        const { fromUserId, amount, notes } = req.body;

        if (!fromUserId) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: "fromUserId is required.",
                success: false,
            });
        }

        const reclaimAmount = Number(amount);
        if (isNaN(reclaimAmount) || reclaimAmount <= 0) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: "amount must be a positive number.",
                success: false,
            });
        }

        const fromUser = await userModel
            .findById(fromUserId)
            .session(mongoSession);

        if (!fromUser) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(404).json({
                message: "User to reclaim credits from not found.",
                success: false,
            });
        }

        // Permission check: Super Admin can reclaim from anyone; Reseller can only reclaim from their own Users
        if (req.user.role !== "Super Admin" && req.user.role !== "Reseller") {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(403).json({
                message: "Forbidden: Only Super Admin or Reseller can reclaim credits.",
                success: false,
            });
        }

        // Reseller can only reclaim from Users assigned to them
        if (req.user.role === "Reseller") {
            if (fromUser.role !== "User" || String(fromUser.resellerId) !== String(req.user._id)) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(403).json({
                    message: "Forbidden: You can only reclaim credits from your own client users.",
                    success: false,
                });
            }
        }

        if (fromUser.role === "Super Admin") {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: "Cannot reclaim credits from a Super Admin.",
                success: false,
            });
        }

        // Check target user's wallet
        const fromWallet = await walletModel
            .findOne({ userId: fromUserId })
            .session(mongoSession);

        if (!fromWallet || fromWallet.balance < reclaimAmount) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: `Insufficient balance to reclaim. Target balance: ${fromWallet ? fromWallet.balance : 0}, requested: ${reclaimAmount}.`,
                success: false,
                currentBalance: fromWallet ? fromWallet.balance : 0,
            });
        }

        // Deduct from target user's wallet
        fromWallet.balance -= reclaimAmount;
        await fromWallet.save({ session: mongoSession });
        const balanceAfterFrom = fromWallet.balance;

        // If caller is Reseller, refund credits back to Reseller wallet
        let balanceAfterTo = null;
        if (req.user.role === "Reseller") {
            let resellerWallet = await walletModel
                .findOne({ userId: req.user._id })
                .session(mongoSession);

            if (!resellerWallet) {
                const created = await walletModel.create(
                    [
                        {
                            userId: req.user._id,
                            balance: 0,
                            resellerId: null,
                        },
                    ],
                    { session: mongoSession }
                );
                resellerWallet = created[0];
            }

            resellerWallet.balance += reclaimAmount;
            await resellerWallet.save({ session: mongoSession });
            balanceAfterTo = resellerWallet.balance;
        }

        // Audit log
        const transaction = await transactionModel.create(
            [
                {
                    fromUser: fromUserId,
                    toUser: req.user._id,
                    amount: reclaimAmount,
                    type: "RECLAIM",
                    notes:
                        notes ||
                        `Reclaimed ${reclaimAmount} credits from ${fromUser.username}`,
                    rateSnapshot: fromUser.ratePerMsg || null,
                    balanceAfterFrom,
                    balanceAfterTo,
                    performedBy: req.user._id,
                },
            ],
            { session: mongoSession }
        );

        await mongoSession.commitTransaction();
        mongoSession.endSession();

        return res.status(200).json({
            success: true,
            message: `Successfully reclaimed ${reclaimAmount} credits from ${fromUser.username}.`,
            transaction: {
                id: transaction[0]._id,
                amount: reclaimAmount,
                fromUser: {
                    id: fromUser._id,
                    username: fromUser.username,
                    role: fromUser.role,
                },
                balanceAfterFrom,
                balanceAfterTo,
            },
        });
    } catch (error) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        console.error("ReclaimCredits error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}

/**
 * POST /api/credits/deduct
 * ------------------------
 * Deduct credits from a user's wallet (e.g., when a message is sent).
 * Typically called by the system/backend, but accessible to Super Admin / Reseller.
 *
 * Body: { userId, messageCount?, notes? }
 * Deduction = user.ratePerMsg × messageCount (default 1)
 */
export async function deductCredits(req, res) {
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction();

    try {
        const { userId: bodyUserId, messageCount, amount, notes } = req.body;
        const userId = bodyUserId || req.user._id;

        // Ensure at least one of amount or messageCount is supplied
        if ((amount === undefined || amount === null || amount === "") && (messageCount === undefined || messageCount === null || messageCount === "")) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({ message: "Provide either 'amount' or 'messageCount'.", success: false });
        }

        if (!userId) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: "userId is required.",
                success: false,
            });
        }

        const targetUser = await userModel
            .findById(userId)
            .session(mongoSession);
        if (!targetUser) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(404).json({
                message: "User not found.",
                success: false,
            });
        }

        let deductionAmount;
        let count = null;
        if (amount !== undefined && amount !== null && amount !== "") {
            const amt = Number(amount);
            if (isNaN(amt) || amt <= 0) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({
                    message: "amount must be a positive number.",
                    success: false,
                });
            }
            deductionAmount = amt;
        } else {
            count = Number(messageCount ?? 1);
            if (isNaN(count) || count <= 0) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({
                    message: "messageCount must be a positive number.",
                    success: false,
                });
            }

            if (!targetUser.ratePerMsg || targetUser.ratePerMsg <= 0) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({
                    message:
                        "User does not have a valid rate per message configured.",
                    success: false,
                });
            }

            deductionAmount = targetUser.ratePerMsg * count;
        }

        // Permission check: Reseller can only deduct from their own users
        if (req.user.role === "Reseller") {
            if (String(targetUser.resellerId) !== String(req.user._id)) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(403).json({
                    message:
                        "Resellers can only deduct credits from their own users.",
                    success: false,
                });
            }
        } else if (req.user.role === "User") {
            // Users can only deduct from themselves (for sending messages)
            if (String(userId) !== String(req.user._id)) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(403).json({
                    message: "Users can only deduct from their own account.",
                    success: false,
                });
            }
        }

        // ATOMIC ISOLATION GUARD: Deduct only if balance >= deductionAmount
        const wallet = await walletModel.findOneAndUpdate(
            {
                userId,
                balance: { $gte: deductionAmount },
            },
            {
                $inc: { balance: -deductionAmount },
            },
            {
                new: true,
                session: mongoSession,
            }
        );

        if (!wallet) {
            const currentWallet = await walletModel.findOne({ userId }).session(mongoSession);
            const available = currentWallet ? currentWallet.balance : 0;
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: `Insufficient credits or concurrent deduction in progress. Required: ${deductionAmount}, Available: ${available}.`,
                success: false,
                required: deductionAmount,
                available,
            });
        }

        // Audit log
        await transactionModel.create(
            [
                {
                    fromUser: userId,
                    toUser: userId,
                    amount: deductionAmount,
                    type: "DEDUCT",
                    notes:
                        notes ||
                        (amount !== undefined && amount !== null ? `Deducted ${deductionAmount} credits` : `Deducted for ${count} message(s) at rate ${targetUser.ratePerMsg}/msg`),
                    rateSnapshot: targetUser.ratePerMsg,
                    balanceAfterFrom: wallet.balance,
                    balanceAfterTo: wallet.balance,
                    performedBy: req.user._id,
                },
            ],
            { session: mongoSession }
        );

        await mongoSession.commitTransaction();
        mongoSession.endSession();

        return res.status(200).json({
            success: true,
            message: `Deducted ${deductionAmount} credits${amount !== undefined && amount !== null ? '' : ` for ${count} message(s)`}.`,
            deduction: {
                amount: deductionAmount,
                // If amount directly supplied, messageCount is not applicable
                messageCount: amount !== undefined && amount !== null ? null : count,
                ratePerMsg: targetUser.ratePerMsg,
                remainingBalance: wallet.balance,
                messagesRemaining: Math.floor(wallet.balance / targetUser.ratePerMsg),
            },
        });
    } catch (error) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        console.error("DeductCredits error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}

/**
 * GET /api/credits/transactions
 * -----------------------------
 * Returns the audit log of credit transfers.
 *
 * Query params:
 *   - type: ALLOCATE | DEDUCT | REFUND (filter by type)
 *   - userId: filter transactions involving a specific user
 *   - page: pagination (default 1)
 *   - limit: results per page (default 20, max 100)
 */
export async function getTransactions(req, res) {
    try {
        const {
            type,
            userId,
            page = 1,
            limit = 20,
        } = req.query;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.min(100, Math.max(1, Number(limit)));

        // Build filter
        const filter = {};

        // Type filter
        if (type && ["ALLOCATE", "DEDUCT", "REFUND", "RECLAIM"].includes(type)) {
            filter.type = type;
        }

        // Role-based visibility
        if (req.user.role === "User") {
            // Users can only see their own transactions
            filter.$or = [
                { fromUser: req.user._id },
                { toUser: req.user._id },
            ];
        } else if (req.user.role === "Reseller") {
            if (userId) {
                // Reseller querying a specific user — must be their own
                const targetUser = await userModel.findById(userId);
                if (
                    !targetUser ||
                    (String(targetUser.resellerId) !== String(req.user._id) &&
                        String(userId) !== String(req.user._id))
                ) {
                    return res.status(403).json({
                        message:
                            "Resellers can only view transactions of their own users.",
                        success: false,
                    });
                }
                filter.$or = [{ fromUser: userId }, { toUser: userId }];
            } else {
                // Reseller sees all transactions involving themselves or their users
                const resellerUsers = await userModel
                    .find({ resellerId: req.user._id })
                    .select("_id");
                const userIds = resellerUsers.map((u) => u._id);
                userIds.push(req.user._id);

                filter.$or = [
                    { fromUser: { $in: userIds } },
                    { toUser: { $in: userIds } },
                ];
            }
        } else if (req.user.role === "Super Admin") {
            // Super Admin sees everything, optionally filtered by userId
            if (userId) {
                filter.$or = [{ fromUser: userId }, { toUser: userId }];
            }
        }

        const total = await transactionModel.countDocuments(filter);

        const transactions = await transactionModel
            .find(filter)
            .populate("fromUser", "username email role")
            .populate("toUser", "username email role ratePerMsg")
            .populate("performedBy", "username email role")
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum);

        return res.status(200).json({
            success: true,
            transactions,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("GetTransactions error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}

/**
 * PATCH /api/credits/rate
 * -----------------------
 * Update a user's rate per message.
 * Only Super Admin can set Reseller rates.
 * Super Admin / Reseller can set User rates (reseller only for their own users).
 *
 * Body: { userId, ratePerMsg }
 */
export async function updateRate(req, res) {
    try {
        const { userId, ratePerMsg } = req.body;

        if (!userId || ratePerMsg === undefined || ratePerMsg === null) {
            return res.status(400).json({
                message: "userId and ratePerMsg are required.",
                success: false,
            });
        }

        const rate = Number(ratePerMsg);
        if (isNaN(rate) || rate < 0) {
            return res.status(400).json({
                message: "ratePerMsg must be a non-negative number.",
                success: false,
            });
        }

        const targetUser = await userModel.findById(userId);
        if (!targetUser) {
            return res.status(404).json({
                message: "User not found.",
                success: false,
            });
        }

        // Permission checks
        if (req.user.role === "User") {
            return res.status(403).json({
                message: "Users cannot change message rates.",
                success: false,
            });
        }

        if (req.user.role === "Reseller") {
            if (targetUser.role !== "User") {
                return res.status(403).json({
                    message: "Resellers can only set rates for Users.",
                    success: false,
                });
            }
            if (String(targetUser.resellerId) !== String(req.user._id)) {
                return res.status(403).json({
                    message:
                        "Resellers can only set rates for their own users.",
                    success: false,
                });
            }
        }

        const previousRate = targetUser.ratePerMsg;
        targetUser.ratePerMsg = rate;
        await targetUser.save();

        return res.status(200).json({
            success: true,
            message: `Rate <upd></upd>ated for ${targetUser.username}: ${previousRate} → ${rate} per message.`,
            user: {
                id: targetUser._id,
                username: targetUser.username,
                role: targetUser.role,
                ratePerMsg: targetUser.ratePerMsg,
                previousRate,
            },
        });
    } catch (error) {
        console.error("UpdateRate error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}


/**
 * GET /api/credits/reconcile
 * --------------------------
 * Reconciles the user's wallet balance against the immutable ledger.
 * Invariant: Wallet Balance === Total Inflows - Total Outflows.
 * Super Admin can pass ?userId=xxx to audit any user.
 */
export async function reconcileCreditBalance(req, res) {
    try {
        let targetUserId = req.user._id;

        if (req.query.userId) {
            if (req.user.role !== "Super Admin") {
                return res.status(403).json({
                    message: "Only Super Admin can audit other accounts.",
                    success: false,
                });
            }
            targetUserId = req.query.userId;
        }

        const report = await verifyReconcile(targetUserId);

        return res.status(200).json({
            success: true,
            report,
        });
    } catch (error) {
        console.error("Reconcile balance error:", error);
        return res.status(500).json({
            message: error.message || "Failed to reconcile balance",
            success: false,
        });
    }
}

/**
 * POST /api/credits/update-expiry
 * ------------------------------
 * Super Admin can update the expiry date or lock status of any wallet.
 * Body: { userId, expiresAt, expiryYears, isLocked }
 */
export async function updateCreditExpiry(req, res) {
    try {
        const { userId, expiresAt, expiryYears, isLocked } = req.body;
        if (!userId) {
            return res.status(400).json({ message: "userId is required", success: false });
        }

        let targetExpiresAt = undefined;
        if (expiresAt !== undefined) {
            targetExpiresAt = expiresAt ? new Date(expiresAt) : null;
        } else if (expiryYears != null && Number(expiryYears) > 0) {
            targetExpiresAt = new Date(Date.now() + Number(expiryYears) * 365.25 * 24 * 60 * 60 * 1000);
        } else if (expiryYears === 0 || expiryYears === "0") {
            targetExpiresAt = null;
        }

        const updateData = {};
        if (targetExpiresAt !== undefined) updateData.expiresAt = targetExpiresAt;
        if (isLocked !== undefined) updateData.isLocked = Boolean(isLocked);

        const wallet = await walletModel.findOneAndUpdate(
            { userId },
            { $set: updateData },
            { new: true, upsert: true }
        );

        notifyUser(userId.toString(), "WALLET_UPDATED", {
            reason: "EXPIRY_UPDATED",
            expiresAt: wallet.expiresAt,
            isLocked: wallet.isLocked,
        });

        return res.status(200).json({
            success: true,
            message: "Credit expiry updated successfully",
            wallet,
        });
    } catch (err) {
        console.error("Update credit expiry error:", err);
        return res.status(500).json({ message: "Failed to update credit expiry", success: false });
    }
}

export default {
    getBalance,
    allocateCredits,
    deductCredits,
    getTransactions,
    updateRate,
    reconcileCreditBalance,
    updateCreditExpiry,
};
