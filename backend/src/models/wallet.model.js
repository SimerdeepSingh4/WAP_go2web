import { notificationHooks } from "../helpers/notification-hooks.js";
import mongoose from "mongoose";

/**
 * Wallet Model
 * -----------
 * Every User and Reseller gets exactly ONE wallet document.
 * - `balance` is stored in the smallest credit unit (paise).
 * - Super Admin has unlimited credits (no wallet needed, but can optionally have one).
 * - Reseller's wallet is topped up by Super Admin.
 * - User's wallet is topped up by their assigned Reseller (from the Reseller's own balance).
 */
const walletSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
            index: true,
        },
        balance: {
            type: Number,
            required: true,
            default: 0,
            min: [0, "Balance cannot be negative"],
        },
        resellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        expiresAt: {
            type: Date,
            default: null, // null means never expires
            index: true,
        },
        isLocked: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

notificationHooks(walletSchema, "wallet");

const walletModel =
    mongoose.models.Wallet || mongoose.model("Wallet", walletSchema);

export default walletModel;
