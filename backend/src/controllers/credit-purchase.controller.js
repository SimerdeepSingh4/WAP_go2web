import fs from "fs";
import mongoose from "mongoose";
import CreditPurchase from "../models/credit-purchase.model.js";
import { queueRechargeAlerts } from "../services/recharge-whatsapp.service.js";
import userModel from "../models/user.model.js";
import walletModel from "../models/wallet.model.js";
import { CREDIT_CATEGORIES, isCreditQuantity } from "../helpers/credit-categories.js";
import { purchaseTotalPaisa } from "../helpers/credit-purchase-price.js";
import { resolveSellerForBuyer, getActivePurchaseRate } from "./credit-rate.controller.js";
import { savePaymentProofFile, getPaymentProofPath, removePaymentProofFile } from "../services/payment-proof.service.js";
import { postCreditMovement } from "../services/credit-posting.service.js";
import { startCreditSession, creditPostingKey, saveCreditReceipt, abortCreditSession, creditErrorDetails, runCreditTransaction } from "../helpers/credit-operation.js";
import { notifyUser } from "../services/socket.service.js";
import { recordSupportAction, publishSupportAction } from "../helpers/support-action.js";

import { expirePurchaseHold, notifyPurchaseStock, releasePurchaseHold } from "../services/credit-purchase-holds.service.js";
import { publicAccountIdentity } from "../helpers/account-identity.js";

function inrTotal(paisa) {
    const amount = String(paisa).padStart(3, "0");
    return amount.slice(0, -2) + "." + amount.slice(-2);
}

const reviewable = ["PENDING", "REVIEW_REQUIRED"];
const isParticipant = (purchase, id) => [purchase.buyerId, purchase.sellerId].some(account => String(account?._id || account) === String(id));
const purchaseError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const creditTransactionOptions = {
    readPreference: "primary",
    readConcern: { level: "majority" },
    writeConcern: { w: "majority" },
};

/**
 * POST /api/credits/purchases/quote
 * ---------------------------------
 * Calculate and save an immutable purchase quote.
 *
 * Body: { category, quantity }
 */
export async function createQuote(req, res) {
    let mongoSession = null;
    try {
        const buyer = req.user;

        if (buyer.role === "Super Admin") {
            return res.status(400).json({
                success: false,
                message: "Super Admin has an unlimited credit pool and does not purchase credits.",
            });
        }

        const { category, quantity: rawQuantity } = req.body;

        if (!category || !CREDIT_CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, message: "Valid credit category is required." });
        }

        const rawQtyStr = String(rawQuantity).trim();
        if (rawQtyStr.includes(".") || !Number.isInteger(Number(rawQuantity)) || !isCreditQuantity(Number(rawQuantity)) || Number(rawQuantity) <= 0) {
            return res.status(400).json({ success: false, message: "Credit quantity cannot have decimal values. Enter a positive whole number." });
        }
        const quantity = Number(rawQuantity);

        const seller = await resolveSellerForBuyer(buyer);
        if (!seller) {
            return res.status(400).json({ success: false, message: "Account manager not found." });
        }

        // Fetch active rate
        const rate = await getActivePurchaseRate(seller._id, buyer._id, category);
        if (!rate) {
            return res.status(400).json({
                success: false,
                message: "No purchase rate has been configured for this category by your account manager. Please request a rate.",
            });
        }

        const totalPaisa = purchaseTotalPaisa(quantity, rate.unitPriceInr);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours validity

        mongoSession = await startCreditSession(req);
        mongoSession.startTransaction(creditTransactionOptions);

        const [purchase] = await CreditPurchase.create([{
            sellerId: seller._id,
            buyerId: buyer._id,
            category,
            quantity,
            rateId: rate._id,
            unitPriceInr: rate.unitPriceInr,
            currency: "INR",
            totalPaisa,
            expiresAt,
            status: "QUOTED",
            reservationFree: true,
            paymentInstructions: seller.paymentInstructions?.toObject?.() || seller.paymentInstructions || {},
        }], { session: mongoSession });

        const result = {
            success: true,
            message: "Purchase quote generated successfully.",
            quote: {
                id: purchase._id,
                category: purchase.category,
                quantity: purchase.quantity,
                unitPriceInr: rate.unitPriceInr.toString(),
                totalPaisa: purchase.totalPaisa,
                totalInr: inrTotal(purchase.totalPaisa),
                currency: "INR",
                expiresAt: purchase.expiresAt,
                status: purchase.status,
                seller: buyer.role === "User" ? {
                    id: seller._id,
                    username: seller.role === "Super Admin" ? "Admin" : `Admin (${seller.username})`,
                    role: "Admin",
                } : {
                    id: seller._id,
                    username: seller.username,
                    role: seller.role,
                },
                paymentInstructions: seller.paymentInstructions || {},
            },
        };

        await saveCreditReceipt(req, mongoSession, 201, result);
        await mongoSession.commitTransaction();
        await mongoSession.endSession();
        mongoSession = null;

        return res.status(201).json(result);
    } catch (error) {
        if (mongoSession) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
        }
        console.error("CreateQuote error:", error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to create purchase quote",
            ...creditErrorDetails(error, req),
        });
    }
}

