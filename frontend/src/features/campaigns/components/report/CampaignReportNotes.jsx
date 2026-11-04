import { FileText } from "lucide-react";

export const STATUS_OPTIONS = [
  { value: "completed", label: "Completed (broadcast done)" },
  { value: "ongoing", label: "Ongoing (active dispatch)" },
  { value: "stopped", label: "Stopped / cancelled" },
  { value: "failed", label: "Failed / terminated" },
];

export default function CampaignReportNotes({
  isAdmin,
  adminNotes,
  onAdminNotesChange,
  campaignStatus,
  onCampaignStatusChange,
  campaign,
}) {
  if (isAdmin) {
    return (
      <section className="portal-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border">
          <FileText className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Report notes and final status</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="md:col-span-2 space-y-1.5">
            <label htmlFor="admin-notes" className="text-xs font-medium text-foreground">
              Notes shown to the client
            </label>
            <textarea
              id="admin-notes"
              rows={4}
              placeholder="e.g. Broadcast finished. Wrong and duplicate numbers were credited back to your wallet."
              value={adminNotes}
              onChange={(e) => onAdminNotesChange(e.target.value)}
              className="w-full rounded-lg border border-input bg-background p-3 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 resize-y"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="final-status" className="text-xs font-medium text-foreground">
              Campaign status
            </label>
            <select
              id="final-status"
              value={campaignStatus}
              onChange={(e) => onCampaignStatusChange(e.target.value)}
              className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 cursor-pointer"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Changes apply when you save the report.</p>
          </div>
        </div>
      </section>
    );
  }

  if (campaign.campaignSummary?.adminNotes) {
    return (
      <section className="portal-card p-5 space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Notes from the team</h2>
        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap rounded-lg bg-muted/30 border border-border p-3.5">
          {campaign.campaignSummary.adminNotes}
        </p>
      </section>
    );
  }

  return null;
}

