import platformSettings from "../models/platformSettings.model.js";
import { getPlatformDailyCampaignLimit, getEffectiveDailyCampaignLimit } from "../services/platform-settings.service.js";
import { notifyRole } from "../services/socket.service.js";

export async function getPlatformSettings(req, res) {
    try {
        const platformDefault = await getPlatformDailyCampaignLimit();
        const effectiveLimit = await getEffectiveDailyCampaignLimit(req.user);
        return res.json({
            success: true,
            settings: {
                dailyCampaignLimit: platformDefault,
            },
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
        const { dailyCampaignLimit } = req.body;
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

        updates.updatedBy = req.user._id;

        const saved = await platformSettings.findOneAndUpdate(
            { _id: "platform" },
            { $set: updates },
            { upsert: true, returnDocument: "after", runValidators: true }
        ).lean();

        for (const role of ["Super Admin", "Reseller", "User"]) {
            notifyRole(role, "PLATFORM_SETTINGS_CHANGED", {});
        }

        return res.json({
            success: true,
            message: "Platform settings updated successfully.",
            settings: {
                dailyCampaignLimit: saved.dailyCampaignLimit,
            },
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Could not save platform settings." });
    }
}
