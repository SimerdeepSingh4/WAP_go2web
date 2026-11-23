import CampaignReference from "@/features/campaigns/components/CampaignReference";
import { Link } from "react-router";
import { ArrowLeft, Check, Clock, FileBarChart2, RefreshCw, RotateCcw, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/features/dashboard/components/shared";
import { dateTime } from "@/lib/format";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";

export default function PendingCampaignReport({ campaign, base, onRefresh, isRefreshing }) {
  const audience = campaign.recipientCount ?? campaign.totalRecipients ?? campaign.recipients?.length ?? 0;
  const failed = campaign.status === "failed";
  const refunded = campaign.campaignSummary?.creditsRefunded || 0;

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5 pb-6">
      <Link to={`${base}/campaigns`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-3.5" /> Back to campaigns</Link>
      <header className="space-y-2">
        <p className="text-xs text-muted-foreground">Campaign report</p>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{campaign.campaignTitle}</h1><CampaignReference campaign={campaign} />
          <StatusBadge status={campaign.status} />
        </div>
        <p className="text-xs text-muted-foreground">Submitted {dateTime(campaign.createdAt)}</p>
      </header>

      <OverviewMetricCards label="Campaign summary" columns={4} items={[
        { label: "Recipients", value: audience, icon: Users, caption: "Submitted audience", accent: true },
        { label: "Credits charged", value: campaign.creditsDeducted || 0, icon: Wallet, caption: "Charged at submission" },
        { label: "Credits refunded", value: refunded, icon: RotateCcw, caption: refunded > 0 ? "Returned to your wallet" : "No refunds recorded" },
        { label: "Net credits used", value: Math.max(0, (campaign.creditsDeducted || 0) - refunded), icon: Coins, caption: "Net Campaign Credits", tone: "purple" },
      ]} />

      <section aria-labelledby="pending-report-title" className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-start gap-4 p-5 sm:p-6">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted/60 text-muted-foreground"><FileBarChart2 className="size-5" /></div>
          <div className="min-w-0 space-y-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300"><Clock className="size-3" /> Report not published</span>
            <h2 id="pending-report-title" className="text-base font-semibold tracking-tight text-foreground sm:text-lg">{failed ? "This campaign was marked as failed" : "Waiting for the final report"}</h2>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">{failed ? "The administrator has marked this campaign as failed. Your credit refund is shown above. Recipient details will appear here when the report is published." : "Your report will appear here once the administrator publishes it, including recipient results and final credit adjustments."}</p>
            <p className="flex items-center gap-1.5 pt-1 text-[11px] text-muted-foreground"><Check className="size-3.5" /> No action needed from you</p>
          </div>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/15 px-5 py-3 sm:px-6">
          <p role="status" aria-live="polite" className="text-[11px] text-muted-foreground">{isRefreshing ? "Checking for updates..." : "You can check for updates at any time."}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing} className="gap-1.5"><RefreshCw className={"size-3.5 " + (isRefreshing ? "animate-spin" : "")} />{isRefreshing ? "Checking..." : "Check for updates"}</Button>
        </footer>
      </section>
    </div>
  );
}
