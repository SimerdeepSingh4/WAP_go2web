export function campaignDetailSummary(campaign) {
  const sheet = campaign.publishedSpreadsheet;
  const published = Boolean(sheet?.publishedAt);
  const refunded = campaign.settledRefundCredits ?? campaign.refundAccounting?.settled ?? sheet?.summary?.creditsRefunded ?? 0;
  const charged = campaign.creditsDeducted || 0;
  const failed = published && (sheet.status === "failed" || campaign.publicStatus === "failed");
  const pendingFailure = campaign.status === "failed" && !failed;
  const fullyRefunded = charged > 0 && refunded >= charged;
  return {
    published, refunded, charged,
    delivered: failed ? 0 : sheet?.summary?.delivered || 0,
    reportLabel: pendingFailure ? "Failure report pending" : !published ? "Not published" : failed ? "Failed" : fullyRefunded ? "Fully refunded" : null,
  };
}