/**
 * POST /api/credits/purchases/:id/proof
 * -------------------------------------
 * Submit payment reference and upload screenshot proof.
 *
 * Multipart Body:
 *   - proof: File (image/pdf)
 *   - paymentReference: String (UTR / Transaction ID)
 */
function proofSubmission(purchase) {
    return {
        success: true,
        message: "Payment proof submitted. Your seller will review it.",
        purchase: {
            id: purchase._id, category: purchase.category, quantity: purchase.quantity,
            totalPaisa: purchase.totalPaisa, totalInr: inrTotal(purchase.totalPaisa),
            status: purchase.proofSubmissionStatus || "PENDING", paymentReference: purchase.paymentReference, hasProof: true,
        },
    };
}

export async function submitProof(req, res) {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid purchase quote ID." });
    const reference = typeof req.body?.paymentReference === "string" ? req.body.paymentReference.trim().toUpperCase() : "";
    let key;
    let keepFile = false;
    try {
        const order = await CreditPurchase.findById(id).select("+paymentProofKey");
        if (!order) throw purchaseError("Purchase quote not found.", 404);
        if (String(order.buyerId) !== String(req.user._id)) throw purchaseError("You can only submit proof for your own purchase.", 403);

        const replay = purchase => {
            if ((purchase.paymentReference || "") !== reference) throw purchaseError("This purchase already has a payment proof.", 409);
            return proofSubmission(purchase);
        };
        if (order.paymentProofKey) return res.json(replay(order));
        if (!["QUOTED", "EXPIRED"].includes(order.status)) throw purchaseError("This purchase is closed.", 409);
        if (!reference || reference.length > 160) throw purchaseError("Enter a payment reference of up to 160 characters.", 400);
        if (!req.file?.buffer) throw purchaseError("Attach a screenshot or PDF payment proof.", 400);
        ({ key } = await savePaymentProofFile(req.file.buffer));
        const outcome = await runCreditTransaction(async session => {
            const now = new Date();
            const purchase = await CreditPurchase.findById(id).select("+paymentProofKey").session(session);
            if (!purchase) throw purchaseError("Purchase quote not found.", 404);
            if (purchase.paymentProofKey) return { response: replay(purchase) };
            if (!["QUOTED", "EXPIRED"].includes(purchase.status)) throw purchaseError("This purchase is closed.", 409);

            const late = purchase.status === "EXPIRED" || purchase.expiresAt <= now;
            const posting = late ? await expirePurchaseHold(purchase, now, session) : null;
            purchase.status = late ? "REVIEW_REQUIRED" : "PENDING";
            purchase.proofSubmissionStatus = purchase.status;
            if (late) purchase.reviewReason = "LATE_PROOF";
            purchase.paymentProofKey = key;
            purchase.paymentReference = reference;
            // Writing the same order document serializes the claim with expiry and review.
            await purchase.save({ session });
            await queueRechargeAlerts(purchase, "submitted", session);
            return { purchase, posting, response: proofSubmission(purchase) };
        }, { walletIds: [order.sellerId] });

        keepFile = Boolean(outcome.purchase);
        if (outcome.purchase) {
            await Promise.allSettled([
                notifyPurchaseStock(outcome.purchase, outcome.posting),
                notifyUser(order.sellerId, "PURCHASE_REQUEST_RECEIVED", {
                    purchaseId: order._id, category: order.category, quantity: order.quantity, totalPaisa: order.totalPaisa,
                }),
            ]);
        }
        return res.json(outcome.response);
    } catch (error) {
        if (error.hasErrorLabel?.("UnknownTransactionCommitResult")) {
            keepFile = true;
            try {
                const saved = await CreditPurchase.findById(id).select("+paymentProofKey").readConcern("majority");
                if (saved?.paymentProofKey) {
                    keepFile = saved.paymentProofKey === key;
                    if (saved.paymentReference === reference) return res.json(proofSubmission(saved));
                }
            } catch { /* Keep the proof when the commit outcome is still uncertain. */ }
        }
        const duplicate = error.code === 11000 && error.keyPattern?.paymentReference;
        return res.status(duplicate ? 409 : error.statusCode || 500).json({
            success: false, message: duplicate ? "This payment reference has already been submitted for another purchase." : error.message,
            ...creditErrorDetails(error, req),
        });
    } finally {
        if (key && !keepFile) await removePaymentProofFile(key);
    }
}

