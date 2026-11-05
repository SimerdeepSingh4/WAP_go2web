import { useSearchParams } from "react-router";
import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useUserQuery, useUserMutation } from "../hooks/useUser";
import { PageHeading, QueryState, FilterSelect, DataTable, Pager, Field, FormError } from "@/features/admin/components/shared";
import { Summary } from "@/components/dashboard/OverviewPanels";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dateTime, number, ownerName } from "@/features/admin/lib/format";

const labels = { ALLOCATE: "Allocation", DEDUCT: "Campaign charge", REFUND: "Refund", RECLAIM: "Reclaim", REQUEST: "Credit request" };
export default function UserCredits({ activity = false }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState(false);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const type = params.get("type") || "all";
  const transactionId = params.get("transaction");
  const balance = useUserQuery("myBalance", {}, !activity);
  const ledger = useUserQuery("transactions", { page, limit: 10, ...(transactionId ? { transactionId } : {}), ...(type === "all" ? {} : { type }) });
  function update(key, value) { setParams(old => { const next = new URLSearchParams(old); value ? next.set(key, value) : next.delete(key); if (key === "type") next.delete("page"); return next; }, { replace: true }); }
  const request = useUserMutation("requestCredits", "Credit request submitted", () => { update("request", ""); setAmount(""); setNote(""); setReview(false); });
  const accountId = user?.id || user?._id;
  const columns = [
    { key: "date", label: "Date", render: t => dateTime(t.createdAt) },
    { key: "type", label: "Type", render: t => labels[t.type] || t.type },
    { key: "account", label: "Account", render: t => ownerName(t.fromUser || t.toUser) },
    { key: "amount", label: "Credits", className: "text-right", render: t => <span className="font-medium tabular-nums">{number(t.amount)}</span> },
    { key: "balance", label: "Your balance after", className: "text-right", render: t => number(t.type === "REQUEST" ? null : String(t.fromUser?._id || t.fromUser) === String(accountId) ? t.balanceAfterFrom : t.balanceAfterTo) },
    { key: "notes", label: "Notes", render: t => <span className="block max-w-72 whitespace-normal break-words">{t.notes || "-"}</span> },
  ];
  return <>
    <PageHeading title={activity ? "Transactions" : "Credits"} description={activity ? "Your credit allocations, charges and requests." : "Your available balance and credit history."} action={!activity && <Button disabled={user?.isPreview} onClick={() => { request.reset(); setReview(false); update("request", "new"); }}>Request credits</Button>} />
    {!activity && <QueryState query={balance}><Summary items={[{ label: "Available credits", value: number(balance.data?.wallet?.balance), credit: true, hint: balance.data?.wallet?.isLocked ? "Locked - contact your reseller" : "Available for campaigns" }, { label: "Rate per recipient", value: number(balance.data?.wallet?.ratePerMsg), hint: "Credits per message" }]} /></QueryState>}
    <div className="dashboard-section-heading"><h2>Transaction history</h2><FilterSelect label="Transaction type" value={type} onChange={v => update("type", v)} options={[{ value: "all", label: "All transactions" }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} /></div>
    {transactionId && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm"><span>Showing selected transaction</span><button type="button" className="font-medium text-indigo-700 underline" onClick={() => setParams((previous) => { const next = new URLSearchParams(previous); next.delete("transaction"); next.delete("page"); return next; }, { replace: true })}>View all transactions</button></div>}
<QueryState query={ledger}><div><DataTable caption="Credit transactions" rows={ledger.data?.transactions || []} columns={columns} paginated={false} emptyTitle="No transactions found" /><Pager page={page} totalPages={ledger.data?.pagination?.totalPages || 1} total={ledger.data?.pagination?.total || 0} onChange={p => update("page", String(p))} disabled={ledger.isFetching} /></div></QueryState>
    {params.get("request") && !user?.isPreview && <Dialog open onOpenChange={open => { if (!open && !request.isPending) update("request", ""); }}><DialogContent showCloseButton={!request.isPending}><DialogHeader><DialogTitle>{review ? "Review credit request" : "Request credits"}</DialogTitle><DialogDescription>A request does not change your balance. Your account manager allocates credits separately.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (request.isPending) return; if (review) request.mutate({ amount: Number(amount), note: note.trim() }); else setReview(true); }}>
        {review ? <div className="dashboard-note space-y-2"><p>Account: <strong>{user?.username}</strong></p><p>Requested credits: <strong>{number(Number(amount))}</strong></p>{note && <p className="whitespace-pre-wrap break-words">{note}</p>}</div> : <><Field id="request-amount" label="Credits requested"><Input id="request-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></Field><Field id="request-note" label="Note (optional)"><Textarea id="request-note" rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></Field></>}
        <FormError message={request.error?.message} /><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={request.isPending} onClick={() => review ? setReview(false) : update("request", "")}>{review ? "Back" : "Cancel"}</Button><Button type="submit" disabled={request.isPending}>{request.isPending ? "Submitting..." : review ? "Submit request" : "Review request"}</Button></div>
      </form>
    </DialogContent></Dialog>}
  </>;
}
