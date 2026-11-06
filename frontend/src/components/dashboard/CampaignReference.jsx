import RecordReference from "./RecordReference";

export default function CampaignReference({ campaign, compact = false }) {
  const id = campaign.campaignId || (campaign._id ? `CMP-${String(campaign._id).toUpperCase()}` : "");
  return <RecordReference id={id} prefix="CMP" label="Campaign ID" compact={compact} />;
}