/**
 * GET /api/credits/purchases/:id/proof
 * ------------------------------------
 * Private file streaming route for the payment proof.
 * Restricted to the buyer and recorded seller.
 */
export async function getProof(req, res) {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid purchase ID." });
        }

        const purchase = await CreditPurchase.findById(id).select("+paymentProofKey");
        if (!purchase) {
            return res.status(404).json({ success: false, message: "Purchase record not found." });
        }

        if (!isParticipant(purchase, req.user._id)) {
            return res.status(403).json({ success: false, message: "You are not authorized to view this payment proof." });
        }

        if (!purchase.paymentProofKey) {
            return res.status(404).json({ success: false, message: "No payment proof uploaded for this purchase." });
        }

        const filePath = await getPaymentProofPath(purchase.paymentProofKey);
        if (!filePath) {
            return res.status(404).json({ success: false, message: "Proof file not found on disk." });
        }

        const ext = filePath.split(".").pop().toLowerCase();
        const mimeTypes = {
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp",
            pdf: "application/pdf",
        };

        res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
        res.setHeader("Content-Disposition", `inline; filename="proof_${purchase._id}.${ext}"`);
        res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
    } catch (error) {
        console.error("GetProof error:", error);
        return res.status(500).json({ success: false, message: "Failed to load proof image" });
    }
}

/**
 * GET /api/credits/purchases
 * --------------------------
 * List purchases with role-based scoping and filters.
 */
