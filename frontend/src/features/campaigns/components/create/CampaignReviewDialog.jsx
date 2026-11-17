import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FormError } from "@/features/dashboard/components/shared";
import { number, dateTime } from "@/lib/format";
import { ClipboardCheck, Clock3, Image, Link2, Loader2, Paperclip, Phone, Send } from "lucide-react";
import "./campaign-dialogs.css";

export default function CampaignReviewDialog({
  isOpen,
  onClose,
  isPending,
  campaignTitle,
  campaignLink,
  campaignLinkName,
  campaignNumber,
  campaignNumberName,
  shareProfileDp,
  totalRecipients,
  estimate,
  estimatedCost,
  isAdmin,
  remainingBalance,
  scheduleType,
  scheduledTime,
  totalMediaCount,
  mediaName,
  duplicatesCount = 0,
  error,
  onSubmit,
}) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent className="campaign-review-dialog" showCloseButton={!isPending}>
        <DialogHeader className="campaign-dialog-header">
          <span className="campaign-dialog-icon" aria-hidden="true"><ClipboardCheck /></span>
          <div><DialogTitle>Review campaign</DialogTitle>
          <DialogDescription>Check the details before you submit.</DialogDescription></div>
        </DialogHeader>

        <div className="campaign-review-body">
          <div className="campaign-review-name"><span>Campaign</span><h3>{campaignTitle}</h3></div>

          <section className="campaign-review-summary" aria-label="Recipients and estimated cost">
            <dl className="campaign-review-totals">
              <div><dt>Numbers entered</dt><dd>{number(totalRecipients)}
                {duplicatesCount > 0 && <p>{number(duplicatesCount)} repeated {duplicatesCount === 1 ? "entry" : "entries"} included</p>}</dd>
              </div>
              <div><dt>Estimated cost</dt><dd>{number(estimatedCost)} <span>credits</span>
                <p>{number(estimate.rate)} {estimate.rate === 1 ? "credit" : "credits"} per number</p></dd>
              </div>
            </dl>
            <div className="campaign-review-balance"><span>Balance after submission</span><strong>{isAdmin ? "Unlimited" : `${number(remainingBalance)} credits`}</strong></div>
          </section>

          <dl className="campaign-review-details">
            <div><dt><Clock3 aria-hidden="true" />Delivery</dt><dd>{scheduleType === "later" ? <><strong>Scheduled</strong><small>{dateTime(scheduledTime)}</small></> : "After admin approval"}</dd></div>
            <div><dt><Paperclip aria-hidden="true" />Campaign media</dt><dd>{totalMediaCount > 0 ? <><strong>{number(totalMediaCount)} {totalMediaCount === 1 ? "attachment" : "attachments"}</strong>{mediaName && <small>{mediaName}</small>}</> : "No attachment"}</dd></div>
            {shareProfileDp && <div><dt><Image aria-hidden="true" />Profile photo</dt><dd>Included separately</dd></div>}
            {campaignLink && <div><dt><Link2 aria-hidden="true" />Link button</dt><dd><strong>{campaignLinkName}</strong><small>{campaignLink}</small></dd></div>}
            {campaignNumber && <div><dt><Phone aria-hidden="true" />Call button</dt><dd><strong>{campaignNumberName}</strong><small>{campaignNumber}</small></dd></div>}
          </dl>

          <p className="campaign-review-note">Credits are deducted when you submit. Your campaign needs admin approval before delivery.</p>
        </div>

        <div className="campaign-review-actions">
          {error && <FormError message={error?.response?.data?.message || error?.message} />}
          <div className="campaign-dialog-footer campaign-review-footer">
            <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>Edit campaign</Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              {isPending ? <><Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Submitting…</> : <><Send aria-hidden="true" />{isAdmin ? "Submit campaign" : "Submit for approval"}</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

