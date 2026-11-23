import mongoose from "mongoose";
import { isCreditQuantity } from "../helpers/credit-categories.js";
import { FILTERING_STATUSES } from "../../../shared/numberFiltering.js";

const { ObjectId } = mongoose.Schema.Types;
const resultCategory = new mongoose.Schema({
    id: { type: String, required: true },
    label: { type: String, required: true },
}, { _id: false });
const schema = new mongoose.Schema({
    userId: { type: ObjectId, ref: "User", required: true, immutable: true },
    submittedRowCount: { type: Number, required: true, min: 1, validate: isCreditQuantity, immutable: true },
    chargeTransactionId: {
        type: ObjectId, ref: "Transaction", unique: true, immutable: true,
        required() { return !this.creditResetAt; },
    },
    creditResetAt: { type: Date, immutable: true },
    status: { type: String, enum: FILTERING_STATUSES, default: "SUBMITTED", required: true },
    revision: { type: Number, default: 0, required: true, validate: isCreditQuantity },
    reviewedBy: { type: ObjectId, ref: "User" },
    publishedAt: Date,
    publishedRowCount: { type: Number, default: 0, required: true, validate: isCreditQuantity },
    draftCategories: { type: [resultCategory], default: undefined },
    publishedCategories: { type: [resultCategory], default: undefined },
}, { timestamps: true });

schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: 1 });

// The request owns separate submitted, draft and published row sets. Chunking
// lets the manual report screens handle the same list sizes as campaigns.
const row = new mongoose.Schema({
    rowNumber: { type: Number, required: true, min: 1, validate: isCreditQuantity },
    phoneNumber: { type: String, required: true },
    category: String,
    notes: String,
}, { _id: false });
const chunk = new mongoose.Schema({
    requestId: { type: ObjectId, ref: "NumberFilterRequest", required: true },
    kind: { type: String, enum: ["submitted", "draft", "published"], required: true },
    chunkIndex: { type: Number, required: true, validate: isCreditQuantity },
    rows: { type: [row], required: true },
});
chunk.index({ requestId: 1, kind: 1, chunkIndex: 1 }, { unique: true });

export const NumberFilterRowChunk = mongoose.models.NumberFilterRowChunk || mongoose.model("NumberFilterRowChunk", chunk);
export default mongoose.models.NumberFilterRequest || mongoose.model("NumberFilterRequest", schema);