export async function listPurchases(req, res) {
    try {
        const currentUser = req.user;
        const { category, status, page = 1, limit = 20, role_type, scope } = req.query;

        const pageNum = Math.max(1, Number(page));
        const limitNum = Math.min(100, Math.max(1, Number(limit)));

        const filter = {};

        if (category && CREDIT_CATEGORIES.includes(category)) {
            filter.category = category;
        }

        if (status && ["QUOTED", "PENDING", "APPROVED", "REJECTED", "EXPIRED", "REVIEW_REQUIRED", "FLAGGED"].includes(status)) {
            filter.status = status;
        }

        // Role scoping
        if (currentUser.role === "User") {
            filter.buyerId = currentUser._id;
        } else if (currentUser.role === "Reseller") {
            if (scope === "buyer" || role_type === "buyer") {
                filter.buyerId = currentUser._id;
            } else {
                filter.sellerId = currentUser._id;
            }
        } else if (currentUser.role === "Super Admin") {
            filter.sellerId = currentUser._id;
        }

        // Sellers (Super Admin and Reseller reviewing client requests) should not see unsubmitted quotes (QUOTED)
        if (filter.sellerId) {
            if (!status || status === "all") {
                filter.status = { $ne: "QUOTED" };
            } else if (status === "QUOTED") {
                filter.status = { $in: [] };
            }
        }

        const total = await CreditPurchase.countDocuments(filter);
        const pendingCount = await CreditPurchase.countDocuments({
            ...(currentUser.role === "User" ? { buyerId: currentUser._id } : { sellerId: currentUser._id }),
            status: { $in: reviewable },
        });

        const purchases = await CreditPurchase.find(filter).select("+paymentProofKey")
            .populate("buyerId", "username email role")
            .populate("sellerId", "username email role")
            .populate("reviewedBy", "username email role")
            .sort({ createdAt: -1 })
            .skip((pageNum - 1) * limitNum)
            .limit(limitNum);

        return res.status(200).json({
            success: true,
            purchases: purchases.map(p => ({
                id: p._id,
                category: p.category,
                quantity: p.quantity,
                unitPriceInr: p.unitPriceInr ? p.unitPriceInr.toString() : null,
                totalPaisa: p.totalPaisa,
                totalInr: inrTotal(p.totalPaisa),
                currency: p.currency,
                status: p.status,
                hasProof: Boolean(p.paymentProofKey),
                reviewReason: p.reviewReason,
                rejectionReason: p.rejectionReason,
                flagReason: p.flagReason || null,
                flaggedAt: p.flaggedAt || null,
                fixAttempts: p.fixAttempts || 0,
                fixedAt: p.fixedAt || null,
                paymentReference: p.paymentReference || null,
                expiresAt: p.expiresAt,
                createdAt: p.createdAt,
                reviewedAt: p.reviewedAt || null,
                buyer: p.buyerId ? {
                    id: p.buyerId._id,
                    username: p.buyerId.username,
                    email: p.buyerId.email,
                    role: p.buyerId.role,
                } : null,
                seller: p.sellerId ? (currentUser.role === "User" ? {
                    id: p.sellerId._id,
                    username: p.sellerId.role === "Super Admin" ? "Admin" : `Admin (${p.sellerId.username})`,
                    role: "Admin",
                } : {
                    id: p.sellerId._id,
                    username: p.sellerId.username,
                    role: p.sellerId.role,
                }) : null,
                reviewedBy: p.reviewedBy ? (currentUser.role === "User" ? {
                    id: p.reviewedBy._id,
                    username: p.reviewedBy.role === "Super Admin" ? "Admin" : `Admin (${p.reviewedBy.username})`,
                    role: "Admin",
                } : {
                    id: p.reviewedBy._id,
                    username: p.reviewedBy.username,
                }) : null,
                fulfillmentTransactionId: p.fulfillmentTransactionId || null,
            })),
            pendingCount,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        console.error("ListPurchases error:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to list purchases" });
    }
}

/**
 * GET /api/credits/purchases/:id
 * ------------------------------
 * Fetch single purchase details.
 */
export async function getPurchaseById(req, res) {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid purchase ID." });
        }

        const purchase = await CreditPurchase.findById(id).select("+paymentProofKey +paymentInstructions")
            .populate("buyerId", "username email role")
            .populate("sellerId", "username email role paymentInstructions")
            .populate("reviewedBy", "username email role")
            .populate("fulfillmentTransactionId");

        if (!purchase) {
            return res.status(404).json({ success: false, message: "Purchase record not found." });
        }

        if (!isParticipant(purchase, req.user._id)) {
            return res.status(403).json({ success: false, message: "Not authorized to view this purchase." });
        }

        return res.status(200).json({
            success: true,
            purchase: {
                id: purchase._id,
                category: purchase.category,
                quantity: purchase.quantity,
                unitPriceInr: purchase.unitPriceInr ? purchase.unitPriceInr.toString() : null,
                totalPaisa: purchase.totalPaisa,
                totalInr: inrTotal(purchase.totalPaisa),
                currency: purchase.currency,
                status: purchase.status,
                paymentReference: purchase.paymentReference || null,
                hasProof: Boolean(purchase.paymentProofKey),
                expiresAt: purchase.expiresAt,
                createdAt: purchase.createdAt,
                reviewedAt: purchase.reviewedAt || null,
                buyer: purchase.buyerId,
                seller: purchase.sellerId ? (req.user.role === "User" ? {
                    id: purchase.sellerId._id,
                    username: purchase.sellerId.role === "Super Admin" ? "Admin" : `Admin (${purchase.sellerId.username})`,
                    role: "Admin",
                } : {
                    id: purchase.sellerId._id, username: purchase.sellerId.username, role: purchase.sellerId.role,
                }) : null,
                reviewReason: purchase.reviewReason,
                rejectionReason: purchase.rejectionReason,
                flagReason: purchase.flagReason || null,
                flaggedAt: purchase.flaggedAt || null,
                fixAttempts: purchase.fixAttempts || 0,
                fixedAt: purchase.fixedAt || null,
                reviewedBy: purchase.reviewedBy,
                fulfillmentTransaction: purchase.fulfillmentTransactionId,
                paymentInstructions: purchase.paymentInstructions || purchase.sellerId?.paymentInstructions || {},
            },
        });
    } catch (error) {
        console.error("GetPurchaseById error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch purchase details" });
    }
}

