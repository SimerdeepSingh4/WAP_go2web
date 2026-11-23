import mongoose from "mongoose";
import { CREDIT_CATEGORIES, isCreditQuantity } from "../helpers/credit-categories.js";
import { isPurchaseRate, purchaseTotalPaisa } from "../helpers/credit-purchase-price.js";

const { ObjectId, Decimal128 } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
    sellerId: { type: ObjectId, ref: "User", required: true, immutable: true },
    buyerId: { type: ObjectId, ref: "User", required: true, immutable: true },
    category: { type: String, enum: CREDIT_CATEGORIES, required: true, immutable: true },
    quantity: { type: Number, required: true, min: 1, validate: isCreditQuantity, immutable: true },
    rateId: { type: ObjectId, ref: "CreditPurchaseRate", required: true, immutable: true },
    unitPriceInr: { type: Decimal128, required: true, validate: isPurchaseRate, immutable: true },
    currency: { type: String, enum: ["INR"], default: "INR", required: true, immutable: true },
    totalPaisa: { type: Number, required: true, min: 1, validate: isCreditQuantity, immutable: true },
    expiresAt: { type: Date, required: true, immutable: true },
    paymentInstructions: { type: mongoose.Schema.Types.Mixed, immutable: true, select: false },
    holdExpiryProcessedAt: Date,
    reservationFree: Boolean,
    proofSubmissionStatus: { type: String, enum: ["PENDING", "REVIEW_REQUIRED"] },
    reviewReason: { type: String, enum: ["LATE_PROOF", "PAYMENT_MISMATCH"] },
    rejectionReason: { type: String, maxlength: 500 },
    flagReason: { type: String, maxlength: 500 },
    flaggedAt: Date,
    flaggedBy: { type: ObjectId, ref: "User" },
    fixAttempts: { type: Number, default: 0, min: 0 },
    fixedAt: Date,
    paymentProofKey: { type: String, select: false, trim: true },
    paymentReference: { type: String, trim: true, uppercase: true, minlength: 1, maxlength: 160 },
    status: { type: String, enum: ["QUOTED", "PENDING", "APPROVED", "REJECTED", "EXPIRED", "REVIEW_REQUIRED", "FLAGGED"], default: "QUOTED", required: true },
    reviewedBy: { type: ObjectId, ref: "User" },
    reviewedAt: Date,
    fulfillmentTransactionId: { type: ObjectId, ref: "Transaction" },
    adjustmentTransactionIds: [{ type: ObjectId, ref: "Transaction" }],
}, {
    timestamps: true,
    toJSON: {
        transform(_doc, result) { delete result.paymentProofKey; delete result.paymentInstructions; return result; },
    },
});

schema.pre("validate", function () {
    if (Number.isSafeInteger(this.quantity) && this.quantity > 0 && isPurchaseRate(this.unitPriceInr)) {
        try {
            if (purchaseTotalPaisa(this.quantity, this.unitPriceInr) !== this.totalPaisa) {
                this.invalidate("totalPaisa", "The amount must match the quoted rate and credit quantity.");
            }
        } catch (error) {
            this.invalidate("totalPaisa", error.message);
        }
    }
});
schema.index({ sellerId: 1, status: 1, createdAt: -1 });
schema.index({ status: 1, holdExpiryProcessedAt: 1, expiresAt: 1 });
schema.index({ buyerId: 1, category: 1, createdAt: -1 });
schema.index({ paymentReference: 1 }, { unique: true, partialFilterExpression: { paymentReference: { $type: "string" } } });
schema.index({ fulfillmentTransactionId: 1 }, { unique: true, sparse: true });

export default mongoose.models.CreditPurchase || mongoose.model("CreditPurchase", schema);
