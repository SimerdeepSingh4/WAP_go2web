import { postCreditMovement } from "../services/credit-posting.service.js";
import { notifyUser, notifyRole } from "../services/socket.service.js";
import { reconcileWallet as verifyReconcile } from "../helpers/credit.helper.js";
import mongoose from "mongoose";
import walletModel from "../models/wallet.model.js";
import transactionModel from "../models/transaction.model.js";
import userModel from "../models/user.model.js";
import { creditAmount as normalizeCreditAmount, creditsForCount, creditTransactionOptions } from "../helpers/credit-amount.js";
import { startCreditSession, saveCreditReceipt, creditPostingKey, creditErrorDetails, abortCreditSession } from "../helpers/credit-operation.js";
import { transactionObjectId } from "../helpers/transaction-reference.js";
import { publicAccountIdentity } from "../helpers/account-identity.js";
import { recordSupportAction, publishSupportAction } from "../helpers/support-action.js";
import { processNotificationWork } from "../workers/notification.worker.js";
import { LEGACY_CREDITS, CREDIT_CATEGORIES, categoryBalances, isCreditQuantity } from "../helpers/credit-categories.js";

/**
 * GET /api/credits/balance
 * ------------------------
 * Returns the current user's wallet balance and rate per recipient.
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

        const isLocked = Boolean(wallet.isLocked);
        const catBalances = categoryBalances(wallet);

        const totalTransactions = await transactionModel.countDocuments({
            $or: [{ fromUser: targetUserId }, { toUser: targetUserId }],
            type: { $ne: "REQUEST" },
        });

        return res.status(200).json({
            success: true,
            wallet: {
                userId: wallet.userId,
                balance: wallet.balance,
                creditBalances: catBalances,
                resellerId: wallet.resellerId,
                ratePerMsg: targetUser.ratePerMsg,
                isLocked,
                messagesRemaining: isLocked
                    ? 0
                    : (targetUser.ratePerMsg > 0
                        ? Math.floor(wallet.balance / targetUser.ratePerMsg)
                        : 0),
                campaignCreditsRemaining: isLocked ? 0 : catBalances.CAMPAIGN.available,
                totalTransactions,
            },
        });
    } catch (error) {
        console.error("GetBalance error:", error);
        return res.status(error.statusCode || (error.code === 11000 || error.hasErrorLabel?.("TransientTransactionError") ? 409 : 500)).json({
            message: error.statusCode ? error.message : error.code === 11000 || error.hasErrorLabel?.("TransientTransactionError") ? "A concurrent credit operation is being processed. Retry using the same request reference." : "Internal server error",
            ...creditErrorDetails(error, req),
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
    const mongoSession = await startCreditSession(req);
    mongoSession.startTransaction(creditTransactionOptions);

    try {
        const { toUserId, amount, notes, password, category } = req.body;
        const isCategorized = Boolean(category && CREDIT_CATEGORIES.includes(category));

        if ((category || req.body.supportConversationId) && !isCategorized) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(400).json({ message: "Choose a credit category.", success: false });
        }

        // ── Validation ──────────────────────────────────────────
        if (!toUserId || !amount) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(400).json({
                message: "toUserId and amount are required.",
                success: false,
            });
        }

        const rawAmountStr = String(amount).trim();
        if (rawAmountStr.includes(".") || !Number.isInteger(Number(amount)) || Number(amount) <= 0) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(400).json({
                message: "Credit quantity cannot have decimal values. Enter a positive whole number.",
                success: false,
            });
        }

        const creditAmount = normalizeCreditAmount(amount);
        if (isNaN(creditAmount) || creditAmount <= 0 || !isCreditQuantity(creditAmount)) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(400).json({
                message: "Credit quantity must be a positive whole number.",
                success: false,
            });
        }

        // Verify password if provided (for double-confirmation security)
        if (password) {
            const caller = await userModel.findById(req.user._id).select("+password");
            if (!caller || !(await caller.comparePassword(password))) {
                await abortCreditSession(mongoSession);
                await mongoSession.endSession();
                return res.status(401).json({
                    message: "Incorrect password. Credit transfer aborted for security.",
                    success: false,
                });
            }
        }

        if (req.user.role === "User") {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
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
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
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
                await abortCreditSession(mongoSession);
                await mongoSession.endSession();
                return res.status(400).json({
                    message: "Cannot allocate credits to another Super Admin.",
                    success: false,
                });
            }
        } else if (req.user.role === "Reseller") {
            // Reseller can ONLY allocate to their own Users
            if (toUser.role !== "User") {
                await abortCreditSession(mongoSession);
                await mongoSession.endSession();
                return res.status(403).json({
                    message: "Resellers can only allocate credits to Users.",
                    success: false,
                });
            }

            if (String(toUser.resellerId) !== String(req.user._id)) {
                await abortCreditSession(mongoSession);
                await mongoSession.endSession();
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
                await abortCreditSession(mongoSession);
                await mongoSession.endSession();
                return res.status(400).json({
                    message: "Reseller wallet not found. Cannot allocate credits.",
                    success: false,
                });
            }

            if (fromWallet.isLocked) {
                await abortCreditSession(mongoSession);
                await mongoSession.endSession();
                return res.status(403).json({
                    message: "Your wallet is locked. Cannot allocate credits.",
                    success: false,
                    isLocked: true,
                });
            }

            if (isCategorized) {
                const available = fromWallet.creditBalances?.[category]?.available ?? 0;
                if (available < creditAmount) {
                    await abortCreditSession(mongoSession);
                    await mongoSession.endSession();
                    return res.status(400).json({
                        message: `Insufficient ${category} credit balance. Your balance: ${available}, requested: ${creditAmount}.`,
                        success: false,
                        currentBalance: available,
                    });
                }
            } else if (fromWallet.balance < creditAmount) {
                await abortCreditSession(mongoSession);
                await mongoSession.endSession();
                return res.status(400).json({
                    message: `Insufficient balance. Your balance: ${fromWallet.balance}, requested: ${creditAmount}.`,
                    success: false,
                    currentBalance: fromWallet.balance,
                });
            }

        }

        const posting = await postCreditMovement({
            session: mongoSession,
            operationKey: creditPostingKey(req, "allocation"),
            type: "ALLOCATE",
            amount: creditAmount,
            fromUser: req.user.role === "Super Admin" ? null : req.user._id,
            toUser: toUserId,
            performedBy: req.user._id,
            notes: notes || "",
            ...(isCategorized ? { category } : { rateSnapshot: toUser.ratePerMsg || null, toWalletSet: { isLocked: false } }),
        });
        balanceAfterFrom = isCategorized
            ? (posting.fromWallet?.creditBalances?.[category]?.available ?? null)
            : (posting.fromWallet?.balance ?? null);
        const balanceAfterTo = isCategorized
            ? (posting.toWallet?.creditBalances?.[category]?.available ?? null)
            : posting.toWallet.balance;
        const transaction = [posting.transaction];

        await recordSupportAction(req, mongoSession, toUserId, `Allocated ${creditAmount} ${isCategorized ? `${category} ` : ""}credits. New balance: ${balanceAfterTo} credits.\nTransaction ID: ${transaction[0].transactionId}`, transaction[0]._id);
        await saveCreditReceipt(req, mongoSession, 200, { success: true, message: "Credit allocation processed.", transaction: { id: transaction[0]._id, transactionId: transaction[0].transactionId, amount: creditAmount, category: isCategorized ? category : undefined, toUser: { id: toUser._id, username: toUser.username, role: toUser.role }, balanceAfterFrom, balanceAfterTo } });
        await mongoSession.commitTransaction();
        await mongoSession.endSession();

        await publishSupportAction(req);
        void processNotificationWork();

        // ── Real-Time WebSockets (POST-COMMIT) ────────────────────
        if (balanceAfterFrom !== null) {
            notifyUser(req.user._id, "WALLET_UPDATED", {
                category: isCategorized ? category : undefined,
                newBalance: balanceAfterFrom,
                delta: -creditAmount,
                reason: "ALLOCATE",
                transactionId: transaction[0]._id,
                toUser: toUser.username,
            });
        }
        if (req.user.role === "Super Admin") {
            notifyRole("Super Admin", "WALLET_UPDATED", {
                category: isCategorized ? category : undefined,
                reason: "ALLOCATE",
                transactionId: transaction[0]._id,
                toUser: toUser.username,
                amount: creditAmount,
            });
        }
        notifyUser(toUserId, "WALLET_UPDATED", {
            category: isCategorized ? category : undefined,
            newBalance: balanceAfterTo,
            delta: +creditAmount,
            reason: "ALLOCATE",
                transactionId: transaction[0]._id,
            fromUser: req.user.username,
        });

        return res.status(200).json({
            success: true,
            message: `Successfully allocated ${creditAmount} ${isCategorized ? `${category} ` : ""}credits to ${toUser.username}.`,
            transaction: {
                id: transaction[0]._id, transactionId: transaction[0].transactionId,
                amount: creditAmount,
                category: isCategorized ? category : undefined,
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
        await abortCreditSession(mongoSession);
        await mongoSession.endSession();
        console.error("AllocateCredits error:", error);
        return res.status(error.statusCode || (error.code === 11000 || error.hasErrorLabel?.("TransientTransactionError") ? 409 : 500)).json({
            message: error.statusCode ? error.message : error.code === 11000 || error.hasErrorLabel?.("TransientTransactionError") ? "A concurrent credit operation is being processed. Retry using the same request reference." : "Internal server error",
            ...creditErrorDetails(error, req),
            success: false,
        });
    }
}
// New: User requests credits (creates a pending transaction)
export async function requestCredits(req, res) {
  let session;
  try {
    if (!["User", "Reseller"].includes(req.user.role)) return res.status(403).json({ success: false, message: "Only users and resellers can request credits." });
    const { category } = req.body;
    const isCategorized = Boolean(category && CREDIT_CATEGORIES.includes(category));
    if ((category || req.body.supportConversationId) && !isCategorized) {
      return res.status(400).json({ success: false, message: "Choose a credit category." });
    }
    const rawReqStr = String(req.body.amount).trim();
    if (rawReqStr.includes(".") || !Number.isInteger(Number(req.body.amount)) || Number(req.body.amount) <= 0) {
      return res.status(400).json({ success: false, message: "Credit quantity cannot have decimal values. Enter a positive whole number." });
    }
    const amount = normalizeCreditAmount(req.body.amount);
    if (amount <= 0 || !isCreditQuantity(amount)) {
      return res.status(400).json({ success: false, message: "Credit quantity must be a positive whole number." });
    }
    const note = req.body.note ?? "";
    if (typeof note !== "string" || note.length > 500) return res.status(400).json({ success: false, message: "The note must be 500 characters or fewer." });
    let recipient = null;
    if (req.user.role === "User" && req.user.createdBy) {
      const creator = await userModel.findById(req.user.createdBy).select("role username");
      if (creator?.role === "Reseller") {
        if (String(req.user.resellerId) !== String(creator._id)) return res.status(409).json({ success: false, message: "Your account manager has changed. Contact the administrator before requesting credits." });
        recipient = creator;
      }
    }
    session = await startCreditSession(req);
    const response = await session.withTransaction(async () => {
      const [transaction] = await transactionModel.create([{
        fromUser: null, toUser: req.user._id, amount, type: "REQUEST",
        ...(isCategorized ? { category } : {}),
        notes: note.trim(), performedBy: req.user._id, requestedFrom: recipient?._id || null,
      }], { session });
      await recordSupportAction(req, session, req.user._id, `Requested ${amount} ${isCategorized ? `${category} ` : ""}credits.${note.trim() ? `\n${note.trim()}` : ""}\nTransaction ID: ${transaction.transactionId}`, transaction._id);
      const result = { success: true, message: recipient ? "Credit request sent to your reseller." : "Credit request sent to the super admin.", transaction };
      await saveCreditReceipt(req, session, 201, result);
      return result;
    }, creditTransactionOptions);
    await publishSupportAction(req);
    notifyUser(req.user._id, "WALLET_UPDATED", { reason: "REQUEST", transactionId: response.transaction._id, amount, category: isCategorized ? category : undefined });
    if (recipient?._id) {
      notifyUser(recipient._id, "WALLET_UPDATED", { reason: "CREDIT_REQUEST_RECEIVED", transactionId: response.transaction._id, fromUser: req.user.username, amount, category: isCategorized ? category : undefined });
    } else {
      notifyRole("Super Admin", "WALLET_UPDATED", { reason: "CREDIT_REQUEST_RECEIVED", transactionId: response.transaction._id, fromUser: req.user.username, amount, category: isCategorized ? category : undefined });
    }
    return res.status(201).json(response);
  } catch (error) {
    console.error("RequestCredits error:", error);
    return res.status(error.statusCode || (error.code === 11000 ? 409 : 500)).json({ success: false, message: error.statusCode ? error.message : error.code === 11000 ? "This request is already being processed. Retry using the same request reference." : "Could not submit the credit request. Please retry." });
  } finally { if (session) await session.endSession(); }
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
    const mongoSession = await startCreditSession(req);
    mongoSession.startTransaction(creditTransactionOptions);

    try {
        const { fromUserId, amount, notes, category } = req.body;
        const isCategorized = Boolean(category && CREDIT_CATEGORIES.includes(category));
        if ((category || req.body.supportConversationId) && !isCategorized) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(400).json({
                message: "Choose a credit category.",
                success: false,
            });
        }

        if (!fromUserId) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(400).json({
                message: "fromUserId is required.",
                success: false,
            });
        }

        const rawReclaimStr = String(amount).trim();
        if (rawReclaimStr.includes(".") || !Number.isInteger(Number(amount)) || Number(amount) <= 0) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(400).json({
                message: "Credit quantity cannot have decimal values. Enter a positive whole number.",
                success: false,
            });
        }

        const reclaimAmount = normalizeCreditAmount(amount);
        if (isNaN(reclaimAmount) || reclaimAmount <= 0 || !isCreditQuantity(reclaimAmount)) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(400).json({
                message: "Credit quantity must be a positive whole number.",
                success: false,
            });
        }

        const fromUser = await userModel
            .findById(fromUserId)
            .session(mongoSession);

        if (!fromUser) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(404).json({
                message: "User to reclaim credits from not found.",
                success: false,
            });
        }

        // Permission check: Super Admin can reclaim from anyone; Reseller can only reclaim from their own Users
        if (req.user.role !== "Super Admin" && req.user.role !== "Reseller") {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(403).json({
                message: "Forbidden: Only Super Admin or Reseller can reclaim credits.",
                success: false,
            });
        }

        // Reseller can only reclaim from Users assigned to them with a mandatory reason, and must be authorized by Super Admin
        if (req.user.role === "Reseller") {
            if (req.user.featureAccess?.reclaimCredit !== true) {
                await abortCreditSession(mongoSession);
                await mongoSession.endSession();
                return res.status(403).json({
                    message: "Forbidden: You are not authorized by Super Admin to reclaim credits.",
                    success: false,
                });
            }
            if (!notes || !notes.trim()) {
                await abortCreditSession(mongoSession);
                await mongoSession.endSession();
                return res.status(400).json({
                    message: "A reason is mandatory when reclaiming credits.",
                    success: false,
                });
            }
            if (fromUser.role !== "User" || String(fromUser.resellerId) !== String(req.user._id)) {
                await abortCreditSession(mongoSession);
                await mongoSession.endSession();
                return res.status(403).json({
                    message: "Forbidden: You can only reclaim credits from your own client users.",
                    success: false,
                });
            }
        }

        if (fromUser.role === "Super Admin") {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(400).json({
                message: "Cannot reclaim credits from a Super Admin.",
                success: false,
            });
        }

        // Check target user's wallet
        const fromWallet = await walletModel
            .findOne({ userId: fromUserId })
            .session(mongoSession);

        if (!fromWallet) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(400).json({
                message: "Target user wallet not found.",
                success: false,
            });
        }

        if (isCategorized) {
            const available = fromWallet.creditBalances?.[category]?.available ?? 0;
            if (available < reclaimAmount) {
                await abortCreditSession(mongoSession);
                await mongoSession.endSession();
                return res.status(400).json({
                    message: `Insufficient ${category} balance to reclaim. Target balance: ${available}, requested: ${reclaimAmount}.`,
                    success: false,
                    currentBalance: available,
                });
            }
        } else if (fromWallet.balance < reclaimAmount) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(400).json({
                message: `Insufficient balance to reclaim. Target balance: ${fromWallet ? fromWallet.balance : 0}, requested: ${reclaimAmount}.`,
                success: false,
                currentBalance: fromWallet ? fromWallet.balance : 0,
            });
        }

        const posting = await postCreditMovement({
            session: mongoSession,
            operationKey: creditPostingKey(req, "reclaim"),
            type: "RECLAIM",
            amount: reclaimAmount,
            fromUser: fromUserId,
            toUser: req.user._id,
            performedBy: req.user._id,
            notes: notes || `Reclaimed ${reclaimAmount} ${isCategorized ? `${category} ` : ""}credits from ${fromUser.username}`,
            ...(isCategorized ? { category } : { rateSnapshot: fromUser.ratePerMsg || null }),
        });
        const balanceAfterFrom = isCategorized
            ? (posting.fromWallet?.creditBalances?.[category]?.available ?? null)
            : posting.fromWallet.balance;
        const balanceAfterTo = isCategorized
            ? (posting.toWallet?.creditBalances?.[category]?.available ?? null)
            : (posting.toWallet?.balance ?? null);
        const transaction = [posting.transaction];

        await recordSupportAction(req, mongoSession, fromUserId, `Reclaimed ${reclaimAmount} ${isCategorized ? `${category} ` : ""}credits from ${fromUser.username}.\nTransaction ID: ${transaction[0].transactionId}`, transaction[0]._id);
        await saveCreditReceipt(req, mongoSession, 200, {
            success: true,
            message: "Credit reclaim processed.",
            transaction: {
                id: transaction[0]._id,
                transactionId: transaction[0].transactionId,
                amount: reclaimAmount,
                category: isCategorized ? category : undefined,
                fromUser: { id: fromUser._id, username: fromUser.username, role: fromUser.role },
                balanceAfterFrom,
                balanceAfterTo,
            },
        });
        await mongoSession.commitTransaction();
        await mongoSession.endSession();

        await publishSupportAction(req);
        void processNotificationWork();

        // ── Real-Time WebSockets (POST-COMMIT) ────────────────────
        if (balanceAfterFrom !== null) {
            notifyUser(fromUserId, "WALLET_UPDATED", {
                category: isCategorized ? category : undefined,
                newBalance: balanceAfterFrom,
                delta: -reclaimAmount,
                reason: "RECLAIM",
                transactionId: transaction[0]._id,
                byUser: req.user.username,
            });
        }
        if (balanceAfterTo !== null) {
            notifyUser(req.user._id, "WALLET_UPDATED", {
                category: isCategorized ? category : undefined,
                newBalance: balanceAfterTo,
                delta: +reclaimAmount,
                reason: "RECLAIM",
                transactionId: transaction[0]._id,
                fromUser: fromUser.username,
            });
        }
        if (req.user.role === "Super Admin") {
            notifyRole("Super Admin", "WALLET_UPDATED", {
                category: isCategorized ? category : undefined,
                reason: "RECLAIM",
                transactionId: transaction[0]._id,
                fromUser: fromUser.username,
                amount: reclaimAmount,
            });
        }

        return res.status(200).json({
            success: true,
            message: `Successfully reclaimed ${reclaimAmount} ${isCategorized ? `${category} ` : ""}credits from ${fromUser.username}.`,
            transaction: {
                id: transaction[0]._id,
                transactionId: transaction[0].transactionId,
                amount: reclaimAmount,
                category: isCategorized ? category : undefined,
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
        await abortCreditSession(mongoSession);
        await mongoSession.endSession();
        console.error("ReclaimCredits error:", error);
        return res.status(error.statusCode || (error.code === 11000 || error.hasErrorLabel?.("TransientTransactionError") ? 409 : 500)).json({
            message: error.statusCode ? error.message : error.code === 11000 || error.hasErrorLabel?.("TransientTransactionError") ? "A concurrent credit operation is being processed. Retry using the same request reference." : "Internal server error",
            ...creditErrorDetails(error, req),
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
            category,
        } = req.query;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.min(100, Math.max(1, Number(limit)));

        // Build filter
        const filter = {};
        if (category === "legacy") {
            filter.category = null;
        } else if (category && category !== "all") {
            if (!CREDIT_CATEGORIES.includes(category)) {
                return res.status(400).json({ success: false, message: "Invalid credit category filter." });
            }
            filter.category = category;
        }

        if (req.query.transactionId) {
            const id = transactionObjectId(req.query.transactionId);
            if (!id) return res.status(400).json({ success: false, message: "Invalid transaction reference." });
            filter._id = id;
        }

        // Type filter
        if (type && ["ALLOCATE", "DEDUCT", "REFUND", "RECLAIM", "REQUEST", "RESERVE", "RELEASE"].includes(type)) {
            filter.type = type;
        }

        // Account filters may narrow the authenticated scope, never widen it.
        const ownId = req.user._id;
        if (userId && !mongoose.isValidObjectId(userId)) return res.status(400).json({ success: false, message: "Invalid account filter." });
        const scopeFilter = {};
        if (req.user.role === "User") {
            if (userId && String(userId) !== String(ownId)) return res.status(403).json({ success: false, message: "You can only view your own transactions." });
            filter.$or = [{ fromUser: ownId }, { toUser: ownId }];
            scopeFilter.$or = filter.$or;
        } else if (req.user.role === "Reseller") {
            const users = await userModel.find({ role: "User", resellerId: ownId, createdBy: ownId }).select("_id");
            const allowedIds = [ownId, ...users.map((user) => user._id)];
            if (userId && !allowedIds.some((id) => String(id) === String(userId))) return res.status(403).json({ success: false, message: "You can only view your own transactions and those of users you created." });
            const ids = userId ? [userId] : allowedIds;
            filter.$or = [{ fromUser: { $in: ids } }, { toUser: { $in: ids } }];
            scopeFilter.$or = filter.$or;
        } else if (req.user.role === "Super Admin") {
            const resellers = await userModel.find({ role: "Reseller" }).select("_id").lean();
            const resellerIds = resellers.map((r) => r._id);
            const resellerUserExclusion = {
                $nor: [
                    { type: "ALLOCATE", fromUser: { $in: resellerIds } },
                    { type: "RECLAIM", $or: [{ performedBy: { $in: resellerIds } }, { toUser: { $in: resellerIds } }] },
                    { type: "REQUEST", requestedFrom: { $in: resellerIds } },
                ],
            };
            if (userId) {
                filter.$and = [
                    { $or: [{ fromUser: userId }, { toUser: userId }] },
                    resellerUserExclusion,
                ];
                scopeFilter.$and = [
                    { $or: [{ fromUser: userId }, { toUser: userId }] },
                    resellerUserExclusion,
                ];
            } else {
                filter.$and = [resellerUserExclusion];
                scopeFilter.$and = [resellerUserExclusion];
            }
        } else {
            return res.status(403).json({ success: false, message: "You cannot access credit transactions." });
        }

        const total = await transactionModel.countDocuments(filter);
        const ledgerTotal = await transactionModel.countDocuments({
            ...(filter.category !== undefined ? { category: filter.category } : {}),
            ...scopeFilter,
            type: { $ne: "REQUEST" },
        });

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
            transactions: req.user.role === "Super Admin" ? transactions : transactions.map(transaction => {
                const view = transaction.toJSON();
                for (const field of ["fromUser", "toUser", "performedBy"]) {
                    view[field] = publicAccountIdentity(view[field], req.user.role);
                }
                return view;
            }),
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                ledgerTotal,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("GetTransactions error:", error);
        return res.status(error.statusCode || (error.code === 11000 || error.hasErrorLabel?.("TransientTransactionError") ? 409 : 500)).json({
            message: error.statusCode ? error.message : error.code === 11000 || error.hasErrorLabel?.("TransientTransactionError") ? "A concurrent credit operation is being processed. Retry using the same request reference." : "Internal server error",
            ...creditErrorDetails(error, req),
            success: false,
        });
    }
}

/**
 * PATCH /api/credits/rate
 * -----------------------
 * Update a user's rate per recipient.
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

        const rate = normalizeCreditAmount(ratePerMsg);
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
                message: "Users cannot change recipient rates.",
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
            message: `Rate updated for ${targetUser.username}: ${previousRate} → ${rate} credits per recipient.`,
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
        return res.status(error.statusCode || (error.code === 11000 || error.hasErrorLabel?.("TransientTransactionError") ? 409 : 500)).json({
            message: error.statusCode ? error.message : error.code === 11000 || error.hasErrorLabel?.("TransientTransactionError") ? "A concurrent credit operation is being processed. Retry using the same request reference." : "Internal server error",
            ...creditErrorDetails(error, req),
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

export default {
    getBalance,
    allocateCredits,
    getTransactions,
    updateRate,
    reconcileCreditBalance,
};
