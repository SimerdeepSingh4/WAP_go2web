import platformSettings from "../models/platformSettings.model.js";

export async function getPlatformDailyCampaignLimit() {
    const settings = await platformSettings.findById("platform").lean();
    return Number.isInteger(settings?.dailyCampaignLimit) && settings.dailyCampaignLimit >= 1
        ? settings.dailyCampaignLimit
        : 10;
}

export async function getEffectiveDailyCampaignLimit(user) {
    if (!user || user.role === "Super Admin") return null; // Super Admin is unlimited
    if (Number.isInteger(user.dailyCampaignLimit) && user.dailyCampaignLimit >= 1) {
        return user.dailyCampaignLimit;
    }
    return await getPlatformDailyCampaignLimit();
}
