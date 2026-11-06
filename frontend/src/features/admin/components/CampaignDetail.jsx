import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAdminQuery } from "../hooks/useAdmin";
import { QueryState, StatusBadge } from "./shared";
import { dateTime, number, ownerName, published, statusLabels, validateReport } from "../lib/format";
import ActionForm from "./ActionForm";
import { CampaignMessage, CampaignMedia, CampaignRecipients } from "@/components/dashboard/CampaignContent";
import api from "@/api/client";
import { toast } from "@/components/ui/toast";
import UserAvatar from "@/components/dashboard/UserAvatar";

export default function CampaignDetail({ id, initialReport, initialStatus, onClose }) {
  const query = useAdminQuery("campaign", { id });
  const [action, setAction] = useState(initialReport ? "report" : null);
  const [recipientReportOpen, setRecipientReportOpen] = useState(false);
  const [recipientColumns, setRecipientColumns] = useState({
    whatsapp_successful: "",
    non_whatsapp_failed: "",
    spam: "",
  });
  const [showWarningModal, setShowWarningModal] = useState(false);
  const reportFileRef = useRef(null);
  const queryClient = useQueryClient();
  const uploadRecipientReport = useMutation({
    mutationFn: async (file) => {
      const body = new FormData();
      body.append("file", file);
      return (await api.post(`/campaigns/${id}/recipient-report`, body)).data;
    },
    onSuccess: async (data) => {
      toast.add({ title: data.message, type: "success" });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast.add({ title: "Report upload failed", description: error.message, type: "error" }),
  });
  const campaign = query.data?.data;
  const summary = campaign?.campaignSummary;
  const reported = campaign && published(campaign);
  const operational = Boolean(campaign);

  const isFinalized = Boolean(
    campaign && ["stopped", "completed", "sent", "failed"].includes(campaign.status)
  );

  useEffect(() => {
    if (initialStatus && campaign) {
      if (isFinalized) {
        setShowWarningModal(true);
      } else {
        setAction("status");
      }
    }
  }, [initialStatus, Boolean(campaign), isFinalized]);

  const handleStatusClick = () => {
    if (isFinalized) {
      setShowWarningModal(true);
    } else {
      setAction("status");
    }
  };

  async function downloadReportFile(path, filename) {
    try {
      const response = await api.get(path, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.add({ title: "Report download failed", description: error.message, type: "error" });
    }
  }

  function openRecipientReportEditor() {
    const recordsByCategory = {
      whatsapp_successful: [],
      non_whatsapp_failed: [],
      spam: [],
    };
    for (const recipient of campaign?.recipientReport?.records || []) {
      recordsByCategory[recipient.category]?.push(recipient.phoneNumber);
    }
    setRecipientColumns({
      whatsapp_successful: recordsByCategory.whatsapp_successful.join("\n"),
      non_whatsapp_failed: recordsByCategory.non_whatsapp_failed.join("\n"),
      spam: recordsByCategory.spam.join("\n"),
    });
    setRecipientReportOpen(true);
  }

  function uploadPastedRecipientReport(event) {
    event.preventDefault();
    const categories = [
      ["whatsapp_successful", "WhatsApp Successful"],
      ["non_whatsapp_failed", "Non-WhatsApp Failed"],
      ["spam", "Spam"],
    ];
    const numbersByCategory = Object.fromEntries(
      categories.map(([key]) => [
        key,
        recipientColumns[key].split(/[\n,;\t]+/).map((number) => number.trim()).filter(Boolean),
      ])
    );
    const rowCount = Math.max(...Object.values(numbersByCategory).map((numbers) => numbers.length));
    if (!rowCount) {
      toast.add({ title: "Add campaign numbers", description: "Paste the numbers into their status columns.", type: "error" });
      return;
    }

    const csvRows = [categories.map(([, label]) => label)];
    for (let index = 0; index < rowCount; index += 1) {
      csvRows.push(categories.map(([key]) => numbersByCategory[key][index] || ""));
    }
    const csv = csvRows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const file = new File(["\uFEFF", csv], `campaign-${id}-recipient-report.csv`, { type: "text/csv" });
    uploadRecipientReport.mutate(file, {
      onSuccess: () => setRecipientReportOpen(false),
    });
  }

  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open && !action) onClose();
        }}
      >
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b p-5 pr-12">
            <SheetTitle className="break-words">{campaign?.campaignTitle || "Campaign details"}</SheetTitle>
            <SheetDescription>Review campaign content, progress, and reported results.</SheetDescription>
          </SheetHeader>
          <div className="space-y-6 p-5">
            <QueryState query={query}>
              {campaign && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <StatusBadge status={campaign.status} />
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><UserAvatar user={campaign.userId} className="size-8" />{ownerName(campaign.userId)}</span>
                  </div>

                  <dl className="text-sm divide-y">
                    {[
                      ["Recipients", number(campaign.totalRecipients)],
                      ["Submitted", dateTime(campaign.createdAt)],
                      ["Schedule", campaign.schedule === "later" ? dateTime(campaign.scheduledTime) : "Immediate"],
                      ["Type", campaign.messageType || "text"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-4 py-2">
                        <dt className="text-muted-foreground shrink-0">{label}</dt>
                        <dd className="break-words font-medium text-right">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <section className="space-y-2">
                    <h2 className="text-sm font-medium">Message content</h2>
                    <CampaignMessage content={campaign.messageBody || campaign.templateId?.body} />
                    <CampaignMedia campaign={campaign} />
                  </section>

                  <CampaignRecipients campaign={campaign} />

                  <section className="space-y-3 border-t pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-medium">Campaign results</h2>
                      <Button size="sm" variant="outline" onClick={() => setAction("report")}>
                        <FileText />
                        {reported ? "Update delivery totals" : "Publish delivery totals"}
                      </Button>
                    </div>
                    {reported ? (
                      <>
                        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {["sent", "delivered", "read", "failed"].map((key) => (
                            <div key={key} className="rounded-md border p-3">
                              <dt className="text-xs capitalize text-muted-foreground">{key}</dt>
                              <dd className="mt-1 text-lg font-semibold tabular-nums">{number(summary[key])}</dd>
                            </div>
                          ))}
                        </dl>
                        <p className="text-xs text-muted-foreground">Last report: {dateTime(summary.reportedAt)}</p>
                        {summary.adminNotes && <p className="whitespace-pre-wrap break-words text-sm">{summary.adminNotes}</p>}
                      </>
                    ) : (
                      <p className="rounded-md bg-muted p-4 text-sm text-muted-foreground">
                        Awaiting report. No delivery results have been published.
                      </p>
                    )}
                  </section>

                  <section className="space-y-3 border-t pt-5">
                    <div>
                      <h2 className="text-sm font-medium">Recipient report</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Paste every campaign number under its matching status column, or fill the prefilled Phone Number/Status template. Include every number exactly once.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={openRecipientReportEditor}
                      >
                        <Pencil className="size-4" />
                        {campaign.recipientReport?.uploadedAt ? "Edit number report" : "Enter number report"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadReportFile(`/campaigns/${id}/recipient-report/template`, `${id}-recipient-report-template.xlsx`)}
                      >
                        <FileText className="size-4" />
                        Download template
                      </Button>
                      {campaign.recipientReport?.uploadedAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadReportFile(`/campaigns/${id}/recipient-report`, `${campaign.campaignTitle}-report.xlsx`)}
                        >
                          Download published report
                        </Button>
                      )}
                      <input
                        ref={reportFileRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) uploadRecipientReport.mutate(file);
                          event.target.value = "";
                        }}
                      />
                      <Button
                        size="sm"
                        disabled={uploadRecipientReport.isPending}
                        onClick={() => reportFileRef.current?.click()}
                      >
                        <FileText className="size-4" />
                        {uploadRecipientReport.isPending ? "Uploading…" : "Upload completed report"}
                      </Button>
                    </div>
                    {campaign.recipientReport?.uploadedAt && (
                      <p className="text-xs text-muted-foreground">
                        Published {dateTime(campaign.recipientReport.uploadedAt)}
                      </p>
                    )}
                  </section>

                  <section className="space-y-2 border-t pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-medium">Campaign Status</h2>
                      <Button size="sm" variant="outline" onClick={handleStatusClick} className="gap-1.5 h-7 text-xs">
                        <Pencil className="size-3" />
                        {statusLabels[campaign.status] || campaign.status}
                      </Button>
                    </div>
                  </section>

                  <section className="space-y-3 border-t pt-5">
                    <h2 className="text-sm font-medium">Audience validation</h2>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        ["Submitted", campaign.recipientStats?.totalSubmitted],
                        ["Unique", campaign.recipientStats?.uniqueCount],
                        ["Duplicates", campaign.recipientStats?.duplicateCount],
                        ["Invalid", campaign.recipientStats?.invalidCount],
                      ].map(([label, value]) => (
                        <div key={label} className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd>{number(value)}</dd>
                        </div>
                      ))}
                    </dl>
                    {Boolean(campaign.recipientStats?.duplicatesList?.length) && (
                      <details className="text-xs">
                        <summary className="cursor-pointer py-2">View duplicate numbers</summary>
                        <p className="max-h-32 overflow-y-auto break-all rounded border p-3">
                          {campaign.recipientStats.duplicatesList.join(", ")}
                        </p>
                      </details>
                    )}
                  </section>
                </>
              )}
            </QueryState>
          </div>
        </SheetContent>
      </Sheet>

      {campaign && (
        <Dialog open={recipientReportOpen} onOpenChange={setRecipientReportOpen}>
          <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>Campaign number report</DialogTitle>
              <DialogDescription>
                Paste every number from {campaign.campaignTitle} into exactly one status column. The saved report will be reordered to match the original campaign sequence.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={uploadPastedRecipientReport} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ["whatsapp_successful", "WhatsApp Successful"],
                  ["non_whatsapp_failed", "Non-WhatsApp Failed"],
                  ["spam", "Spam"],
                ].map(([key, label]) => (
                  <label key={key} className="space-y-2 text-sm font-medium">
                    <span>{label}</span>
                    <Textarea
                      value={recipientColumns[key]}
                      onChange={(event) => setRecipientColumns((current) => ({ ...current, [key]: event.target.value }))}
                      placeholder="Paste one phone number per line"
                      rows={12}
                      className="font-mono text-xs"
                      aria-label={label}
                    />
                    <span className="text-xs font-normal text-muted-foreground">
                      {recipientColumns[key].split(/[\n,;\t]+/).filter((value) => value.trim()).length} numbers
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Every original campaign number must appear once. Unknown or repeated numbers will be rejected.
              </p>
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setRecipientReportOpen(false)} disabled={uploadRecipientReport.isPending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={uploadRecipientReport.isPending}>
                  {uploadRecipientReport.isPending ? "Saving…" : "Save number report"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {campaign && action === "report" && (
        <ActionForm
          title={reported ? "Update report" : "Publish report"}
          description="Enter campaign results to publish the report."
          draftKey={`admin-campaign-metrics:${id}`}
          action="report"
          successMessage="Campaign report published"
          onClose={() => setAction(null)}
          initialValues={{
            sent: reported ? String(summary.sent) : "",
            delivered: reported ? String(summary.delivered) : "",
            read: reported ? String(summary.read) : "",
            failed: reported ? String(summary.failed) : "",
            adminNotes: summary?.adminNotes || "",
            completion: "unchanged",
          }}
          fields={[
            ...["sent", "delivered", "read", "failed"].map((key) => ({
              key,
              label: key.charAt(0).toUpperCase() + key.slice(1),
              type: "number",
              required: true,
              min: 0,
              step: 1,
            })),
            {
              key: "adminNotes",
              label: "Customer-visible report note",
              type: "textarea",
              maxLength: 2000,
              hint: "Do not include internal account information or delivery credentials.",
            },
            {
              key: "completion",
              label: "Campaign status",
              options: [
                { value: "unchanged", label: "Keep current status" },
                { value: "completed", label: "Mark completed" },
              ],
            },
          ]}
          validate={(values) => validateReport(values, campaign.totalRecipients)}
          payload={(values) => ({
            id,
            sent: Number(values.sent),
            delivered: Number(values.delivered),
            read: Number(values.read),
            failed: Number(values.failed),
            adminNotes: values.adminNotes.trim(),
            ...(values.completion === "completed" ? { status: "completed" } : {}),
          })}
          review={(values) => (
            <>
              <p className="font-medium">{campaign.campaignTitle}</p>
              {["sent", "delivered", "read", "failed"].map((key) => (
                <p key={key} className="flex justify-between capitalize">
                  <span>{key}</span>
                  <strong>{number(Number(values[key]))}</strong>
                </p>
              ))}
              <p>Status: {values.completion === "completed" ? "Completed" : statusLabels[campaign.status]}</p>
              <p className="whitespace-pre-wrap break-words">{values.adminNotes || "No report note."}</p>
            </>
          )}
          submitLabel="Publish report"
        />
      )}

      {/* Warning Dialog when attempting to edit a Finalized Campaign */}
      <AlertDialog open={showWarningModal} onOpenChange={setShowWarningModal}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="size-5 shrink-0" />
              <AlertDialogTitle>Change Finalized Campaign Status?</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs text-muted-foreground pt-1 leading-relaxed">
              This campaign is currently marked as{" "}
              <strong className="text-foreground font-semibold">
                {statusLabels[campaign?.status] || campaign?.status}
              </strong>.
              Changing its status will reopen or alter an already finalized campaign. Are you sure you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-end">
            <AlertDialogCancel onClick={() => setShowWarningModal(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                setShowWarningModal(false);
                setAction("status");
              }}
            >
              Proceed to Change Status
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {campaign && action === "status" && (
        <ActionForm
          title="Update Status"
          description={`Campaign: ${campaign.campaignTitle}`}
          action="status"
          successMessage="Campaign status updated"
          onClose={() => setAction(null)}
          initialValues={{ status: "" }}
          fields={[
            {
              key: "status",
              label: "New status",
              required: true,
              options: [
                { value: "", label: "Choose status" },
                { value: "ongoing", label: campaign.status === "ongoing" ? "Ongoing (Current)" : "Ongoing" },
                { value: "completed", label: campaign.status === "completed" ? "Completed (Current)" : "Completed" },
                { value: "stopped", label: campaign.status === "stopped" ? "Stopped (Current)" : "Stopped" },
                { value: "failed", label: campaign.status === "failed" ? "Failed (Current)" : "Failed" },
                { value: "pending", label: campaign.status === "pending" ? "Pending (Current)" : "Pending" },
              ],
            },
          ]}
          payload={(values) => ({ id, status: values.status })}
          review={(values) => (
            <>
              <p className="font-medium">{campaign.campaignTitle}</p>
              <p className="text-sm">
                <span className="text-muted-foreground">Status: </span>
                <strong>{statusLabels[campaign.status] || campaign.status}</strong>
                {" → "}
                <strong className="text-primary">{statusLabels[values.status] || values.status}</strong>
              </p>
              {isFinalized && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 mt-2 flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>This campaign was already <strong>{statusLabels[campaign.status]}</strong>. Changing it will reopen it.</span>
                </div>
              )}
            </>
          )}
          submitLabel="Update status"
        />
      )}
    </>
  );
}
