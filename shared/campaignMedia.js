export const MAX_CAMPAIGN_MEDIA = 1;
export const SINGLE_MEDIA_MESSAGE = "Only one uploaded media attachment is allowed per campaign. Your profile photo is separate.";

export function campaignMediaCount({ files = {}, attachments = [], mediaId } = {}) {
  const uploaded = Object.values(files).reduce((total, items) => total + (Array.isArray(items) ? items.length : items ? 1 : 0), 0);
  return uploaded + attachments.length + (mediaId ? 1 : 0);
}

export function normalizeCampaignAttachments(value) {
  if (value == null || value === "") return [];
  let attachments = value;
  if (typeof value === "string") {
    try { attachments = JSON.parse(value); }
    catch { attachments = [value]; }
  }
  if (typeof attachments === "string") attachments = [attachments];
  if (!Array.isArray(attachments) || attachments.some(item => typeof item !== "string" || !item.trim())) {
    throw new Error("Attachments must contain valid media references.");
  }
  return attachments.map(item => item.trim());
}
