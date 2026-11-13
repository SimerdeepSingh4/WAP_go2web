import platformSettings from "../models/platformSettings.model.js";
import { resolveMediaUploadLimits } from "../../../shared/mediaUploadLimits.js";

export async function getMediaUploadDefaults() {
    const settings = await platformSettings.findById("platform").lean();
    return resolveMediaUploadLimits(settings?.mediaUploadLimits);
}

export async function getAccountMediaUploadLimits(account) {
    return resolveMediaUploadLimits(account?.mediaUploadLimits, await getMediaUploadDefaults());
}
