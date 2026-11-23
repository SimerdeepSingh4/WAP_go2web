import mongoose from "mongoose";
import CreditPurchaseRate from "../models/credit-purchase-rate.model.js";
import userModel from "../models/user.model.js";
import { CREDIT_CATEGORIES } from "../helpers/credit-categories.js";
import { isPurchaseRate } from "../helpers/credit-purchase-price.js";

/**
 * Helper to determine the seller for a given buyer.
 */
export async function resolveSellerForBuyer(buyer, session = null) {
    if (!["User", "Reseller"].includes(buyer?.role)) return null;

    const fields = "_id username role status paymentInstructions";
    // For a User assigned to a Reseller, their seller is always their Reseller.
    // For a direct User or a Reseller, their seller is the Super Admin who created them.
    const resellerId = buyer.role === "User" && (buyer.resellerId?._id || buyer.resellerId);
    const createdById = buyer.createdBy?._id || buyer.createdBy;
    const sellerId = resellerId || createdById;

    if (sellerId) {
        const owner = await userModel.findById(sellerId).select(fields).session(session);
        if (owner?.role === "Super Admin") return owner;
        if (owner?.role === "Reseller" && buyer.role === "User" && String(resellerId) === String(owner._id)) return owner;
        return null;
    }

    // Unowned legacy accounts have an unambiguous seller only on a single-admin deployment.
    const admins = await userModel.find({ role: "Super Admin", status: "active" }).select(fields).limit(2).session(session);
    return admins.length === 1 ? admins[0] : null;
}

/**
 * Helper to look up active purchase rate for a buyer from a seller for a given category.
 * Checks specific buyer rate first, then falls back to seller's default rate (buyerId: null).
 */
export async function getActivePurchaseRate(sellerId, buyerId, category) {
    if (!sellerId || !category) return null;

    if (buyerId) {
        const specificRate = await CreditPurchaseRate.findOne({
            sellerId,
            buyerId,
            category,
        }).sort({ version: -1 });

        if (specificRate) return specificRate;
    }

    return CreditPurchaseRate.findOne({
        sellerId,
        buyerId: null,
        category,
    }).sort({ version: -1 });
}

/**
 * GET /api/credits/rates
 * ----------------------
 * Returns configured purchase rates based on role and scope.
 */
export async function getRates(req, res) {
    try {
        const currentUser = req.user;
        const { buyerId, category } = req.query;

        if (buyerId && buyerId !== "default" && ["Super Admin", "Reseller"].includes(currentUser.role)) {
            if (!mongoose.isValidObjectId(buyerId)) return res.status(400).json({ success: false, message: "Invalid buyer account ID." });
            const buyer = await userModel.findById(buyerId);
            const seller = await resolveSellerForBuyer(buyer);
            if (!seller || String(seller._id) !== String(currentUser._id)) {
                return res.status(403).json({ success: false, message: "Only this buyer's seller can view their purchase rates." });
            }
            const purchaseRates = {};
            for (const cat of CREDIT_CATEGORIES) {
                const active = await getActivePurchaseRate(seller._id, buyer._id, cat);
                if (active) purchaseRates[cat] = { unitPriceInr: active.unitPriceInr.toString(), isDefault: !active.buyerId };
            }
            return res.json({ success: true, purchaseRates });
        }

        if (currentUser.role === "Super Admin") {
            const filter = { sellerId: currentUser._id };
            if (category && CREDIT_CATEGORIES.includes(category)) filter.category = category;
            if (buyerId) filter.buyerId = buyerId === "default" ? null : buyerId;

            const rates = await CreditPurchaseRate.find(filter)
                .populate("buyerId", "username email role")
                .sort({ category: 1, buyerId: 1, version: -1 });

            return res.status(200).json({ success: true, rates });
        }

        if (currentUser.role === "Reseller") {
            // Can view rates set by this reseller for users, AND rates set by Super Admin for this reseller
            const mySeller = await resolveSellerForBuyer(currentUser);

            const filter = { sellerId: currentUser._id };
            if (category && CREDIT_CATEGORIES.includes(category)) filter.category = category;
            if (buyerId) filter.buyerId = buyerId === "default" ? null : buyerId;

            const mySetRates = await CreditPurchaseRate.find(filter)
                .populate("buyerId", "username email role")
                .sort({ category: 1, buyerId: 1, version: -1 });

            // Also fetch active purchase rates from Super Admin for this reseller
            const myPurchaseRates = {};
            for (const cat of CREDIT_CATEGORIES) {
                const active = mySeller ? await getActivePurchaseRate(mySeller._id, currentUser._id, cat) : null;
                if (active) {
                    myPurchaseRates[cat] = {
                        rateId: active._id,
                        unitPriceInr: active.unitPriceInr.toString(),
                        category: cat,
                        isDefault: !active.buyerId,
                    };
                }
            }

            return res.status(200).json({
                success: true,
                rates: mySetRates,
                purchaseRates: myPurchaseRates,
            });
        }

        // Role === "User"
        // Return active rates applicable to this user for each category
        const seller = await resolveSellerForBuyer(currentUser);
        const rates = {};

        for (const cat of CREDIT_CATEGORIES) {
            const active = seller ? await getActivePurchaseRate(seller._id, currentUser._id, cat) : null;
            if (active) {
                rates[cat] = {
                    rateId: active._id,
                    unitPriceInr: active.unitPriceInr.toString(),
                    category: cat,
                    sellerId: seller._id,
                    sellerName: seller.username,
                    isDefault: !active.buyerId,
                };
            }
        }

        return res.status(200).json({
            success: true,
            purchaseRates: rates,
            hasSeller: Boolean(seller),
        });
    } catch (error) {
        console.error("GetRates error:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to fetch rates" });
    }
}

