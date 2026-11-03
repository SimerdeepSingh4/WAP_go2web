import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import api from "@/api/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { QueryState, StatusBadge } from "@/features/admin/components/shared";
import { dateTime, number, ownerName, published } from "@/features/admin/lib/format";

export default function ReadOnlyCampaignDetail({ id, onClose }) {
  const { user } = useAuth();
  const query = useQuery({ queryKey: [user?.role === "Reseller" ? "reseller" : "user", user?.id || user?._id, "campaign", { id }], queryFn: async ({ signal }) => (await api.get(`/campaigns/${id}`, { signal })).data, enabled: Boolean(id && user) });
  const campaign = query.data?.data;
  return <Sheet open onOpenChange={open => { if (!open) onClose(); }}><SheetContent className="w-full overflow-y-auto sm:max-w-xl">
    <SheetHeader><SheetTitle className="break-words">{campaign?.campaignTitle || "Campaign details"}</SheetTitle><SheetDescription>Submission details and published results.</SheetDescription></SheetHeader>
    <div className="space-y-6 p-5"><QueryState query={query}>{campaign && <>
      <div className="flex flex-wrap justify-between gap-3"><StatusBadge status={campaign.status} /><span className="text-sm text-muted-foreground">{ownerName(campaign.userId)}</span></div>
      <dl className="dashboard-details">{[["Recipients", number(campaign.totalRecipients)], ["Submitted", dateTime(campaign.createdAt)], ["Requested schedule", campaign.schedule === "later" ? dateTime(campaign.scheduledTime) : "As soon as approved"], ["Description", campaign.campaignDescription || "—"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <section><h2 className="mb-3 font-medium">Message</h2><p className="whitespace-pre-wrap break-words rounded-lg border bg-muted/40 p-4">{campaign.messageBody || campaign.templateId?.body || "Media only"}</p>
        {["images", "video", "audio", "documents"].map(type => campaign[type]?.length > 0 && <div className="mt-3" key={type}><h3 className="text-sm font-medium capitalize">{type}</h3>{campaign[type].map((media, index) => <p key={index} className="break-words text-sm text-muted-foreground">{media.filename || `Attachment ${index + 1}`}</p>)}</div>)}
      </section>
      <section><h2 className="mb-3 font-medium">Reported results</h2>{published(campaign) ? <><dl className="dashboard-details">{["sent", "delivered", "read", "failed"].map(key => <div key={key}><dt className="capitalize">{key}</dt><dd>{number(campaign.campaignSummary[key])}</dd></div>)}</dl><p className="mt-3 text-xs text-muted-foreground">Published {dateTime(campaign.campaignSummary.reportedAt)}</p>{campaign.campaignSummary.adminNotes && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{campaign.campaignSummary.adminNotes}</p>}</> : <p className="dashboard-note">No results have been published yet.</p>}</section>
      <p className="text-sm text-muted-foreground">Campaign approval and status changes are managed by the super admin.</p>
    </>}</QueryState></div>
  </SheetContent></Sheet>;
}
