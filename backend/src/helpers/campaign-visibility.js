import { publicAccountIdentity } from "./account-identity.js";

export function campaignPublicStatus(campaign) {
    if (campaign.publicStatus) return campaign.publicStatus;
    if (["completed", "sent", "failed"].includes(campaign.status) && !campaign.publishedSpreadsheet?.publishedAt) return campaign.campaignStartDate ? "ongoing" : "pending";
    return campaign.status;
}

export function publicCampaignView(campaign) {
    const view = campaign.toObject ? campaign.toObject() : { ...campaign };
    view.userId = publicAccountIdentity(view.userId);
    delete view.recipientInputAudit;
    view.status = campaignPublicStatus(view);
    if (!["completed", "sent", "failed"].includes(view.status)) view.campaignEndDate = null;
    const sheet = view.publishedSpreadsheet;
    if (!sheet?.publishedAt) {
        view.campaignSummary = { sent: 0, delivered: 0, read: 0, failed: 0, creditsRefunded: view.settledRefundCredits || 0, categories: [], adminNotes: "", reportedAt: null, reportedBy: null };
        view.recipientReport = { records: [], uploadedAt: null };
        if (view.recipientEntries) view.recipientEntries = view.recipientEntries.map((row) => ({ rowNumber: row.rowNumber, phoneNumber: row.phoneNumber, status: "queued", category: "All" }));
        if (view.recipients) view.recipients = view.recipients.map((row) => ({ ...row, status: "queued" }));
    } else if (sheet.summary) {
        view.campaignSummary = { ...view.campaignSummary, delivered: sheet.summary.delivered || 0, failed: sheet.summary.failed ?? view.campaignSummary?.failed ?? 0, read: sheet.summary.read || 0, creditsRefunded: view.settledRefundCredits ?? sheet.summary.creditsRefunded ?? 0, adminNotes: sheet.notes || "" };
    }
    delete view.publicStatus;
    return view;
}

export const publicCampaignStatusStage = { $set: { status: { $ifNull: ["$publicStatus", { $cond: [
    { $and: [{ $in: ["$status", ["completed", "sent", "failed"]] }, { $not: [{ $ifNull: ["$publishedSpreadsheet.publishedAt", false] }] }] },
    { $cond: [{ $ifNull: ["$campaignStartDate", false] }, "ongoing", "pending"] }, "$status",
] }] } } };
