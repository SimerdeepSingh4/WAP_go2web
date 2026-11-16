import platformSettings from "../models/platformSettings.model.js";

export const DEFAULT_PLATFORM_SETTINGS = {
    dailyCampaignLimit: 10,
    defaultRatePerMsg: 1,
    lowBalanceThreshold: 500,
    creditExpiryValue: 2,
    creditExpiryUnit: "years",
    maxAllowedDevices: 3,
    autoRefundEnabled: true,
    strictOverdraftProtection: true,
    startTime: "09:00",
    endTime: "19:00",
    outOfWindowBehavior: "queue",
    deviceEvictionStrategy: "fifo",
};

export async function getPlatformSettingsDoc() {
    const doc = await platformSettings.findById("platform").lean();
    if (!doc) return { ...DEFAULT_PLATFORM_SETTINGS };
    return {
        dailyCampaignLimit: doc.dailyCampaignLimit ?? DEFAULT_PLATFORM_SETTINGS.dailyCampaignLimit,
        defaultRatePerMsg: doc.defaultRatePerMsg ?? DEFAULT_PLATFORM_SETTINGS.defaultRatePerMsg,
        lowBalanceThreshold: doc.lowBalanceThreshold ?? DEFAULT_PLATFORM_SETTINGS.lowBalanceThreshold,
        creditExpiryValue: doc.creditExpiryValue ?? DEFAULT_PLATFORM_SETTINGS.creditExpiryValue,
        creditExpiryUnit: doc.creditExpiryUnit ?? DEFAULT_PLATFORM_SETTINGS.creditExpiryUnit,
        maxAllowedDevices: doc.maxAllowedDevices ?? DEFAULT_PLATFORM_SETTINGS.maxAllowedDevices,
        autoRefundEnabled: doc.autoRefundEnabled ?? DEFAULT_PLATFORM_SETTINGS.autoRefundEnabled,
        strictOverdraftProtection: doc.strictOverdraftProtection ?? DEFAULT_PLATFORM_SETTINGS.strictOverdraftProtection,
        startTime: doc.startTime ?? DEFAULT_PLATFORM_SETTINGS.startTime,
        endTime: doc.endTime ?? DEFAULT_PLATFORM_SETTINGS.endTime,
        outOfWindowBehavior: doc.outOfWindowBehavior ?? DEFAULT_PLATFORM_SETTINGS.outOfWindowBehavior,
        deviceEvictionStrategy: doc.deviceEvictionStrategy ?? DEFAULT_PLATFORM_SETTINGS.deviceEvictionStrategy,
    };
}

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

export async function getDefaultRatePerMsg() {
    const settings = await platformSettings.findById("platform").lean();
    return Number.isFinite(settings?.defaultRatePerMsg) && settings.defaultRatePerMsg >= 0.01
        ? settings.defaultRatePerMsg
        : 1;
}

export async function calculateDefaultExpiry(baseDate = new Date()) {
    const settings = await platformSettings.findById("platform").lean();
    const unit = settings?.creditExpiryUnit ?? "years";
    const val = Number(settings?.creditExpiryValue ?? 2);

    if (unit === "never" || !val || val <= 0) return null;

    const result = new Date(baseDate);
    if (unit === "years") {
        result.setFullYear(result.getFullYear() + val);
    } else if (unit === "months") {
        result.setMonth(result.getMonth() + val);
    } else if (unit === "days") {
        result.setDate(result.getDate() + val);
    }
    result.setUTCHours(23, 59, 59, 999);
    return result;
}
