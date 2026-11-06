import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import api from "@/api/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { failureReportEntries } from "../../../../../../shared/campaignFailure.js";
import { FailureContacts } from "./FailedCampaignReport";

export default function FailedCampaignReportEditor({ campaign }) {
  const [reason, setReason] = useState(campaign.draftReportNotes || campaign.publishedSpreadsheet?.notes || "");
  const client = useQueryClient();
  const navigate = useNavigate();
  const save = useMutation({
    mutationFn: async () => (await api.put(`/campaigns/${campaign._id}/recipients-management`, { entries: [], saveMode: "draft", spreadsheetRevision: campaign.spreadsheetRevision || 0, reportNotes: reason.trim() })).data.data,
    onSuccess: (saved) => {
      client.setQueryData(["campaign-detail", campaign._id], saved);
      client.invalidateQueries({ queryKey: ["campaign-report", campaign._id] });
      toast.add({ title: "Failure report draft saved", type: "success" });
      navigate(`/admin/campaigns/${campaign._id}/report`);
    },
    onError: (error) => toast.add({ title: error.message || "Could not save the failure report", type: "error" }),
  });
  return <form data-tour="report-editor" className="space-y-5" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5"><label htmlFor="failure-reason" className="text-sm font-semibold">Reason for failure <span className="text-destructive">*</span></label><p className="mb-3 mt-1 text-xs leading-5 text-muted-foreground">Explain why this campaign failed. The campaign creator will see this note after you publish the report.</p><Textarea id="failure-reason" required maxLength={4000} value={reason} onChange={(event) => setReason(event.target.value)} rows={4} placeholder="Explain why the campaign could not be completed..." className="resize-y" /><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">The full refund is posted on publication. Saving a draft does not change credits.</p><Button type="submit" size="sm" disabled={save.isPending || !reason.trim()}>{save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}Save and review</Button></div></section>
    <FailureContacts rows={failureReportEntries(campaign)} />
  </form>;
}
