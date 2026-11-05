import { originalCampaignEntries } from "./campaignContacts.js";

// A failed campaign reports the submitted audience, not the admin's categories
// or any additional rows later added to a report.
export function failureReportEntries(campaign) {
    return originalCampaignEntries(campaign).map(({ rowNumber, phoneNumber }) => ({
        rowNumber, phoneNumber,
        status: "failed", classification: "pending", category: "Campaign failed",
        tabKey: "all", billingAction: "refund", notes: "", cells: {},
    }));
}

export function failureReportSheet(campaign, notes = "") {
    const entries = failureReportEntries(campaign);
    return {
        status: "failed", notes,
        columns: [{ id: "phoneNumber", label: "Phone number", letter: "A", field: "phoneNumber", width: 210 }],
        rows: entries.map((entry) => ({ ...entry, values: { phoneNumber: entry.phoneNumber } })),
        summary: { total: entries.length, delivered: 0, failed: entries.length, read: 0, refunded: entries.length, creditsCharged: campaign.creditsDeducted || 0, creditsRefunded: campaign.creditsDeducted || 0 },
    };
}
