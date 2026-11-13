import platformSettings from "../models/platformSettings.model.js";
import userModel from "../models/user.model.js";
import { getMediaUploadDefaults } from "../services/media-upload-limits.service.js";
import { normalizeMediaUploadLimits, resolveMediaUploadLimits } from "../../../shared/mediaUploadLimits.js";
import { notifyRole, notifyUser } from "../services/socket.service.js";

export async function getMediaUploadLimits(req, res) {
    try {
        const defaults = await getMediaUploadDefaults();
        return res.json({ success: true, defaults, overrides: req.user.mediaUploadLimits || {}, effective: resolveMediaUploadLimits(req.user.mediaUploadLimits, defaults) });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Could not load upload limits." });
    }
}

export async function updateMediaUploadDefaults(req, res) {
    let limits;
    try { limits = normalizeMediaUploadLimits(req.body.mediaUploadLimits); }
    catch (error) { return res.status(400).json({ success: false, message: error.message }); }
    try {
        const saved = await platformSettings.findOneAndUpdate({ _id: "platform" }, {
            $set: { mediaUploadLimits: limits, updatedBy: req.user._id },
        }, { upsert: true, returnDocument: "after", runValidators: true }).lean();
        for (const role of ["Super Admin", "Reseller", "User"]) notifyRole(role, "MEDIA_UPLOAD_LIMITS_CHANGED", {});
        return res.json({ success: true, defaults: saved.mediaUploadLimits, effective: resolveMediaUploadLimits(req.user.mediaUploadLimits, saved.mediaUploadLimits) });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Could not save upload limits." });
    }
}

export async function updateAccountMediaUploadLimits(req, res) {
    let limits;
    try { limits = normalizeMediaUploadLimits(req.body.mediaUploadLimits, { overrides: true }); }
    catch (error) { return res.status(400).json({ success: false, message: error.message }); }
    try {
        const account = await userModel.findById(req.params.id);
        if (!account) return res.status(404).json({ success: false, message: "Account not found." });
        if (!["User", "Reseller"].includes(account.role)) return res.status(400).json({ success: false, message: "Upload overrides apply to user and reseller accounts." });
        account.mediaUploadLimits = limits;
        await account.save();
        notifyUser(account._id, "MEDIA_UPLOAD_LIMITS_CHANGED", {});
        notifyRole("Super Admin", "MEDIA_UPLOAD_LIMITS_CHANGED", {});
        return res.json({ success: true, mediaUploadLimits: limits, effective: resolveMediaUploadLimits(limits, await getMediaUploadDefaults()) });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Could not update account upload limits." });
    }
}
