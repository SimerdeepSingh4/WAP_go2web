// Compare full numbers without guessing a country code. Formatting is ignored;
// national and international numbers remain distinct unless their digits match.
export function normalizeTrackedPhone(value) {
    if (typeof value !== "string" || !/^[+\d\s().-]+$/.test(value)) return "";
    const digits = value.replace(/\D/g, "");
    return /^\d{7,15}$/.test(digits) ? digits : "";
}

export function parseTrackedPhones(value) {
    const values = typeof value === "string" ? value.split(/[\n,;\t]+/).filter((item) => item.trim()) : value;
    if (!Array.isArray(values) || !values.length || values.length > 10000) {
        throw Object.assign(new Error("Enter between 1 and 10,000 phone numbers."), { statusCode: 400 });
    }
    const normalized = values.map(normalizeTrackedPhone);
    if (normalized.some((number) => !number)) {
        throw Object.assign(new Error("Use phone numbers with 7 to 15 digits, including the country code. Letters and extensions are not supported."), { statusCode: 400 });
    }
    return [...new Set(normalized)];
}

export function submittedCampaignPhones(campaign) {
    // Report edits must never introduce numbers into submission history.
    const source = Array.isArray(campaign.originalRecipients)
        ? campaign.originalRecipients
        : (campaign.recipients || []).map((recipient) => recipient.phoneNumber);
    return new Set(source.map(normalizeTrackedPhone).filter(Boolean));
}

export function buildTrackedNumberRows(currentNumbers, counts, manualNumbers, profilePhone, totalCampaigns, submitted = true) {
    const phone = normalizeTrackedPhone(profilePhone);
    const manual = new Map(manualNumbers.map((entry) => [entry.phoneNumber, entry]));
    const candidates = new Set([...currentNumbers, ...manual.keys(), ...(phone ? [phone] : [])]);
    return [...candidates].map((phoneNumber) => {
        const record = manual.get(phoneNumber);
        const inCampaign = currentNumbers.has(phoneNumber);
        const campaignCount = counts.get(phoneNumber) || 0;
        return {
            phoneNumber, inCampaign, campaignCount, totalCampaigns,
            repeated: submitted && inCampaign && campaignCount >= 2,
            userPhone: phoneNumber === phone,
            manual: Boolean(record), note: record?.note || "",
            addedAt: record?.createdAt || null,
        };
    }).filter((row) => row.repeated || row.userPhone || row.manual)
        .sort((a, b) => Number(b.userPhone) - Number(a.userPhone) || b.campaignCount - a.campaignCount || a.phoneNumber.localeCompare(b.phoneNumber));
}