/**
 * POST /api/credits/rates
 * -----------------------
 * Sets or updates a purchase rate for a buyer or seller default.
 * Super Admin can set for Resellers, direct Users, or platform default.
 * Resellers can set for their own Users or reseller default.
 *
 * Body: { buyerId?, category, unitPriceInr }
 */
export async function setRate(req, res) {
    try {
        const { buyerId, category, unitPriceInr } = req.body;

        if (!category || !CREDIT_CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, message: "Valid category is required." });
        }

        if (!unitPriceInr || !isPurchaseRate(unitPriceInr)) {
            return res.status(400).json({ success: false, message: "A positive valid INR rate is required (e.g. '0.01')." });
        }

        let targetBuyerId = null;

        if (buyerId && buyerId !== "default") {
            if (!mongoose.isValidObjectId(buyerId)) {
                return res.status(400).json({ success: false, message: "Invalid buyer account ID." });
            }

            const targetUser = await userModel.findById(buyerId);
            if (!targetUser) {
                return res.status(404).json({ success: false, message: "Buyer account not found." });
            }

            const seller = await resolveSellerForBuyer(targetUser);
            if (!seller || String(seller._id) !== String(req.user._id)) {
                return res.status(403).json({ success: false, message: "Only this buyer's seller can configure their purchase rates." });
            }

            targetBuyerId = targetUser._id;
        }

        const scope = { sellerId: req.user._id, buyerId: targetBuyerId, category };
        let rate;
        for (let attempt = 0; attempt < 3; attempt++) {
            const previous = await CreditPurchaseRate.findOne(scope).sort({ version: -1 }).select("version");
            try {
                rate = await CreditPurchaseRate.create({
                    ...scope, version: (previous?.version || 0) + 1, unitPriceInr, createdBy: req.user._id,
                });
                break;
            } catch (error) {
                if (error.code !== 11000) throw error;
            }
        }
        if (!rate) return res.status(409).json({ success: false, message: "The price changed while you were saving. Try again." });

        return res.status(201).json({
            success: true,
            message: targetBuyerId
                ? `Rate updated for buyer to ₹${unitPriceInr} per ${category} credit.`
                : `Default ${category} rate set to ₹${unitPriceInr} per credit.`,
            rate: {
                id: rate._id,
                sellerId: rate.sellerId,
                buyerId: rate.buyerId,
                category: rate.category,
                version: rate.version,
                unitPriceInr: rate.unitPriceInr.toString(),
                effectiveAt: rate.effectiveAt,
            },
        });
    } catch (error) {
        console.error("SetRate error:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to set rate" });
    }
}

/**
 * GET /api/credits/payment-instructions
 * -------------------------------------
 * Seller reads their own payment instructions.
 */
export async function getPaymentInstructions(req, res) {
    try {
        const user = await userModel.findById(req.user._id).select("paymentInstructions");
        return res.status(200).json({
            success: true,
            paymentInstructions: user?.paymentInstructions || {},
        });
    } catch (error) {
        console.error("GetPaymentInstructions error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch payment instructions" });
    }
}

/**
 * PUT /api/credits/payment-instructions
 * -------------------------------------
 * Seller updates their payment instructions.
 */
export async function updatePaymentInstructions(req, res) {
    try {
        const { bankName, accountNumber, accountName, ifscCode, upiId, qrCodeUrl, notes } = req.body;

        const update = {
            "paymentInstructions.bankName": (bankName || "").trim(),
            "paymentInstructions.accountNumber": (accountNumber || "").trim(),
            "paymentInstructions.accountName": (accountName || "").trim(),
            "paymentInstructions.ifscCode": (ifscCode || "").trim(),
            "paymentInstructions.upiId": (upiId || "").trim(),
            "paymentInstructions.qrCodeUrl": (qrCodeUrl || "").trim(),
            "paymentInstructions.notes": (notes || "").trim(),
        };

        const updatedUser = await userModel.findByIdAndUpdate(
            req.user._id,
            { $set: update },
            { new: true }
        ).select("paymentInstructions");

        return res.status(200).json({
            success: true,
            message: "Payment instructions saved successfully.",
            paymentInstructions: updatedUser.paymentInstructions,
        });
    } catch (error) {
        console.error("UpdatePaymentInstructions error:", error);
        return res.status(500).json({ success: false, message: "Failed to update payment instructions" });
    }
}

/**
 * GET /api/credits/payment-instructions/seller
 * --------------------------------------------
 * Buyer retrieves seller's payment instructions.
 * Requires that a valid purchase rate has been configured!
 */
export async function getSellerPaymentInstructions(req, res) {
    try {
        const buyer = req.user;
        const seller = await resolveSellerForBuyer(buyer);

        if (!seller) {
            return res.status(404).json({ success: false, message: "Account manager not found." });
        }

        // Check category passed in query or default check
        const category = req.query.category || "CAMPAIGN";
        const activeRate = await getActivePurchaseRate(seller._id, buyer._id, category);

        if (!activeRate) {
            return res.status(400).json({
                success: false,
                message: "Payment instructions are not available until your account manager configures a credit purchase rate for you.",
            });
        }

        return res.status(200).json({
            success: true,
            seller: {
                id: seller._id,
                username: seller.username,
                role: seller.role,
            },
            paymentInstructions: seller.paymentInstructions || {},
            rate: {
                category,
                unitPriceInr: activeRate.unitPriceInr.toString(),
            },
        });
    } catch (error) {
        console.error("GetSellerPaymentInstructions error:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch seller payment instructions" });
    }
}
