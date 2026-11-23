import CampaignReference from "@/features/campaigns/components/CampaignReference";
import { Link } from "react-router";
import { ArrowLeft, Check, Coins, RefreshCw, RotateCcw, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { dateTime, statusLabels } from "@/lib/format";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";

function PendingReportIllustration() {
  return (
    <div className="relative flex size-28 shrink-0 items-center justify-center select-none" aria-hidden="true">
      {/* Background Dot Matrix Grid */}
      <svg
        className="absolute -left-1 -top-1 size-32 text-muted-foreground/25"
        viewBox="0 0 120 120"
        fill="none"
      >
        <pattern id="pending-dot-matrix" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="8" cy="8" r="1.3" fill="currentColor" />
        </pattern>
        <rect width="120" height="120" fill="url(#pending-dot-matrix)" />
      </svg>

      {/* Stacked Documents with Clock Badge */}
      <svg
        viewBox="0 0 100 100"
        className="relative size-24 drop-shadow-sm"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Back document (tilted slightly left) */}
        <g transform="rotate(-8 45 50)">
          <rect
            x="20"
            y="14"
            width="46"
            height="58"
            rx="6"
            className="fill-card stroke-slate-800 dark:stroke-slate-200"
            strokeWidth="1.8"
          />
          <line x1="28" y1="26" x2="48" y2="26" className="stroke-muted-foreground/35" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="28" y1="34" x2="56" y2="34" className="stroke-muted-foreground/35" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="28" y1="42" x2="50" y2="42" className="stroke-muted-foreground/35" strokeWidth="2.5" strokeLinecap="round" />
        </g>

        {/* Front document (upright) */}
        <g transform="translate(10, 8)">
          <rect
            x="22"
            y="16"
            width="46"
            height="58"
            rx="6"
            className="fill-card stroke-slate-800 dark:stroke-slate-200"
            strokeWidth="1.8"
          />
          <line x1="30" y1="28" x2="52" y2="28" stroke="#a7d5bc" strokeWidth="3.2" strokeLinecap="round" />
          <line x1="30" y1="38" x2="60" y2="38" stroke="#a7d5bc" strokeWidth="3.2" strokeLinecap="round" />
          <line x1="30" y1="48" x2="54" y2="48" stroke="#a7d5bc" strokeWidth="3.2" strokeLinecap="round" />

          {/* Clock badge in bottom-right corner */}
          <g transform="translate(50, 56)">
            <circle cx="12" cy="12" r="11" fill="#b9dfcc" className="stroke-slate-800 dark:stroke-slate-200" strokeWidth="1.8" />
            <path
              d="M12 6.5V12.5H16"
              className="stroke-slate-800 dark:stroke-slate-200"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}

export default function PendingCampaignReport({ campaign, base, onRefresh, isRefreshing }) {
  const audience = campaign.recipientCount ?? campaign.totalRecipients ?? campaign.recipients?.length ?? 0;
  const failed = campaign.status === "failed";
  const refunded = campaign.campaignSummary?.creditsRefunded || 0;
  const statusText = statusLabels[campaign.status] || "Pending";

  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl space-y-6 pb-8">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to={`${base}/campaigns`}
          className="inline-flex items-center gap-1.5 font-medium transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Campaigns
        </Link>
        <span className="text-muted-foreground/60">/</span>
        <span className="text-muted-foreground">Campaign report</span>
      </nav>

      {/* Campaign Header: Title + Status Badge on left, Reference + Date on right */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {campaign.campaignTitle}
          </h1>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-xs font-medium ${
              failed
                ? "border-red-300/70 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300"
                : "border-amber-300/70 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300"
            }`}
          >
            <span className={`size-1.5 rounded-full ${failed ? "bg-red-500" : "bg-amber-500"}`} />
            {statusText}
          </span>
        </div>

        <div className="flex flex-col items-start gap-1 sm:items-end">
          <CampaignReference campaign={campaign} />
          <p className="text-xs text-muted-foreground">
            Submitted {dateTime(campaign.createdAt)}
          </p>
        </div>
      </header>

      {/* KPI Cards: Maintaining current portal gradient colors */}
      <OverviewMetricCards
        label="Campaign summary"
        columns={4}
        items={[
          {
            label: "Recipients",
            value: audience,
            icon: Users,
            caption: "Submitted audience",
            accent: true,
          },
          {
            label: "Credits charged",
            value: campaign.creditsDeducted || 0,
            icon: Wallet,
            caption: "Charged at submission",
            tone: "blue-filled",
          },
          {
            label: "Credits refunded",
            value: refunded,
            icon: RotateCcw,
            caption: refunded > 0 ? "Returned to your wallet" : "No refunds recorded",
            tone: "rose-filled",
          },
          {
            label: "Net credits used",
            value: Math.max(0, (campaign.creditsDeducted || 0) - refunded),
            icon: Coins,
            caption: "Net campaign credits",
            tone: "purple-filled",
          },
        ]}
      />

      {/* Waiting for Final Report Banner Card */}
      <section
        aria-labelledby="pending-report-title"
        className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm sm:p-8"
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <PendingReportIllustration />
            <div className="min-w-0 space-y-2">
              <h2
                id="pending-report-title"
                className="text-xl font-bold tracking-tight text-foreground sm:text-2xl"
              >
                {failed ? "This campaign was marked as failed" : "Waiting for the final report"}
              </h2>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {failed
                  ? "The administrator has marked this campaign as failed. Your credit refund is shown above. Recipient details will appear here when the report is published."
                  : "Recipient results and final credit adjustments will appear here once your administrator publishes the report."}
              </p>
              <p className="flex items-center gap-2 pt-1 text-sm font-medium text-foreground">
                <Check className="size-4 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                <span>No action needed from you</span>
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <Button
              type="button"
              size="lg"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="h-11 rounded-xl bg-[#0c3928] px-6 text-sm font-medium text-white transition-colors hover:bg-[#07261a] dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              <RefreshCw className={`size-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Checking..." : "Check for updates"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
