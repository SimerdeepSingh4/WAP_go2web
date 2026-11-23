import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import RecordReference from "@/components/ui/RecordReference";
import { CheckCircle, XCircle, ReceiptText, AlertTriangle, Flag, Edit3, Zap } from "lucide-react";
import { dateTime, number } from "@/lib/format";
import { creditCategoryNames } from "../lib/creditTransactionDisplay";
import PurchaseStatus from "./PurchaseStatus";
import PurchaseReceipt from "./PurchaseReceipt";
import "./payment-proof-modal.css";

const paymentCurrency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

export default function ProofViewerModal({
  purchase,
  open,
  onOpenChange,
  onApprove,
  onReject,
  onFlag,
  onFix,
  busy,
  isReviewer = false,
  insufficientBalance = null,
  onQuickRecharge,
}) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [receiptReady, setReceiptReady] = useState(false);
  const id = purchase?.id ?? purchase?._id;

  if (!purchase) return null;

  const manualReview = purchase.status === "REVIEW_REQUIRED";
  const canReview = isReviewer && (manualReview || purchase.status === "PENDING" || purchase.status === "FLAGGED");
  const awaitingReview = manualReview || purchase.status === "PENDING";
  const canFlag = isReviewer && awaitingReview && (purchase.fixAttempts || 0) < 1;
  const amount = purchase.totalInr || (purchase.totalPaisa ?? 0) / 100;

  return (
    <Dialog open={open} onOpenChange={next => { if (!busy) onOpenChange(next); }}>
      <DialogContent className="payment-proof-dialog" showCloseButton={!busy}>
        <DialogHeader className="payment-proof-header">
          <span className="payment-proof-heading-icon"><ReceiptText aria-hidden="true" /></span>
          <div className="min-w-0">
            <DialogTitle className="text-lg leading-tight font-semibold tracking-tight">{isReviewer ? "Review recharge" : "Recharge details"}</DialogTitle>
            <DialogDescription className="mt-1 leading-snug">
              {isReviewer && awaitingReview ? "Compare the paid amount and reference with your payment records." : "Payment and receipt for quote #" + String(id).slice(-8)}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="payment-proof-body">
          <div className="flex flex-wrap items-center justify-between gap-2"><PurchaseStatus purchase={purchase} />
            {purchase.fixedAt && <span className="text-xs text-muted-foreground">Corrected {dateTime(purchase.fixedAt)}</span>}</div>
          {purchase.status === "FLAGGED" && <div className="payment-proof-notice">
            <strong>{isReviewer ? "Awaiting the buyer’s correction" : "Your payment proof needs a correction"}</strong>
            <p className="mt-1 whitespace-pre-wrap">{purchase.flagReason || "Check the reference and receipt against the original transfer."}</p>
          </div>}
          {purchase.fixAttempts > 0 && purchase.flagReason && purchase.status !== "FLAGGED" && <details className="rounded-lg border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">Previous reviewer feedback</summary><p className="mt-2 whitespace-pre-wrap break-words">{purchase.flagReason}</p></details>}
          {purchase.rejectionReason && <div className="payment-proof-notice payment-proof-notice--rejected"><strong>Reason for rejection</strong><p>{purchase.rejectionReason}</p></div>}
          {manualReview && <div className="payment-proof-notice"><strong>Manual review required</strong><p>{purchase.reviewReason === "LATE_PROOF" ? "The receipt was submitted after the quote expired." : "Verify the reported payment mismatch against the transfer."}</p></div>}
          <div className="payment-proof-layout">
            <section className="payment-proof-details" aria-label="Quote details">
              <dl className="payment-proof-totals">
                <div>
                  <dt>Amount</dt>
                  <dd>{paymentCurrency.format(amount)}</dd>
                </div>
                <div>
                  <dt>Credits</dt>
                  <dd>{number(purchase.quantity)}</dd>
                </div>
                <div className="payment-proof-rate">
                  <dt>Quoted rate per credit</dt>
                  <dd>{purchase.unitPriceInr ? `₹${purchase.unitPriceInr}` : "Unavailable"}</dd>
                </div>
              </dl>
              <dl className="payment-proof-metadata">
                <div>
                  <dt>Credit category</dt>
                  <dd>{creditCategoryNames[purchase.category] || creditCategoryNames.CAMPAIGN}</dd>
                </div>
                <div>
                  <dt>Buyer</dt>
                  <dd>
                    {purchase.buyer?.username || "—"}
                    {purchase.buyer?.username && <span className="font-normal text-muted-foreground"> ({purchase.buyer.role || "User"})</span>}
                  </dd>
                </div>
                <div>
                  <dt>Quote</dt>
                  <dd><code title={id}>{id ? "#" + String(id).slice(-8) : "—"}</code></dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{dateTime(purchase.createdAt)}</dd>
                </div>
                <div className="payment-proof-reference">
                  <dt>Payment reference (UTR)</dt>
                  <dd>
                    {purchase.paymentReference
                      ? <RecordReference id={purchase.paymentReference} label="Payment reference" />
                      : "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <PurchaseReceipt purchase={purchase} onLoaded={setReceiptReady} />
          </div>


        </div>

        {!isReviewer && purchase.status === "FLAGGED" && (purchase.fixAttempts || 0) < 1 && onFix && (
          <footer className="payment-proof-footer">
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <span className="text-xs text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1.5">
                <AlertTriangle className="size-4" /> One correction available
              </span>
              <Button
                type="button"
                className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 text-xs h-9 px-4 font-semibold"
                onClick={() => {
                  onOpenChange(false);
                  onFix(purchase);
                }}
              >
                <Edit3 className="size-3.5" /> Correct proof
              </Button>
            </div>
          </footer>
        )}

        {canReview && (
          <footer className="payment-proof-footer">
            {flagging ? (
              <form className="payment-proof-reject-form" onSubmit={event => {
                event.preventDefault();
                const reason = flagReason.trim();
                if (!reason || busy) return;
                onFlag?.(purchase, reason);
              }}>
                <label htmlFor="proof-flag-reason">What should the buyer correct?</label>
                <p id="proof-flag-hint">Explain which payment detail needs changing. The buyer can send one correction.</p>
                <Textarea
                  id="proof-flag-reason"
                  aria-describedby="proof-flag-hint"
                  rows={2}
                  placeholder="e.g. UTR number not found in bank statement or screenshot is illegible"
                  value={flagReason}
                  onChange={event => setFlagReason(event.target.value)}
                  maxLength={500}
                  autoFocus
                />
                <div className="payment-proof-reject-actions">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setFlagging(false)}>Cancel</Button>
                  <Button type="submit" className="bg-amber-600 hover:bg-amber-700 text-white gap-1" disabled={busy || !flagReason.trim()}>
                    <Flag className="size-3.5" /> {busy ? "Sending…" : "Send feedback"}
                  </Button>
                </div>
              </form>
            ) : rejecting ? (
              <form className="payment-proof-reject-form" onSubmit={event => {
                event.preventDefault();
                const reason = rejectReason.trim();
                if (!reason || busy) return;
                onReject?.(purchase, reason);
              }}>
                <label htmlFor="proof-reject-reason">Reason for rejection</label>
                <p id="proof-reject-hint">The buyer will see this reason.</p>
                <Textarea
                  id="proof-reject-reason"
                  aria-describedby="proof-reject-hint"
                  rows={2}
                  placeholder="e.g. The received payment amount does not match the quote"
                  value={rejectReason}
                  onChange={event => setRejectReason(event.target.value)}
                  maxLength={500}
                  autoFocus
                />
                <div className="payment-proof-reject-actions">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setRejecting(false)}>Cancel</Button>
                  <Button type="submit" variant="destructive" disabled={busy || !rejectReason.trim()}>{busy ? "Rejecting…" : "Confirm rejection"}</Button>
                </div>
              </form>
            ) : (
              <>
                {manualReview && (
                  <label className="payment-proof-confirmation">
                    <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
                    I verified the received payment against the original quote.
                  </label>
                )}
                {insufficientBalance && (
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-lg border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-xs w-full mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>
                        <strong>Not enough balance:</strong> You need <strong>{number(insufficientBalance.shortfall)}</strong> more {insufficientBalance.category === "NUMBER_FILTERING" ? "Number Filtering" : "Campaign"} credits to approve this purchase.
                      </span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-[2rem] px-3 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium shrink-0 whitespace-nowrap gap-1.5 shadow-none"
                      onClick={() => onQuickRecharge?.(insufficientBalance)}
                    >
                      <Zap className="size-3.5" /> Request credits
                    </Button>
                  </div>
                )}
                <div className="payment-proof-actions">
                  <div className="payment-proof-secondary-actions">
                    <Button
                      type="button"
                      variant="outline"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      onClick={() => setRejecting(true)}
                    >
                      <XCircle aria-hidden="true" /> Reject
                    </Button>
                    {canFlag && (
                      <Button
                        type="button"
                        variant="outline"
                        className="text-amber-700 hover:bg-amber-50 border-amber-200 dark:text-amber-400"
                        disabled={busy}
                        onClick={() => setFlagging(true)}
                      >
                        <Flag className="size-3.5 mr-1" /> Request correction
                      </Button>
                    )}
                  </div>
                  {awaitingReview && <Button
                    type="button"
                    className="bg-emerald-700 text-white hover:bg-emerald-800"
                    disabled={busy || !receiptReady || (manualReview && !confirmed)}
                    onClick={() => onApprove?.(purchase, manualReview && confirmed)}
                  >
                    <CheckCircle aria-hidden="true" /> {busy ? "Processing…" : "Approve recharge"}
                  </Button>}
                </div>
              </>
            )}
          </footer>
        )}
      </DialogContent>
    </Dialog>
  );
}
