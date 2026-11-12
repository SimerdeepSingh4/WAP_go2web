import CampaignReference from "@/components/dashboard/CampaignReference";
import { Link } from "react-router";
import { ArrowLeft, Download, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/features/admin/components/shared";
import { dateTime, ownerName } from "@/features/admin/lib/format";
import UserAvatar from "@/components/dashboard/UserAvatar";
import SupportHelpButton from "@/features/support/components/SupportHelpButton";

export default function CampaignReportHeader({
  campaign,
  base,
  id,
  rate,
  isAdmin,
  isDirty,
  isSaving,
  onExportCSV,
  onSaveReport,
}) {
  const isPublished = Boolean(campaign?.campaignSummary?.reportedAt);

  return (
    <header className="space-y-3">
      <Link
        to={isAdmin ? `${base}/campaigns/${id}` : `${base}/campaigns`}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-3.5" />
        {isAdmin ? "Back to campaign details" : "Back to campaigns"}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground break-words">
              {campaign.campaignTitle}
            </h1><CampaignReference campaign={campaign} />
            <StatusBadge status={campaign.status} />
            {isPublished && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <ShieldCheck className="size-3.5" /> Final Report
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isAdmin ? (
              <>
                Delivery report for{" "}
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80"><UserAvatar user={campaign.userId} className="size-6" />{ownerName(campaign.userId)}</span>
                {campaign.userId?.role ? ` (${campaign.userId.role})` : ""} · {rate} credits per message · Submitted{" "}
                {dateTime(campaign.createdAt)}
                {isPublished && ` · Published ${dateTime(campaign.campaignSummary.reportedAt)}`}
              </>
            ) : (
              <>
                Final delivery and credit report · {rate} credits per message · Submitted {dateTime(campaign.createdAt)}
                {isPublished && ` · Published on ${dateTime(campaign.campaignSummary.reportedAt)}`}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SupportHelpButton campaign={campaign} area="this campaign report" />
          <Button variant="outline" size="sm" onClick={onExportCSV} className="gap-1.5 text-xs">
            <Download className="size-3.5" />
            Export CSV
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              onClick={onSaveReport}
              disabled={isSaving || !isDirty}
              className="gap-1.5 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-white font-medium text-xs"
            >
              <ShieldCheck className="size-4" />
              {isSaving ? "Saving…" : "Save report"}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
