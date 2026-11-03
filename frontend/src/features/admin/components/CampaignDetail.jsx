import { useState, useEffect } from "react";
import { FileText, Pencil, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { CampaignMessage, CampaignMedia } from "@/components/dashboard/CampaignContent";

export default function CampaignDetail({ id, initialReport, initialStatus, onClose }) {
  const query = useAdminQuery("campaign", { id });
  const [action, setAction] = useState(initialReport ? "report" : null);
  const [showWarningModal, setShowWarningModal] = useState(false);
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
                    <span className="text-xs text-muted-foreground">{ownerName(campaign.userId)}</span>
                  </div>

                  <dl className="grid grid-cols-2 gap-4 text-sm">
                    {[
                      ["Recipients", number(campaign.totalRecipients)],
                      ["Submitted", dateTime(campaign.createdAt)],
                      ["Requested schedule", campaign.schedule === "later" ? dateTime(campaign.scheduledTime) : "Immediate / As soon as available"],
                      ["Content type", campaign.messageType || "Standard text"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="mt-1 break-words font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>

                  <section className="space-y-2">
                    <h2 className="text-sm font-medium">Message content</h2>
                    <CampaignMessage content={campaign.messageBody || campaign.templateId?.body} />
                    <CampaignMedia campaign={campaign} />
                  </section>

                  <section className="space-y-3 border-t pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-medium">Campaign results</h2>
                      <Button size="sm" variant="outline" onClick={() => setAction("report")}>
                        <FileText />
                        {reported ? "Update report" : "Publish report"}
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
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-sm font-medium">Campaign Status</h2>
                        <p className="text-xs text-muted-foreground">
                          Current status: <strong className="text-foreground">{statusLabels[campaign.status] || campaign.status}</strong>. You can change status at any stage.
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={handleStatusClick} className="gap-1.5">
                        <Pencil className="size-3.5" />
                        Change status
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

      {campaign && action === "report" && (
        <ActionForm
          title={reported ? "Update report" : "Publish report"}
          description="Enter campaign results to publish the report."
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
          title="Change Campaign Status"
          description={
            isFinalized
              ? `Warning: This campaign was already marked as ${statusLabels[campaign.status] || campaign.status}.`
              : "Choose the new status for this campaign."
          }
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
                Status will change from{" "}
                <strong className="text-foreground">{statusLabels[campaign.status] || campaign.status}</strong>{" "}
                → <strong className="text-primary">{statusLabels[values.status] || values.status}</strong>
              </p>
              {isFinalized && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 mt-2 flex items-start gap-2">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                  <span>
                    Warning: You are modifying a previously <strong>{statusLabels[campaign.status]}</strong> campaign.
                  </span>
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
