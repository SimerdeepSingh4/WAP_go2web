import mongoose from "mongoose";

const reviewPinSchema = new mongoose.Schema(
    {
        page: {
            type: String,
            required: [true, "Page is required"],
            trim: true,
        },
        role: {
            type: String,
            required: [true, "Role is required"],
            enum: ["Super Admin", "Reseller", "User"],
        },
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        createdByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "createdByUserId is required"],
        },
        testerName: {
            type: String,
            required: [true, "Tester name is required"],
            trim: true,
            maxlength: [120, "Tester name cannot exceed 120 characters"],
        },
        description: {
            type: String,
            required: [true, "Description is required"],
            maxlength: [2000, "Description cannot exceed 2000 characters"],
        },
        elementSelector: {
            type: String,
            maxlength: [500, "Element selector cannot exceed 500 characters"],
            default: null,
        },
        elementRelX: {
            type: Number,
            default: null,
        },
        elementRelY: {
            type: Number,
            default: null,
        },
        pageRelX: {
            type: Number,
            default: null,
        },
        pageRelY: {
            type: Number,
            default: null,
        },
        scrollY: {
            type: Number,
            default: null,
        },
        anchorLost: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: ["open", "resolved"],
            default: "open",
        },
        resolvedByName: {
            type: String,
            trim: true,
            maxlength: 120,
            default: null,
        },
        resolvedByUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        resolvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

reviewPinSchema.index({ page: 1, tenantId: 1 });
reviewPinSchema.index({ createdByUserId: 1 });

const ReviewPin = mongoose.models.ReviewPin || mongoose.model("ReviewPin", reviewPinSchema);

export default ReviewPin;
