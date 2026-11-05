import { buildPublishedSheet, normalizeDuplicateRows } from "../../../../../shared/campaignSpreadsheet.js";
import { failureReportSheet } from "../../../../../shared/campaignFailure.js";

// Use the same evaluator and saved rows as publication, never the older snapshot.
export function buildCampaignReportPreview(campaign) {
  if (campaign.status === "failed") return { ...campaign, publishedSpreadsheet: failureReportSheet(campaign, campaign.draftReportNotes || campaign.publishedSpreadsheet?.notes || "") };
  const entries = normalizeDuplicateRows(campaign.recipientEntries || []);
  const sheet = buildPublishedSheet(entries, campaign.spreadsheetColumns);
  const rate = campaign.rateSnapshot ?? campaign.userId?.ratePerMsg ?? 12;
  const refunded = entries.filter((row) => row.billingAction === "refund").length;
  let creditsRefunded = Math.min(Math.round(refunded * rate * 100) / 100, campaign.creditsDeducted || 0);
  if (campaign.status === "failed") creditsRefunded = campaign.creditsDeducted || 0;
  if (campaign.userId?.role === "Super Admin") creditsRefunded = campaign.campaignSummary?.creditsRefunded || 0;
  return {
    ...campaign,
    publishedSpreadsheet: {
      ...sheet,
      notes: campaign.draftReportNotes ?? campaign.campaignSummary?.adminNotes ?? "",
      summary: {
        total: entries.length,
        delivered: entries.filter((row) => ["delivered", "read"].includes(row.status)).length,
        refunded,
        creditsRefunded,
        creditsCharged: campaign.creditsDeducted || 0,
      },
    },
  };
}
