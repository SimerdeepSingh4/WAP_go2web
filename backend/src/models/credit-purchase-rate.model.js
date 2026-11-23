import mongoose from "mongoose";
import { CREDIT_CATEGORIES, isCreditQuantity } from "../helpers/credit-categories.js";
import { isPurchaseRate } from "../helpers/credit-purchase-price.js";

const { ObjectId, Decimal128 } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
    sellerId: { type: ObjectId, ref: "User", required: true, immutable: true },
    buyerId: { type: ObjectId, ref: "User", default: null, immutable: true },
    category: { type: String, enum: CREDIT_CATEGORIES, required: true, immutable: true },
    version: { type: Number, required: true, min: 1, validate: isCreditQuantity, immutable: true },
    unitPriceInr: { type: Decimal128, required: true, validate: isPurchaseRate, immutable: true },
    effectiveAt: { type: Date, required: true, default: Date.now, immutable: true },
    createdBy: { type: ObjectId, ref: "User", required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

// A null buyer represents the seller's default rate for this category.
schema.index({ sellerId: 1, buyerId: 1, category: 1, version: -1 }, { unique: true });
export default mongoose.models.CreditPurchaseRate || mongoose.model("CreditPurchaseRate", schema);
