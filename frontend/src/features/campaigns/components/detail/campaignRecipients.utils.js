import { campaignContactRows } from "../../../../../../shared/campaignContacts.js";

export function buildCampaignContacts(campaign) {
  return campaign ? campaignContactRows(campaign) : [];
}
