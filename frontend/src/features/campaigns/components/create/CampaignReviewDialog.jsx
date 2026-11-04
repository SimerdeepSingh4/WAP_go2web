import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FormError } from "@/features/admin/components/shared";
import { number, dateTime } from "@/features/admin/lib/format";

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
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Review campaign</DialogTitle>
          <DialogDescription>
            Credits are charged when the server accepts your submission. The super admin handles approval and processing.
          </DialogDescription>
        </DialogHeader>

        <dl className="divide-y rounded-lg border text-sm">
          {[
            ["Campaign", campaignTitle],
            ["Numbers entered", number(totalRecipients)],
            ["Rate per recipient", `${number(estimate.rate)} ${estimate.rate === 1 ? "credit" : "credits"}`],
            ["Estimated charge", `${number(estimatedCost)} credits`],
            ["Balance after submission", isAdmin ? "Unlimited" : `${number(remainingBalance)} credits`],
            ["Delivery", scheduleType === "later" ? dateTime(scheduledTime) : "As soon as approved"],
            ["Attachments", number(totalMediaCount)],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-3.5 py-2.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium text-foreground text-right tabular-nums truncate max-w-[60%]">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {previewText && (
          <p className="text-xs text-muted-foreground line-clamp-3 rounded-lg bg-muted/40 p-3 whitespace-pre-wrap">
            {previewText}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          {isAdmin && invalidCount > 0 ? `${number(invalidCount)} entries need review. ` : ""}
          The server confirms the final charge.
        </p>

        <FormError message={error?.response?.data?.message || error?.message} />

        <div className="flex justify-end gap-2">
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
            {isPending ? "Submitting…" : "Submit campaign"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

