import platformSettings from "../models/platformSettings.model.js";
import {
    getPlatformSettingsDoc,
    getEffectiveDailyCampaignLimit
} from "../services/platform-settings.service.js";
import { notifyRole } from "../services/socket.service.js";

export async function getPlatformSettings(req, res) {
    try {
        const doc = await getPlatformSettingsDoc();
        const effectiveLimit = await getEffectiveDailyCampaignLimit(req.user);
        return res.json({
            success: true,
            settings: doc,
            effective: {
                dailyCampaignLimit: effectiveLimit,
                isCustom: Boolean(req.user?.dailyCampaignLimit),
                isUnlimited: req.user?.role === "Super Admin",
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Could not load platform settings." });
    }
}

export async function updatePlatformSettings(req, res) {
    try {
        const {
            dailyCampaignLimit,
            defaultRatePerMsg,
            lowBalanceThreshold,
            creditExpiryValue,
            creditExpiryUnit,
            maxAllowedDevices,
            autoRefundEnabled,
            strictOverdraftProtection,
            startTime,
            endTime,
            outOfWindowBehavior,
            deviceEvictionStrategy
        } = req.body;

        const updates = {};

        if (dailyCampaignLimit !== undefined) {
            const parsed = Number(dailyCampaignLimit);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1000) {
                return res.status(400).json({
                    success: false,
                    message: "Daily campaign limit must be a whole number between 1 and 1000.",
                });
            }
            updates.dailyCampaignLimit = parsed;
        }

        if (defaultRatePerMsg !== undefined) {
            const parsed = Number(defaultRatePerMsg);
            if (!Number.isFinite(parsed) || parsed < 0.01) {
                return res.status(400).json({
                    success: false,
                    message: "Default rate per message must be at least 0.01 credits.",
                });
            }
            updates.defaultRatePerMsg = parsed;
        }

        if (lowBalanceThreshold !== undefined) {
            const parsed = Number(lowBalanceThreshold);
            if (!Number.isInteger(parsed) || parsed < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Low balance warning must be a whole number of 0 or more.",
                });
            }
            updates.lowBalanceThreshold = parsed;
        }

        if (creditExpiryUnit !== undefined) {
            if (!["years", "months", "days", "never"].includes(creditExpiryUnit)) {
                return res.status(400).json({
                    success: false,
                    message: "Choose a valid expiry unit.",
                });
            }
            updates.creditExpiryUnit = creditExpiryUnit;
        }

        if (creditExpiryValue !== undefined) {
            const parsed = Number(creditExpiryValue);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return res.status(400).json({
                    success: false,
                    message: "Default credit expiry must be 0 or more.",
                });
            }
            updates.creditExpiryValue = parsed;
        }

        if (maxAllowedDevices !== undefined) {
            const parsed = Number(maxAllowedDevices);
            if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
                return res.status(400).json({
                    success: false,
                    message: "Maximum devices must be between 1 and 10.",
                });
            }
            updates.maxAllowedDevices = parsed;
        }

        if (typeof autoRefundEnabled === "boolean") {
            updates.autoRefundEnabled = autoRefundEnabled;
        }

        if (typeof strictOverdraftProtection === "boolean") {
            updates.strictOverdraftProtection = strictOverdraftProtection;
        }

        if (typeof startTime === "string") updates.startTime = startTime;
        if (typeof endTime === "string") updates.endTime = endTime;
        if (typeof outOfWindowBehavior === "string") updates.outOfWindowBehavior = outOfWindowBehavior;
        if (typeof deviceEvictionStrategy === "string") updates.deviceEvictionStrategy = deviceEvictionStrategy;

        updates.updatedBy = req.user._id;

        await platformSettings.findOneAndUpdate(
            { _id: "platform" },
            { $set: updates },
            { upsert: true, returnDocument: "after", runValidators: true }
        ).lean();

        for (const role of ["Super Admin", "Reseller", "User"]) {
            notifyRole(role, "PLATFORM_SETTINGS_CHANGED", {});
        }

        const doc = await getPlatformSettingsDoc();

        return res.json({
            success: true,
            message: "Platform settings updated successfully.",
            settings: doc,
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Could not save platform settings." });
    }
}
