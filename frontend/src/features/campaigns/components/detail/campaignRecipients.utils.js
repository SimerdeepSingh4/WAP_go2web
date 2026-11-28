import { campaignContactRows } from "../../../../../../shared/campaignContacts.js";

export function buildCampaignContacts(campaign) {
  return campaign ? campaignContactRows(campaign) : [];
}

export function getRepeatedCampaigns(row, currentCampaignId, campaignsById) {
  if (!row?.campaignIds?.length || !campaignsById) return [];
  const currentId = currentCampaignId ? String(currentCampaignId) : "";
  return row.campaignIds
    .filter((cid) => cid !== currentId)
    .map((cid) => campaignsById[cid])
    .filter(Boolean);
}
