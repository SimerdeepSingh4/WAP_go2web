import mongoose from "mongoose";

/**
 * Transaction Model (Credit Audit Log)
 * ------------------------------------
 * Every credit movement is logged here as an immutable record.
 *
 * Types:
 *   ALLOCATE — Super Admin → Reseller, or Reseller → User
 *   DEDUCT   — System deducts credits when a message is sent
 *   REFUND   — Credits returned (e.g., failed message delivery)
 *
 * `rateSnapshot` captures the user's ratePerMsg at the time of transaction
 * so historical records remain accurate even if rates change later.
 */
const transactionSchema = new mongoose.Schema(
    {
        fromUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null, // null when Super Admin is the source (unlimited pool)
        },
        toUser: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "Target user is required"],
        },
        amount: {
            type: Number,
            required: [true, "Amount is required"],
            min: [0.01, "Amount must be greater than 0"],
        },
        type: {
            type: String,
            enum: ["ALLOCATE", "DEDUCT", "REFUND", "RECLAIM", "REQUEST"],
            required: [true, "Transaction type is required"],
        },
        notes: {
            type: String,
            default: "",
            maxlength: 500,
        },
        rateSnapshot: {
            type: Number,
            default: null,
        },
        balanceAfterFrom: {
            type: Number,
            default: null, // fromUser's wallet balance after this transaction
        },
        balanceAfterTo: {
            type: Number,
            default: null, // toUser's wallet balance after this transaction
        },
        performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true, // The admin/reseller/system who initiated this
        },
        campaignId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Campaign",
            default: null,
            index: true,
        },
        // Manual billing adjustments each have their own immutable ledger entry.
        // Automated refunds omit this key, retaining one refund per campaign.
        refundOperationId: {
            type: mongoose.Schema.Types.ObjectId,
        },
    },
    {
        timestamps: true,
    }
);

// Index for fast lookups: transactions involving a specific user
transactionSchema.index({ fromUser: 1, createdAt: -1 });
transactionSchema.index({ toUser: 1, createdAt: -1 });
transactionSchema.index({ performedBy: 1, createdAt: -1 });
transactionSchema.index({ type: 1, createdAt: -1 });

// Keep automated refunds idempotent while allowing separate manual adjustments.
transactionSchema.index(
    { campaignId: 1, type: 1, refundOperationId: 1 },
    {
        name: "campaign_refund_operation_unique",
        unique: true,
        partialFilterExpression: { type: "REFUND" },
    }
);

const transactionModel =
    mongoose.models.Transaction ||
    mongoose.model("Transaction", transactionSchema);

export default transactionModel;
