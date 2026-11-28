import { Link } from "react-router";
import { UserRound } from "lucide-react";
import { getRepeatedCampaigns } from "./campaignRecipients.utils";

export default function TrackedNumberBadges({ row, ownerName, campaignsById, currentCampaignId, showRepeated = true }) {
  if (!row || (!showRepeated && !row.userPhone && !row.manual && row.inCampaign)) return null;
  const priorCampaigns = showRepeated && row.repeated ? getRepeatedCampaigns(row, currentCampaignId, campaignsById) : [];
  const extraCount = priorCampaigns.length > 1 ? priorCampaigns.length - 1 : 0;

  return <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[10px] text-muted-foreground">
    {showRepeated && row.repeated && (
      <span
        className="inline-flex flex-wrap items-center gap-1 font-medium text-amber-700 dark:text-amber-400"
        title={priorCampaigns.length ? `Repeated in: ${priorCampaigns.map((c) => c.title).join(", ")}` : undefined}
      >
        <span>Repeated</span>
        {priorCampaigns.length > 0 && (
          <span className="font-normal text-muted-foreground">
            in{" "}
            <Link
              to={`/admin/campaigns/${priorCampaigns[0].id}`}
              className="font-medium text-foreground underline decoration-border underline-offset-2 hover:text-primary"
            >
              {priorCampaigns[0].title}
            </Link>
            {extraCount > 0 ? ` +${extraCount} more` : ""}
          </span>
        )}
      </span>
    )}
    {row.userPhone && <span className="inline-flex max-w-full items-start gap-1 rounded-md border border-blue-200 bg-blue-100/70 px-1.5 py-0.5 font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-200"><UserRound aria-hidden="true" className="mt-0.5 size-3 shrink-0" /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{ownerName ? `${ownerName}’s own phone` : "Account owner’s phone"}</span></span>}
    {row.manual && <span>Manually added</span>}
    {!row.inCampaign && <span>Not in this campaign</span>}
  </span>;
}
