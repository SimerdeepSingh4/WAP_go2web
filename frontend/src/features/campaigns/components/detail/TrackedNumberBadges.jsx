import { UserRound } from "lucide-react";

export default function TrackedNumberBadges({ row, ownerName, showRepeated = true }) {
  if (!row || (!showRepeated && !row.userPhone && !row.manual && row.inCampaign)) return null;
  return <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-sans text-[10px] text-muted-foreground">
    {showRepeated && row.repeated && <span className="font-medium text-amber-700 dark:text-amber-400">Repeated</span>}
    {row.userPhone && <span className="inline-flex max-w-full items-start gap-1 rounded-md border border-blue-200 bg-blue-100/70 px-1.5 py-0.5 font-semibold text-blue-800 dark:border-blue-800 dark:bg-blue-900/40 dark:text-blue-200"><UserRound aria-hidden="true" className="mt-0.5 size-3 shrink-0" /><span className="min-w-0 break-words [overflow-wrap:anywhere]">{ownerName ? `${ownerName}’s own phone` : "Account owner’s phone"}</span></span>}
    {row.manual && <span>Manually added</span>}
    {!row.inCampaign && <span>Not in this campaign</span>}
  </span>;
}
