export const SUPPORT_REFERENCE_LIMIT = 5;
export const SUPPORT_TEXT_LIMIT = 4000;

// Keep references in the saved message text so they survive refreshes and are
// readable by every existing support client, notification, and export.
export function buildSupportText(draft, references = []) {
  const details = references.map(reference => `${reference.label}: ${reference.value}`).join("\n");
  return [draft.trim(), details].filter(Boolean).join("\n\n");
}

export function supportContext({ campaign, transaction, area = "your account" } = {}) {
  const references = [];
  const campaignId = campaign?.campaignId || (campaign?._id ? `CMP-${String(campaign._id).toUpperCase()}` : "");
  const transactionId = transaction?.transactionId || (transaction?._id ? `TXN-${String(transaction._id).toUpperCase()}` : "");
  if (campaignId) references.push({ type: "campaign", label: "Campaign ID", value: campaignId });
  if (transactionId) references.push({ type: "transaction", label: "Transaction ID", value: transactionId });
  const subject = campaignId ? `Help with campaign: ${campaign.campaignTitle || campaignId}` : transactionId ? `Help with transaction: ${transactionId}` : `Help with ${area.toLowerCase()}`;
  return { subject: subject.slice(0, 150), text: `I need help with ${area.toLowerCase()}.`, references };
}
