export default function TrackedNumberBadges({ row, showRepeated = true }) {
  if (!row || (!showRepeated && !row.userPhone && !row.manual && row.inCampaign)) return null;
  return <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-sans text-[10px] text-muted-foreground">
    {showRepeated && row.repeated && <span className="font-medium text-amber-700 dark:text-amber-400">Repeated</span>}
    {row.userPhone && <span className="font-medium text-foreground">User Phone</span>}
    {row.manual && <span>Manually added</span>}
    {!row.inCampaign && <span>Not in this campaign</span>}
  </span>;
}