/**
 * POST /api/credits/purchases/:id/approve
 * ---------------------------------------
 * Seller verifies payment and approves the purchase in a MongoDB transaction.
 * Issues or transfers the exact credit quantity, updates status, writes balanced postings.
 */
export async function approvePurchase(req, res) {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid purchase ID." });
    try {
        const outcome = await runCreditTransaction(async session => {
            const purchase = await CreditPurchase.findById(id).select("+paymentProofKey").session(session);
            if (!purchase) throw purchaseError("Purchase not found.", 404);
            if (String(purchase.sellerId) !== String(req.user._id)) throw purchaseError("Only the recorded seller can approve this purchase.", 403);
            if (!reviewable.includes(purchase.status)) throw purchaseError("This purchase is no longer awaiting review.", 409);
            if (!purchase.paymentProofKey || !purchase.paymentReference) throw purchaseError("A payment proof and reference are required for approval.", 400);
            if (purchase.status === "REVIEW_REQUIRED" && req.body?.confirmManualReview !== true) {
                throw purchaseError("Confirm that the payment evidence matches the original order before approving.", 409);
            }

            const buyer = await userModel.findById(purchase.buyerId).session(session);
            const seller = await resolveSellerForBuyer(buyer, session);
            if (String(seller?._id) !== String(purchase.sellerId)) {
                throw purchaseError("The buyer's ownership does not match the recorded seller.", 409);
            }
            const posting = await postCreditMovement({
                session, operationKey: 'purchase:' + purchase._id + ':approve',
                type: "ALLOCATE", category: purchase.category, amount: purchase.quantity,
                fromUser: seller.role === "Super Admin" ? null : purchase.sellerId,
                toUser: purchase.buyerId, performedBy: req.user._id, purchaseId: purchase._id,
                notes: purchase.status === "REVIEW_REQUIRED" ? "Recharge approved after manual payment review." : "Recharge approved.",
            });
            const { transaction } = posting;
            await recordSupportAction(req, session, purchase.buyerId,
                "Approved purchase " + purchase._id + ". Transaction ID: " + transaction.transactionId, transaction._id);
            const result = {
                success: true,
                message: "Recharge approved and credits added.",
                transaction: { id: transaction._id, transactionId: transaction.transactionId, amount: purchase.quantity, category: purchase.category },
                purchase: { id: purchase._id, status: "APPROVED", quantity: purchase.quantity, category: purchase.category },
            };
            await saveCreditReceipt(req, session, 200, result);
            return { purchase, posting, result };
        }, { walletIds: [req.user._id] });

        const { purchase, posting, result } = outcome;
        await Promise.allSettled([
            publishSupportAction(req),
            notifyPurchaseStock(purchase, posting),
            notifyUser(purchase.buyerId, "WALLET_UPDATED", {
                category: purchase.category, delta: purchase.quantity, reason: "PURCHASE_APPROVED",
                purchaseId: purchase._id, transactionId: posting.transaction._id,
                newBalance: posting.toWallet.creditBalances[purchase.category].available,
            }),
            notifyUser(purchase.buyerId, "PURCHASE_APPROVED", {
                purchaseId: purchase._id, category: purchase.category, quantity: purchase.quantity, totalPaisa: purchase.totalPaisa,
            }),
        ]);
        return res.status(200).json(result);
    } catch (error) {
        let extra = {};
        const isInsufficient = error.code === "CREDIT_INSUFFICIENT" || error.message?.includes("Insufficient credits");
        if (isInsufficient && req.user.role === "Reseller") {
            try {
                const purchase = await CreditPurchase.findById(id).lean();
                if (purchase) {
                    const sellerWallet = await walletModel.findOne({ userId: req.user._id }).lean();
                    const available = sellerWallet?.creditBalances?.[purchase.category]?.available || 0;
                    const shortfall = Math.max(1, purchase.quantity - available);
                    extra = {
                        isInsufficientBalance: true,
                        category: purchase.category,
                        required: purchase.quantity,
                        available,
                        shortfall,
                    };
                }
            } catch (_) {}
        }
        return res.status(error.statusCode || 400).json({
            success: false,
            code: error.code || "CREDIT_INSUFFICIENT",
            message: isInsufficient && req.user.role === "Reseller"
                ? "Not enough balance to approve this purchase request."
                : error.message || "Failed to approve purchase",
            ...extra,
            ...creditErrorDetails(error, req),
        });
    }
}

