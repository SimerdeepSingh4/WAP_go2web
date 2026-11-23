import { Users, Coins, FileText, Calendar } from "lucide-react";
import { number, dateTime } from "@/lib/format";
import { campaignDetailSummary } from "../../lib/detailSummary";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";

export default function CampaignDetailMetrics({ campaign }) {
  const scheduleText =
    campaign.schedule === "now" || !campaign.scheduledTime
      ? "Immediate"
      : dateTime(campaign.scheduledTime);

  const rate =
    campaign.rateSnapshot ?? campaign.userId?.ratePerMsg ?? 12;
  const totalAudience =
    campaign.totalRecipients ||
    campaign.recipientCount ||
    campaign.recipients?.length ||
    0;
  const report = campaignDetailSummary(campaign);
  const formatType = campaign.messageType
    ? campaign.messageType.charAt(0).toUpperCase() + campaign.messageType.slice(1)
    : "Text";

  const isCategorized = Boolean(campaign.campaignCreditCharge || campaign.category === "CAMPAIGN");
  const captionCharged = isCategorized
    ? "Campaign Credits (1 credit / row)"
    : `${number(rate)} ${rate === 1 ? "credit" : "credits"} / message`;

  return (
    <OverviewMetricCards label="Campaign summary" items={[
      { label: "Recipients", icon: Users, value: totalAudience, caption: "Submitted audience", accent: true },
      { label: "Credits charged", icon: Coins, value: campaign.creditsDeducted || 0, caption: captionCharged },
      {
        label: "Delivery report", icon: FileText,
        value: report.reportLabel || report.delivered,
        valueSuffix: report.reportLabel ? undefined : "delivered",
        valueSize: report.reportLabel ? "text" : undefined,
        caption: report.refunded > 0
          ? `${number(report.refunded)} credits refunded · ${number(Math.max(0, report.charged - report.refunded))} net credits used`
          : campaign.status === "failed" ? "Refund is posted when the failure report is published" : "No refunds recorded",
      },
      { label: "Schedule", icon: Calendar, value: scheduleText, valueSize: "text", caption: `Format: ${formatType}` },
    ]} />
  );
}
