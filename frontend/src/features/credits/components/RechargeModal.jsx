import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, AlertCircle, Wallet, Send, ListFilter, Clock, ArrowRight, LoaderCircle } from "lucide-react";
import { dateTime, number } from "@/lib/format";
import { useSellerPaymentInstructions, useCreateQuote, useSubmitProof } from "../hooks/useCredits";
import { creditCategoryNames } from "../lib/creditTransactionDisplay";
import PaymentProofFields from "./PaymentProofFields";
import RechargePaymentDetails from "./RechargePaymentDetails";
import "./recharge-modal.css";

const PRESET_AMOUNTS = [1000, 5000, 10000, 25000, 50000];
const CREDIT_CATEGORIES = [
  { value: "CAMPAIGN", icon: Send, description: "WhatsApp broadcasts" },
  { value: "NUMBER_FILTERING", icon: ListFilter, description: "WhatsApp number checks" },
];
const quoteCurrency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const steps = ["Credits", "Payment", "Proof", "Review"];

export default function RechargeModal({ open, ...props }) {
  return open ? <RechargeFlow {...props} /> : null;
}

function RechargeFlow({ onOpenChange, initialCategory = "CAMPAIGN", initialQuantity, activeQuote, onViewOrders }) {
  const [category, setCategory] = useState(activeQuote?.category || initialCategory);
  const [quantity, setQuantity] = useState(String(initialQuantity || 5000));
  const [currentQuote, setCurrentQuote] = useState(activeQuote);
  const [paymentReference, setPaymentReference] = useState("");
  const [proofFile, setProofFile] = useState(null);
  const [showProof, setShowProof] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [expired, setExpired] = useState(() => Date.parse(activeQuote?.expiresAt) <= Date.now());
  const heading = useRef(null);
  const instructionsQuery = useSellerPaymentInstructions(category, !currentQuote);
  const unitPriceInr = instructionsQuery.data?.rate?.unitPriceInr;
  const createQuoteMutation = useCreateQuote(data => setCurrentQuote(data.quote));
  const submitProofMutation = useSubmitProof(data => setSubmission(data.purchase));
  const busy = createQuoteMutation.isPending || submitProofMutation.isPending;
  const numQuantity = Number(quantity);
  const hasValidQuantity = Number.isSafeInteger(numQuantity) && numQuantity > 0;
  const quantityError = quantity && !hasValidQuantity ? "Enter a positive whole number within the supported range." : "";
  const estimatedTotal = hasValidQuantity && unitPriceInr ? quoteCurrency.format(numQuantity * Number(unitPriceInr)) : null;
  const late = currentQuote?.status === "EXPIRED" || expired;
  const step = submission ? 4 : !currentQuote ? 1 : showProof || late ? 3 : 2;
  const priorStep = useRef(step);
  useEffect(() => {
    if (priorStep.current !== step) heading.current?.focus();
    priorStep.current = step;
  }, [step]);
  useEffect(() => {
    if (!currentQuote?.expiresAt) return;
    const remaining = Date.parse(currentQuote.expiresAt) - Date.now();
    const timer = setTimeout(() => setExpired(true), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [currentQuote]);

  function handleCreateQuote(event) {
    event.preventDefault();
    if (hasValidQuantity && unitPriceInr && !busy) createQuoteMutation.mutate({ category, quantity: numQuantity });
  }
  function handleSubmitProof(event) {
    event.preventDefault();
    if (!proofFile || !paymentReference.trim() || busy) return;
    const formData = new FormData();
    formData.append("paymentReference", paymentReference.trim());
    formData.append("proof", proofFile);
    submitProofMutation.mutate({ purchaseId: currentQuote.id || currentQuote._id, formData });
  }
  const title = ["Choose your credits", "Make your payment", "Add payment proof", "Proof submitted"][step - 1];
  const description = [
    "Choose a category and quantity to see your recharge total.",
    "Transfer the quoted amount using the details below.",
    late ? "Already paid? Send your receipt for manual review." : "Use the receipt from your completed transfer.",
    "Track this recharge in your orders while your payment is verified.",
  ][step - 1];
  return <Dialog open onOpenChange={next => { if (!next && !busy) onOpenChange(false); }}>
    <DialogContent className="recharge-dialog" showCloseButton={!busy}>
      <DialogHeader className="recharge-header">
        <span className="recharge-header-icon">{step === 4 ? <Check /> : <Wallet />}</span>
        <div className="min-w-0">
          <DialogTitle ref={heading} tabIndex={-1} className="text-lg leading-tight font-semibold tracking-tight outline-none">{title}</DialogTitle>
          <DialogDescription className="mt-1 leading-snug">{description}</DialogDescription>
        </div>
      </DialogHeader>
      <ol className="recharge-steps" aria-label="Recharge progress">{steps.map((label, index) =>
        <li key={label} aria-current={index + 1 === step ? "step" : undefined} data-complete={index + 1 < step || undefined}>
          <span aria-hidden="true">{index + 1 < step ? <Check /> : index + 1}</span>{label}
        </li>)}</ol>
      {step === 1 ? (
          <form onSubmit={handleCreateQuote} className="recharge-quote-form">
            <div className="recharge-quote-fields">
              <fieldset className="min-w-0" disabled={createQuoteMutation.isPending}>
                <legend className="recharge-field-label">Credit category</legend>
                <div className="recharge-categories">
                  {CREDIT_CATEGORIES.map(({ value, icon: Icon, description }) => (
                    <label className="recharge-category" key={value}>
                      <input
                        type="radio"
                        className="sr-only"
                        name="recharge-category"
                        value={value}
                        checked={category === value}
                        onChange={() => setCategory(value)}
                      />
                      <span className="recharge-category-top">
                        <span className="recharge-category-icon"><Icon aria-hidden="true" /></span>
                        <span className="recharge-category-indicator" aria-hidden="true"><Check /></span>
                      </span>
                      <span className="recharge-category-name">{creditCategoryNames[value]}</span>
                      <span className="recharge-category-description">{description}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="min-w-0" disabled={createQuoteMutation.isPending}>
                <legend className="sr-only">Quantity and presets</legend>
                <label htmlFor="recharge-qty" className="recharge-field-label">Credit quantity</label>
                <div className="recharge-quantity">
                  <Input
                    id="recharge-qty"
                    type="text"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (/^\d*$/.test(value)) setQuantity(value);
                    }}
                    placeholder="0"
                    aria-invalid={Boolean(quantityError)}
                    aria-describedby={quantityError ? "recharge-qty-error" : undefined}
                    required
                  />
                  <span aria-hidden="true">credits</span>
                </div>
                {quantityError && <p id="recharge-qty-error" className="mt-1.5 text-xs text-destructive">{quantityError}</p>}
                <div className="recharge-presets" role="group" aria-label="Preset quantities">
                  {PRESET_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      aria-label={"Set quantity to " + number(amount)}
                      aria-pressed={numQuantity === amount}
                      onClick={() => setQuantity(String(amount))}
                    >
                      {number(amount)}
                    </button>
                  ))}
                </div>
              </fieldset>

              {instructionsQuery.isError ? (
                <div className="recharge-rate-status" role="alert"><AlertCircle /><div><strong>Couldn’t load the rate</strong><p>Check your connection and try again.</p><Button type="button" size="sm" variant="outline" onClick={() => instructionsQuery.refetch()}>Retry</Button></div></div>
              ) : instructionsQuery.isPending ? (
                <div className="recharge-rate-status" role="status">
                  <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                  Checking purchase rate…
                </div>
              ) : unitPriceInr ? (
                <div className="recharge-estimate">
                  <div className="min-w-0">
                    <p className="recharge-estimate-label">Estimated total</p>
                    <p className="recharge-estimate-breakdown">
                      {hasValidQuantity ? <>{number(numQuantity)} credits × ₹{unitPriceInr}</> : <>₹{unitPriceInr} per credit</>}
                    </p>
                  </div>
                  <output htmlFor="recharge-qty" aria-label="Estimated total" className="recharge-estimate-amount">
                    {estimatedTotal ?? "—"}
                  </output>
                </div>
              ) : (
                <div className="recharge-rate-status recharge-rate-status--warning" role="status">
                  <AlertCircle aria-hidden="true" />
                  <div>
                    <strong>Purchase rate unavailable</strong>
                    <p>Ask your account manager to set a rate for this category.</p>
                  </div>
                </div>
              )}
            </div>

            <div className="recharge-quote-actions">
              <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                type="submit"
                className="recharge-quote-submit"
                disabled={!unitPriceInr || !hasValidQuantity || createQuoteMutation.isPending}
              >
                {createQuoteMutation.isPending ? "Generating quote…" : "Continue to payment"}
                {createQuoteMutation.isPending
                  ? <LoaderCircle className="motion-safe:animate-spin" aria-hidden="true" />
                  : <ArrowRight aria-hidden="true" />}
              </Button>
            </div>
          </form>
      ) : <>
        <div className="recharge-quote-fields" key={step}>
          <div className="recharge-estimate">
            <div className="min-w-0"><p className="recharge-estimate-label">{number(currentQuote.quantity)} {creditCategoryNames[currentQuote.category]?.toLowerCase()}</p>
              <p className="recharge-estimate-breakdown">Quote #{String(currentQuote.id || currentQuote._id).slice(-8)}</p></div>
            <strong className="recharge-estimate-amount">{quoteCurrency.format(currentQuote.totalInr ?? currentQuote.totalPaisa / 100)}</strong>
          </div>
          {step === 2 && <>
            <RechargePaymentDetails quote={currentQuote} />
            {currentQuote.expiresAt && <p className="inline-flex items-center gap-2 text-xs text-muted-foreground"><Clock className="size-4" /> Quote valid until {dateTime(currentQuote.expiresAt)}</p>}
          </>}
          {step === 3 && <form id="recharge-proof-form" onSubmit={handleSubmitProof}>
            {late && <div className="recharge-rate-status recharge-rate-status--warning mb-4"><Clock /><p>This quote has expired. Submit proof here only if you already paid.</p></div>}
            <fieldset disabled={busy}><PaymentProofFields reference={paymentReference} onReferenceChange={setPaymentReference} file={proofFile} onFileChange={setProofFile} /></fieldset>
            {submitProofMutation.isError && <p className="mt-3 text-sm text-destructive" role="alert">{submitProofMutation.error.message}</p>}
          </form>}
          {step === 4 && <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-3"><Clock className="mt-0.5 size-4 shrink-0" /><div><h3 className="font-semibold">{submission.status === "REVIEW_REQUIRED" ? "Awaiting manual review" : "Awaiting verification"}</h3>
              <p className="mt-1 text-xs text-muted-foreground">Your wallet updates when your account manager approves the payment.</p></div></div>
            <dl className="flex flex-wrap justify-between gap-2 text-sm"><dt className="text-muted-foreground">Payment reference</dt><dd className="break-all font-mono">{submission.paymentReference || paymentReference}</dd></dl>
          </div>}
        </div>
        <footer className="recharge-quote-actions">
          {step === 2 && <><Button variant="outline" onClick={() => onOpenChange(false)}>Finish later</Button><Button onClick={() => setShowProof(true)}>I’ve paid <ArrowRight /></Button></>}
          {step === 3 && <><Button variant="outline" disabled={busy} onClick={() => late ? onOpenChange(false) : setShowProof(false)}>{late ? "Close" : "Payment details"}</Button>
            <Button type="submit" form="recharge-proof-form" disabled={busy || !paymentReference.trim() || !proofFile}>{busy ? "Submitting…" : "Submit for review"}</Button></>}
          {step === 4 && <Button onClick={onViewOrders || (() => onOpenChange(false))}>{onViewOrders ? "View recharge orders" : "Done"}</Button>}
        </footer>
      </>}
    </DialogContent>
  </Dialog>;
}