/**
 * POST /api/credits/purchases/:id/reject
 * --------------------------------------
 * Seller rejects a purchase request.
 * Releases reserved credits if held, updates status, and notifies the buyer.
 */
export async function rejectPurchase(req, res) {
    let mongoSession = null;
    try {
        const { id } = req.params;
        const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ success: false, message: "Invalid purchase ID." });
        }

        mongoSession = await startCreditSession(req);
        mongoSession.startTransaction(creditTransactionOptions);

        const purchase = await CreditPurchase.findById(id).session(mongoSession);
        if (!purchase) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(404).json({ success: false, message: "Purchase not found." });
        }

        const currentUserId = String(req.user._id);
        const sellerId = String(purchase.sellerId);
        if (sellerId !== currentUserId) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(403).json({ success: false, message: "Only the recorded seller can reject this purchase." });
        }

        if (!["QUOTED", "FLAGGED", ...reviewable].includes(purchase.status)) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
            return res.status(409).json({
                success: false,
                message: `Cannot reject purchase in status '${purchase.status}'.`,
            });
        }

        const release = await releasePurchaseHold(purchase, req.user._id, mongoSession);

        purchase.status = "REJECTED";
        purchase.rejectionReason = reason || "Payment verification failed";
        purchase.reviewedBy = req.user._id;
        purchase.reviewedAt = new Date();
        await purchase.save();

        const result = {
            success: true,
            message: "Purchase request has been rejected.",
            purchase: {
                id: purchase._id,
                status: "REJECTED",
                reason: reason || null,
            },
        };

        await saveCreditReceipt(req, mongoSession, 200, result);
        await mongoSession.commitTransaction();
        await mongoSession.endSession();
        mongoSession = null;

        await notifyPurchaseStock(purchase, release);
        notifyUser(purchase.buyerId, "PURCHASE_REJECTED", {
            purchaseId: purchase._id,
            category: purchase.category,
            quantity: purchase.quantity,
            reason: reason || "Payment verification failed",
        });

        return res.status(200).json(result);
    } catch (error) {
        if (mongoSession) {
            await abortCreditSession(mongoSession);
            await mongoSession.endSession();
        }
        console.error("RejectPurchase error:", error);
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to reject purchase",
            ...creditErrorDetails(error, req),
        });
    }
}


export async function flagPurchaseForReview(req, res) {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid purchase ID." });
    try {
        const purchase = await CreditPurchase.findById(id);
        if (!purchase) return res.status(404).json({ success: false, message: "Purchase not found." });
        if (String(purchase.sellerId) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: "Only the recorded seller can flag this purchase." });
        }
        if (!["PENDING", "REVIEW_REQUIRED"].includes(purchase.status)) {
            return res.status(409).json({ success: false, message: `Cannot flag purchase in status '${purchase.status}'.` });
        }
        if ((purchase.fixAttempts || 0) >= 1) {
            return res.status(400).json({ success: false, message: "The buyer has already used their 1 chance to fix this request. Please approve or reject it." });
        }

        const reason = typeof req.body?.reason === "string" && req.body.reason.trim()
            ? req.body.reason.trim().slice(0, 500)
            : "Payment proof flagged for correction. Please upload a clear image and valid transaction reference.";

        purchase.status = "FLAGGED";
        purchase.flagReason = reason;
        purchase.flaggedAt = new Date();
        purchase.flaggedBy = req.user._id;
        purchase.reviewedBy = req.user._id;
        purchase.reviewedAt = new Date();
        await purchase.save();

        await Promise.allSettled([
            notifyUser(purchase.buyerId, "PURCHASE_FLAGGED", {
                purchaseId: purchase._id,
                reason: purchase.flagReason,
                category: purchase.category,
                quantity: purchase.quantity,
            }),
        ]);

        return res.json({
            success: true,
            message: "Purchase request marked as flagged for buyer correction.",
            purchase: {
                id: purchase._id,
                status: purchase.status,
                flagReason: purchase.flagReason,
                flaggedAt: purchase.flaggedAt,
                fixAttempts: purchase.fixAttempts || 0,
            },
        });
    } catch (error) {
        console.error("FlagPurchase error:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to flag purchase" });
    }
}

