import { Users, Coins, FileText, Calendar } from "lucide-react";
import { number, dateTime } from "@/features/admin/lib/format";
import { campaignDetailSummary } from "../../lib/detailSummary";

function MetricCard({ label, value, hint, icon: Icon }) {
  return (
    <div className="min-w-0 bg-card px-4 py-4">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5 shrink-0" />{label}
      </dt>
      <dd className="mt-2 break-words text-xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
        {hint && <p className="mt-1 text-[11px] font-normal leading-5 tracking-normal text-muted-foreground">{hint}</p>}
      </dd>
    </div>
  );
}

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

  return (
    <dl
      className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-4"
      aria-label="Campaign summary"
    >
      <MetricCard
        label="Recipients"
        icon={Users}
        value={number(totalAudience)}
        hint="Submitted audience"
      />

      <MetricCard
        label="Credits charged"
        icon={Coins}
        value={number(campaign.creditsDeducted || 0)}
        hint={`${number(rate)} ${rate === 1 ? "credit" : "credits"} / message`}
      />

      <MetricCard
        label="Delivery report"
        icon={FileText}
        value={
          report.reportLabel ? (
            <span className="text-lg font-semibold text-foreground">{report.reportLabel}</span>
          ) : (
            <span>
              {number(report.delivered)}{" "}
              <span className="text-sm font-medium text-muted-foreground">delivered</span>
            </span>
          )
        }
        hint={
          report.refunded > 0
            ? `${number(report.refunded)} credits refunded · ${number(Math.max(0, report.charged - report.refunded))} net credits used`
            : campaign.status === "failed" ? "Refund is posted when the failure report is published" : "No refunds recorded"
        }
      />

      <MetricCard
        label="Schedule"
        icon={Calendar}
        value={<span className="text-base font-semibold">{scheduleText}</span>}
        hint={`Format: ${formatType}`}
      />
    </dl>
  );
}
