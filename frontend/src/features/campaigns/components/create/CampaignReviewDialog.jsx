import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FormError } from "@/features/admin/components/shared";
import { number, dateTime } from "@/features/admin/lib/format";
import { ClipboardCheck, Info, MessageSquare, Send } from "lucide-react";
import "./campaign-dialogs.css";

export default function CampaignReviewDialog({
  isOpen,
  onClose,
  isPending,
  campaignTitle,
  totalRecipients,
  estimate,
  estimatedCost,
  isAdmin,
  remainingBalance,
  scheduleType,
  scheduledTime,
  totalMediaCount,
  previewText,
  invalidCount,
  error,
  onSubmit,
}) {
  if (!isOpen) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="campaign-review-dialog" showCloseButton={!isPending}>
        <DialogHeader className="campaign-dialog-header">
          <span className="campaign-dialog-icon" aria-hidden="true"><ClipboardCheck /></span>
          <div><DialogTitle>Review campaign</DialogTitle>
          <DialogDescription>
            Credits are charged when the server accepts your submission. The super admin handles approval and processing.
          </DialogDescription></div>
        </DialogHeader>

        <dl className="campaign-review-details">
          {[
            ["Campaign", campaignTitle],
            ["Numbers entered", number(totalRecipients)],
            ["Rate per recipient", `${number(estimate.rate)} ${estimate.rate === 1 ? "credit" : "credits"}`],
            ["Estimated charge", `${number(estimatedCost)} credits`],
            ["Balance after submission", isAdmin ? "Unlimited" : `${number(remainingBalance)} credits`],
            ["Delivery", scheduleType === "later" ? dateTime(scheduledTime) : "As soon as approved"],
            ["Attachments", number(totalMediaCount)],
          ].map(([label, value]) => (
            <div key={label} data-highlight={label === "Estimated charge" || undefined}>
              <dt>{label}</dt>
              <dd>
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {previewText && (
          <div className="campaign-review-message"><h3><MessageSquare aria-hidden="true" />Message preview</h3><p>{previewText}</p></div>
        )}

        <p className="campaign-review-note"><Info aria-hidden="true" /><span>
          {isAdmin && invalidCount > 0 ? `${number(invalidCount)} entries need review. ` : ""}
          The server confirms the final charge.
        </span></p>

        <FormError message={error?.response?.data?.message || error?.message} />

        <div className="campaign-dialog-footer">
          <Button
            variant="outline"
            disabled={isPending}
            onClick={onClose}
          >
            Back to edit
          </Button>
          <Button
            disabled={isPending}
            onClick={onSubmit}
          >
            <Send aria-hidden="true" />
            {isPending ? "Submitting…" : "Submit campaign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