export async function fixFlaggedProof(req, res) {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ success: false, message: "Invalid purchase ID." });

    const reference = typeof req.body?.paymentReference === "string" ? req.body.paymentReference.trim().toUpperCase() : "";
    let key;
    let keepFile = false;

    try {
        const purchase = await CreditPurchase.findById(id).select("+paymentProofKey");
        if (!purchase) throw purchaseError("Purchase quote not found.", 404);
        if (String(purchase.buyerId) !== String(req.user._id)) {
            throw purchaseError("You can only fix proof for your own purchase request.", 403);
        }
        if (purchase.status !== "FLAGGED") {
            throw purchaseError("Only flagged purchase requests can be edited.", 409);
        }
        if ((purchase.fixAttempts || 0) >= 1) {
            throw purchaseError("You have already used your 1 chance to fix this payment proof.", 400);
        }
        if (!reference || reference.length > 160) {
            throw purchaseError("Enter a valid payment reference (UTR) of up to 160 characters.", 400);
        }

        const existing = await CreditPurchase.findOne({ _id: { $ne: purchase._id }, paymentReference: reference });
        if (existing) {
            throw purchaseError("This payment reference has already been submitted for another purchase.", 409);
        }

        const oldKey = purchase.paymentProofKey;

        if (req.file?.buffer) {
            ({ key } = await savePaymentProofFile(req.file.buffer));
            purchase.paymentProofKey = key;
        }

        purchase.paymentReference = reference;
        purchase.status = "PENDING";
        purchase.proofSubmissionStatus = "PENDING";
        purchase.fixAttempts = (purchase.fixAttempts || 0) + 1;
        purchase.fixedAt = new Date();
        await runCreditTransaction(async session => {
            const updated = await CreditPurchase.findOneAndUpdate(
                { _id: id, status: "FLAGGED" },
                { $set: { paymentReference: reference, status: "PENDING", proofSubmissionStatus: "PENDING", fixAttempts: purchase.fixAttempts, fixedAt: purchase.fixedAt, ...(key && { paymentProofKey: key }) } },
                { session, returnDocument: "after", runValidators: true }
            );
            if (!updated) throw purchaseError("This purchase is no longer flagged.", 409);
            await queueRechargeAlerts(updated, "fixed", session);
        });
        keepFile = true;

        if (key && oldKey && oldKey !== key) {
            await removePaymentProofFile(oldKey);
        }

        await Promise.allSettled([
            notifyUser(purchase.sellerId, "PURCHASE_PROOF_FIXED", {
                purchaseId: purchase._id,
                category: purchase.category,
                quantity: purchase.quantity,
                paymentReference: purchase.paymentReference,
            }),
        ]);

        return res.status(200).json({
            success: true,
            message: "Payment proof and reference updated successfully. It has been resubmitted for review.",
            purchase: {
                id: purchase._id,
                status: purchase.status,
                paymentReference: purchase.paymentReference,
                fixAttempts: purchase.fixAttempts,
            },
        });
    } catch (error) {
        if (key && !keepFile && !error.hasErrorLabel?.("UnknownTransactionCommitResult")) await removePaymentProofFile(key);
        const duplicate = error.code === 11000 && error.keyPattern?.paymentReference;
        return res.status(duplicate ? 409 : error.statusCode || 500).json({
            success: false,
            message: duplicate ? "This payment reference has already been submitted for another purchase." : error.message,
            ...creditErrorDetails(error, req),
        });
    }
}
