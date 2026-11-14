import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { reconciliationApi } from "../services/reconciliation.api";

const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const modes = [
  { id: "wallet", title: "Correct the wallet", detail: "The verified ledger is correct. Bring the wallet to that balance." },
  { id: "ledger", title: "Restore a missing ledger entry", detail: "The wallet is correct. Record the verified missing movement without moving credits again." },
  { id: "transaction", title: "Recover a verified missing transaction", detail: "A completed transaction is missing from both records. Recover its exact amount in the wallet and ledger together." },
  { id: "close", title: "Close without changing credits", detail: "A fresh check matches. Record why the earlier flag needs no balance correction." },
];
const labels = { wallet: "Correct wallet balance", ledger: "Restore missing ledger evidence", transaction: "Recover verified transaction", close: "Close without changing credits" };
const movementLabels = { ALLOCATE: "Credit received", REFUND: "Refund received", DEDUCT: "Credits used", RECLAIM: "Credits reclaimed" };

export default function CorrectionPanel({ evidence, onChanged, initialMode = "" }) {
  const s = evidence.summary;
  const [mode, setMode] = useState(s.classification === "matched" && initialMode === "transaction" ? "transaction" : "");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("");
  const [originalType, setOriginalType] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [amount, setAmount] = useState("");
  const [transactionVerified, setTransactionVerified] = useState(false);
  const [review, setReview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const busy = useRef(false);
  const client = useQueryClient();
  const available = Boolean(s.walletId && ["User", "Reseller"].includes(s.account.role) && s.calculationsAgree && (s.audit.verified || !s.audit.count));
  const preview = useMutation({ mutationFn: body => reconciliationApi.preview(s.account.id, body), onSuccess: result => { setReview(result.plan); setConfirmed(false); } });
  function finishRepair(result) {
    setReview(null); setMode(""); setReason(""); setSource("");
    setAmount(""); setEffectiveAt(""); setOriginalType(""); setTransactionVerified(false);
    void client.invalidateQueries({ queryKey: ["credit-reconciliation"] });
    void client.invalidateQueries({ queryKey: ["admin"] });
    onChanged();
    toast.add({ title: result.result.replayed ? "The saved result was retrieved" : "Review completed and recorded", description: "The account was checked again and the audit record was saved.", type: "success" });
  }
  const confirmation = useMutation({ mutationFn: () => reconciliationApi.confirm(s.account.id, review.id), onSuccess: finishRepair });
  const receipt = useMutation({ mutationFn: () => reconciliationApi.result(s.account.id, review.id), onSuccess: result => {
    if (result.state === "completed") finishRepair(result);
    else toast.add({ title: result.state === "processing" ? "Confirmation is still processing" : "No completed correction is saved for this review", description: result.state === "expired" ? "Refresh the evidence and prepare a new review." : "Keep this review reference when checking or retrying the confirmation.", type: "info" });
  }, onError: () => toast.add({ title: "Saved result is temporarily unavailable", description: "Keep this review open and check again when the connection is restored.", type: "error" }) });
  function isAllowed(id) {
    if (!available) return false;
    if (id === "wallet") return s.classification === "confirmed" && s.expectedBalance >= 0;
    if (id === "ledger") return s.classification === "confirmed" && s.difference !== 0;
    if (id === "close") return s.classification === "matched";
    if (id === "transaction") return s.classification === "matched";
    return true;
  }
  async function submit(event) {
    event.preventDefault();
    if (!isAllowed(mode) || busy.current) return;
    busy.current = true;
    try {
      await preview.mutateAsync({ mode, reason, sourceReference: source,
        ...(["ledger", "transaction"].includes(mode) ? { originalType, effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : "" } : {}),
        ...(mode === "transaction" ? { amount, transactionVerified } : {}) });
    } catch { /* The form presents the server's specific validation message. */ }
    finally { busy.current = false; }
  }
  const stale = confirmation.error?.response?.status === 409;
  const checking = confirmation.isPending || receipt.isPending;
  return <section className="credit-correction" aria-label="Correction workspace">
    <div className="credit-section-intro"><span className="credit-section-icon"><ShieldCheck /></span><div><h3>Choose the correction supported by your evidence</h3><p>Each review applies only to <strong>{s.account.username}</strong>. Existing posted transactions are preserved.</p></div></div>
    {!available && <div className="credit-evidence-note" role="status">Resolve missing account records or conflicting audit evidence before preparing a correction.</div>}
    {s.classification === "cannot_confirm" && available && <div className="credit-evidence-note">Resolve the conflicting evidence before preparing a wallet or ledger repair.</div>}
    {initialMode === "transaction" && s.classification !== "matched" && <div className="credit-evidence-note">Resolve this account’s existing discrepancy first. Then recover the verified transaction missing from both records.</div>}
    <div className="credit-correction-modes">{modes.filter(item => item.id === "close" ? s.classification === "matched" : item.id === "transaction" ? s.classification === "matched" || initialMode === "transaction" : s.classification !== "matched").map(item => <button type="button" key={item.id} aria-pressed={mode === item.id} disabled={!isAllowed(item.id) || preview.isPending} onClick={() => { setMode(item.id); setOriginalType(""); setTransactionVerified(false); preview.reset(); confirmation.reset(); }}><span className="credit-choice-dot">{mode === item.id && <Check />}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span></button>)}</div>
    {mode && <form className="credit-correction-form" onSubmit={submit}>
      {mode === "wallet" && <div className="credit-change-preview"><div><span>Current wallet</span><strong>{number(s.walletBalance)}</strong></div><ArrowRight /><div><span>Verified ledger balance</span><strong>{number(s.expectedBalance)}</strong></div><p>{s.difference > 0 ? `${number(s.difference)} extra credits would be removed.` : `${number(-s.difference)} missing credits would be restored.`} The economic ledger remains unchanged.</p></div>}
      {mode === "ledger" && <><div className="credit-evidence-note">The wallet stays at {number(s.walletBalance)} credits. You must verify the original missing transaction. Related accounts require their own evidence review.</div><label>Original movement<select required value={originalType} onChange={event => setOriginalType(event.target.value)}><option value="">Select the verified movement</option>{(s.difference > 0 ? [["ALLOCATE", "Credit received"], ["REFUND", "Refund received"]] : [["DEDUCT", "Credits used"], ["RECLAIM", "Credits reclaimed"]]).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>When the original movement happened<Input type="datetime-local" required value={effectiveAt} onChange={event => setEffectiveAt(event.target.value)} /></label></>}
      {mode === "transaction" && <><div className="credit-evidence-note">Wallet and ledger currently match at <strong>{number(s.walletBalance)} credits</strong>. Enter the original completed transaction, not a desired final balance. Verify the source account or campaign separately if it was also affected.</div><div className="credit-recovery-fields"><label>Original movement<select required value={originalType} onChange={event => setOriginalType(event.target.value)}><option value="">Select the completed movement</option>{Object.entries(movementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Original amount in credits<Input type="number" min="0.01" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} placeholder="e.g. 10" /></label><label>Original transaction date and time<Input type="datetime-local" required value={effectiveAt} onChange={event => setEffectiveAt(event.target.value)} /></label></div></>}
      {mode !== "close" && <label>{mode === "transaction" ? "Unique original transaction reference" : "Source evidence reference"}<Input required minLength={3} maxLength={500} value={source} onChange={event => setSource(event.target.value)} placeholder="Original receipt or verified transaction reference" /></label>}
      <label>Investigation and reason<textarea required minLength={10} maxLength={2000} rows={4} value={reason} onChange={event => setReason(event.target.value)} placeholder="Describe what you checked, which record is correct, and why this action is justified." /></label>
      {mode === "transaction" && <label className="credit-checkbox"><input type="checkbox" required checked={transactionVerified} onChange={event => setTransactionVerified(event.target.checked)} /><span>I verified that this transaction completed, belongs to <strong>{s.account.username}</strong>, and its amount is missing from both the wallet and ledger.</span></label>}
      {preview.isError && <p className="credit-form-error" role="alert">{preview.error.message}</p>}
      <div className="credit-correction-submit"><span><ShieldCheck />Super Admin only · Every action is recorded</span><Button type="submit" disabled={!isAllowed(mode) || preview.isPending}>{preview.isPending ? <Loader2 className="animate-spin" /> : <ArrowRight />}Review exact result</Button></div>
    </form>}
    <Dialog open={Boolean(review)} onOpenChange={open => { if (!open && !checking) setReview(null); }}><DialogContent className="credit-review-dialog" showCloseButton={!checking}>
      <DialogHeader><DialogTitle>{labels[review?.mode] || "Review correction"}</DialogTitle><DialogDescription>For <strong>{review?.account.username}</strong>. Confirm only after checking the supporting evidence.</DialogDescription></DialogHeader>
      {review && <><div className="credit-review-values"><div><span>Wallet before</span><strong>{number(review.before.walletBalance)}</strong></div><div><span>Wallet after</span><strong>{number(review.proposed.walletBalance)}</strong></div><div><span>Ledger before</span><strong>{number(review.before.expectedBalance)}</strong></div><div><span>Ledger after</span><strong>{number(review.proposed.expectedBalance)}</strong></div></div>
        <p className="credit-evidence-note">{review.mode === "wallet" ? "Only the wallet changes. No ordinary charge, refund, or allocation is added." : review.mode === "ledger" ? "Only verified missing ledger evidence is restored. The wallet receives no additional credit." : review.mode === "transaction" ? "The original transaction amount is applied to the wallet and recorded as recovered ledger evidence together. Reusing this source reference is blocked." : "No credits move. The matched flag is closed with its investigation record."}</p>
        <dl className="credit-review-proof">{review.sourceReference && <div><dt>Source evidence</dt><dd>{review.sourceReference}</dd></div>}{review.mode === "transaction" && <><div><dt>Original movement</dt><dd>{movementLabels[review.originalType]}</dd></div><div><dt>Recovery amount</dt><dd>{review.proposed.delta > 0 ? "+" : ""}{number(review.proposed.delta)} credits</dd></div><div><dt>Original transaction time</dt><dd>{new Date(review.effectiveAt).toLocaleString()}</dd></div></>}<div><dt>Reason</dt><dd>{review.reason}</dd></div><div><dt>Difference after this action</dt><dd>{number(review.proposed.difference)} credits</dd></div></dl>
        <label className="credit-checkbox"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>I verified the evidence and the exact result for this account.</span></label>
        {confirmation.isError && <p className="credit-form-error" role="alert">{confirmation.error.message}</p>}
        {confirmation.isPending && <p className="credit-caption" role="status">Saving and checking the correction. The same review reference protects against duplicate changes.</p>}
        <div className="credit-review-actions"><Button type="button" variant="outline" disabled={checking} onClick={() => { setReview(null); if (stale) onChanged(); }}>{stale ? "Refresh evidence" : "Back to investigation"}</Button>{confirmation.isError && !stale && <Button type="button" variant="outline" disabled={checking} onClick={() => receipt.mutate()}>{receipt.isPending && <Loader2 className="animate-spin" />}Check saved result</Button>}<Button type="button" disabled={!confirmed || checking || stale} onClick={() => { if (!busy.current) { busy.current = true; confirmation.mutate(undefined, { onSettled: () => { busy.current = false; } }); } }}>{confirmation.isPending ? <Loader2 className="animate-spin" /> : <Check />}{confirmation.isPending ? "Recording correction…" : confirmation.isError && !stale ? "Retry same review" : "Confirm and record"}</Button></div>
      </>}
    </DialogContent></Dialog>
  </section>;
}
