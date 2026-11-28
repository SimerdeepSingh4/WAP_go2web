import { useState } from "react";
import { ArrowRight, Eye, Flag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { number } from "@/lib/format";
import { creditCategoryNames } from "../lib/creditTransactionDisplay";
import { useFixPurchaseProof } from "../hooks/useCredits";
import PaymentProofFields from "./PaymentProofFields";
import PurchaseReceipt from "./PurchaseReceipt";
import "./payment-proof-modal.css";

export default function FixPaymentProofModal({ purchase, open, onOpenChange }) {
  const [file, setFile] = useState(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [review, setReview] = useState(false);
  const fix = useFixPurchaseProof(() => onOpenChange(false));
  const canContinue = Boolean(file) && !fix.isPending;
  function submit(event) {
    event.preventDefault();
    if (!canContinue) return;
    if (!review) { setReview(true); return; }
    const formData = new FormData();
    formData.append("proof", file);
    fix.mutate({ id: purchase.id || purchase._id, formData });
  }

  return <Dialog open={open} onOpenChange={next => { if (!fix.isPending) onOpenChange(next); }}>
    <DialogContent className="payment-proof-dialog fix-proof-dialog" showCloseButton={!fix.isPending}>
      <DialogHeader className="payment-proof-header">
        <span className="payment-proof-heading-icon"><Flag aria-hidden="true" /></span>
        <div><DialogTitle className="text-lg font-semibold">{review ? "Review your correction" : "Correct payment proof"}</DialogTitle>
          <DialogDescription>Quote #{String(purchase.id || purchase._id).slice(-8)} · {number(purchase.quantity)} {creditCategoryNames[purchase.category]?.toLowerCase()}</DialogDescription></div>
      </DialogHeader>
      <form id="fix-proof-form" className="payment-proof-body" onSubmit={submit}>
        <section className="payment-proof-notice">
          <strong>Reviewer feedback{purchase.reviewedBy?.username && " · " + purchase.reviewedBy.username}</strong>
          <p className="mt-1 whitespace-pre-wrap">{purchase.flagReason || "Upload an updated payment screenshot or receipt against the original transfer."}</p>
        </section>
        {review ? <section className="space-y-3" aria-label="Correction summary" aria-live="polite">
          <h3 className="font-semibold">Ready to send for review</h3>
          <dl className="space-y-3 rounded-xl border bg-muted/20 p-3 text-sm">
            <div><dt className="text-xs text-muted-foreground">Receipt</dt><dd className="break-all font-medium">{file?.name || "Original receipt"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Quoted amount</dt><dd className="font-medium">₹{purchase.totalInr}</dd></div>
          </dl>
          <p className="text-sm text-muted-foreground">Sending uses your one correction and returns this payment to the reviewer.</p>
        </section> : <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">One correction available</p>
            {purchase.hasProof && <Button variant="outline" size="sm" type="button" aria-expanded={showReceipt} onClick={() => setShowReceipt(!showReceipt)}><Eye />{showReceipt ? "Hide original receipt" : "View original receipt"}</Button>}
          </div>
          {showReceipt && <PurchaseReceipt purchase={purchase} />}
          <PaymentProofFields file={file} onFileChange={setFile} replacement />
        </>}
        {fix.isError && <p className="text-sm text-destructive" role="alert">{fix.error.message}</p>}
      </form>
      <footer className="payment-proof-footer">
        <div className="payment-proof-reject-actions">
          <Button type="button" variant="outline" disabled={fix.isPending} onClick={() => review ? setReview(false) : onOpenChange(false)}>{review ? "Edit correction" : "Cancel"}</Button>
          <Button type="submit" form="fix-proof-form" disabled={!canContinue}>{fix.isPending ? "Sending…" : review ? "Send correction" : "Review correction"}<ArrowRight /></Button>
        </div>
      </footer>
    </DialogContent>
  </Dialog>;
}
