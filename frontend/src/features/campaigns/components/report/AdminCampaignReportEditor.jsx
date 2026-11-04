import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Loader2, Pencil, RefreshCw } from "lucide-react";
import api from "@/api/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { dateTime, number, ownerName } from "@/features/admin/lib/format";
import { buildCampaignReportPreview } from "../../lib/reportPreview";
import PublishedSpreadsheetReport from "./PublishedSpreadsheetReport";

export default function AdminCampaignReportEditor({ campaign, base, onRefresh, isRefreshing }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishedRevision, setPublishedRevision] = useState(null);
  const preview = useMemo(() => {
    try { return { campaign: buildCampaignReportPreview(campaign) }; }
    catch (error) { return { error: error.message }; }
  }, [campaign]);
  const sheet = preview.campaign?.publishedSpreadsheet;
  const creditDelta = (sheet?.summary.creditsRefunded || 0) - (campaign.campaignSummary?.creditsRefunded || 0);
  const publishedAt = campaign.publishedSpreadsheet?.publishedAt;
  const justPublished = publishedRevision === (campaign.spreadsheetRevision || 0);
  const publish = useMutation({
    mutationFn: async () => {
      const response = await api.put(`/campaigns/${campaign._id}/recipients-management`, {
        entries: campaign.recipientEntries,
        spreadsheetColumns: campaign.spreadsheetColumns,
        spreadsheetRevision: campaign.spreadsheetRevision || 0,
        customTabs: campaign.customRecipientTabs,
        recipientCategoryLabels: campaign.recipientCategoryLabels,
        reportNotes: sheet.notes,
        saveMode: "publish",
        status: campaign.status === "failed" ? "failed" : "completed",
      });
      return response.data.data;
    },
    onSuccess: (saved) => {
      setConfirmOpen(false);
      setPublishedRevision(saved.spreadsheetRevision);
      queryClient.setQueryData(["campaign-report", campaign._id], saved);
      queryClient.setQueryData(["campaign-detail", campaign._id], saved);
      queryClient.invalidateQueries({ queryKey: ["campaign-report", campaign._id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-detail", campaign._id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
      toast.add({ title: "Report published", description: "The campaign owner can now view this report.", type: "success" });
    },
    onError: (error) => {
      setConfirmOpen(false);
      toast.add({ title: error.response?.status === 409 ? "The saved campaign changed. Refresh and review it before publishing." : error.response?.data?.message || "Could not publish the report.", type: "error" });
    },
  });

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-5 pb-6">
      <Link to={`${base}/campaigns/${campaign._id}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Back to campaign</Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs text-muted-foreground">Review report</p>
          <h1 className="break-words text-xl font-semibold tracking-tight">{campaign.campaignTitle}</h1>
          <p className="text-xs text-muted-foreground">{ownerName(campaign.userId)}{publishedAt ? ` | Last published ${dateTime(publishedAt)}` : " | Not published"}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onRefresh} disabled={isRefreshing || publish.isPending}><RefreshCw className={"size-3.5 " + (isRefreshing ? "animate-spin" : "")} /> Refresh</Button>
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to={`${base}/campaigns/${campaign._id}`} />}><Pencil className="size-3.5" /> Edit campaign</Button>
          <Button type="button" size="sm" onClick={() => setConfirmOpen(true)} disabled={publish.isPending || isRefreshing || !sheet?.rows.length || justPublished}>{publish.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}{justPublished ? "Published" : publishedAt ? "Publish updates" : "Publish report"}</Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs">
        <div className="space-y-1"><p className="font-medium">Campaign owner preview</p><p className="text-[11px] text-muted-foreground">Saved campaign changes appear below. The owner sees this report as a read-only table after publication.</p></div>
        <span className="text-[11px] text-muted-foreground">{creditDelta > 0 ? `${number(creditDelta)} credits to refund` : creditDelta < 0 ? `${number(Math.abs(creditDelta))} credits to deduct` : "No credit adjustment"}</span>
      </div>
      {preview.error ? <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{preview.error} Return to the campaign to correct the report.</div> : <PublishedSpreadsheetReport campaign={preview.campaign} base={base} embedded />}
      <Dialog open={confirmOpen} onOpenChange={(open) => !publish.isPending && setConfirmOpen(open)}>
        <DialogContent className="gap-5 rounded-2xl p-5 sm:max-w-sm">
          <DialogHeader className="gap-1.5 pr-6"><DialogTitle>Publish this report?</DialogTitle><DialogDescription className="text-xs leading-5">{campaign.status === "failed" ? "This report will be visible to its owner. The campaign will stay failed with a full credit refund." : "The campaign will be completed and this report will be visible to its owner."}</DialogDescription></DialogHeader>
          <dl className="space-y-3 rounded-lg bg-muted/30 p-3 text-xs">
            <div className="flex justify-between gap-3"><dt>Recipients</dt><dd className="font-medium tabular-nums">{number(sheet?.rows.length || 0)}</dd></div>
            <div className="flex justify-between gap-3"><dt>Credit adjustment</dt><dd className="font-medium tabular-nums">{creditDelta > 0 ? `Refund ${number(creditDelta)}` : creditDelta < 0 ? `Deduct ${number(Math.abs(creditDelta))}` : "0"} credits</dd></div>
          </dl>
          <DialogFooter className="m-0 flex-row justify-end rounded-none border-0 bg-transparent p-0"><Button variant="ghost" size="sm" onClick={() => setConfirmOpen(false)} disabled={publish.isPending}>Cancel</Button><Button size="sm" onClick={() => publish.mutate()} disabled={publish.isPending || isRefreshing}>{publish.isPending && <Loader2 className="size-3.5 animate-spin" />}Publish report</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
