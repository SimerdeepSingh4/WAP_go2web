import TransactionReference from "@/components/dashboard/TransactionReference";
import { useSearchParams } from "react-router";
import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useUserQuery, useUserMutation } from "../hooks/useUser";
import { PageHeading, QueryState, FilterSelect, DataTable, Pager, Field, FormError } from "@/features/admin/components/shared";
import OverviewMetricCards from "@/components/dashboard/OverviewMetricCards";
import { Wallet, Lock, Coins, History } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dateTime, number, ownerName } from "@/features/admin/lib/format";
import SupportHelpButton from "@/features/support/components/SupportHelpButton";
import { getTransactionDisplay } from "@/components/dashboard/creditTransactionDisplay";
import "@/components/dashboard/credit-history.css";

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
    { key: "transactionId", label: "Transaction", className: "credit-ledger-col-reference", render: transaction => <div className="credit-ledger-reference"><TransactionReference transaction={transaction} /><span className="credit-ledger-date">{dateTime(transaction.createdAt)}</span></div> },
    { key: "type", label: "Type", className: "credit-ledger-col-type", render: transaction => {
      const info = getTransactionDisplay(transaction, { allocationReceived: true });
      const Icon = info.icon;
      return <span className={`credit-ledger-badge inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${info.badgeClass}`}><Icon className="size-3 shrink-0" aria-hidden="true" />{info.label}</span>;
    } },
    { key: "account", label: "Account", className: "credit-ledger-col-account", render: t => <span className="credit-ledger-account text-xs font-medium" title={ownerName(t.fromUser || t.toUser)}>{ownerName(t.fromUser || t.toUser)}</span> },
    { key: "amount", label: "Credits", className: "credit-ledger-col-amount text-right", render: transaction => {
      const info = getTransactionDisplay(transaction, { allocationReceived: true });
      return <span className={`tabular-nums text-sm ${info.amountClass}`}>{info.sign}{number(transaction.amount)}</span>;
    } },
    { key: "balance", label: "Your balance after", className: "credit-ledger-col-balance text-right", render: t => <span className="text-sm tabular-nums">{number(t.type === "REQUEST" ? null : String(t.fromUser?._id || t.fromUser) === String(accountId) ? t.balanceAfterFrom : t.balanceAfterTo)}</span> },
    { key: "notes", label: "Note", className: "credit-ledger-col-note", render: t => <span className="credit-ledger-note text-xs text-muted-foreground" title={t.notes || undefined}>{t.notes || "—"}</span> },
    { key: "actions", label: "Help", className: "credit-ledger-col-help text-right", render: transaction => <SupportHelpButton transaction={transaction} area="this transaction" /> },
  ];
  return <>
    <PageHeading title={activity ? "Transactions" : "Credits"} description={activity ? "Your credit allocations, charges and requests." : "Your available balance and credit history."} action={<div className="flex flex-wrap items-center gap-2"><SupportHelpButton area={activity ? "my transactions" : "my credits"} />{!activity && <Button data-tour="request-credits" disabled={user?.isPreview} onClick={() => { request.reset(); setReview(false); update("request", "new"); }}>Request credits</Button>}</div>} />
    {!activity && (
      <QueryState query={balance}>
        <div data-tour="user-credit-summary">
          <OverviewMetricCards
            columns={3}
            label="Credit summary"
            items={[
              {
                label: "Available credits",
                value: balance.data?.wallet?.balance,
                loading: balance.isPending,
                caption: balance.data?.wallet?.isLocked
                  ? "Locked · contact your reseller"
                  : balance.data?.wallet?.expiresAt
                  ? `Expires ${dateTime(balance.data?.wallet?.expiresAt)}`
                  : "Available for campaigns · no expiry",
                icon: balance.data?.wallet?.isLocked ? Lock : Wallet,
                accent: true,
              },
              {
                label: "Rate per recipient",
                value: balance.data?.wallet?.ratePerMsg,
                loading: balance.isPending,
                caption: "Credits deducted per message",
                icon: Coins,
              },
              {
                label: "Total transactions",
                value: ledger.data?.pagination?.total ?? null,
                loading: ledger.isPending,
                caption: "Recorded in your ledger",
                icon: History,
              },
            ]}
          />
        </div>
      </QueryState>
    )}
    <section className="credit-history" aria-labelledby="user-transactions-title">
      <div className="credit-ledger-toolbar">
        <div className="credit-ledger-heading"><h2 id="user-transactions-title" className="text-sm font-semibold text-foreground">Transaction history</h2><p>Allocations, credit requests and campaign usage.</p></div>
        <div className="credit-ledger-filters"><div className="credit-ledger-type-filter"><FilterSelect label="Transaction type" value={type} onChange={v => update("type", v)} options={[{ value: "all", label: "All transaction types" }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} /></div></div>
      </div>
    {transactionId && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm"><span>Showing selected transaction</span><button type="button" className="font-medium text-indigo-700 underline" onClick={() => setParams((previous) => { const next = new URLSearchParams(previous); next.delete("transaction"); next.delete("page"); return next; }, { replace: true })}>View all transactions</button></div>}
      <QueryState query={ledger}><div className="credit-ledger"><DataTable caption="Credit transactions" rows={ledger.data?.transactions || []} columns={columns} mobile={{ primary: "transactionId", secondary: "account", featured: ["amount", "type"] }} paginated={false} emptyTitle="No transactions found" /><Pager page={page} totalPages={ledger.data?.pagination?.totalPages || 1} total={ledger.data?.pagination?.total || 0} onChange={p => update("page", String(p))} disabled={ledger.isFetching} /></div></QueryState>
    </section>
    {params.get("request") && !user?.isPreview && <Dialog open onOpenChange={open => { if (!open && !request.isPending) update("request", ""); }}><DialogContent showCloseButton={!request.isPending}><DialogHeader><DialogTitle>{review ? "Review credit request" : "Request credits"}</DialogTitle><DialogDescription>A request does not change your balance. Your account manager allocates credits separately.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (request.isPending) return; if (review) request.mutate({ amount: Number(amount), note: note.trim() }); else setReview(true); }}>
        {review ? <div className="dashboard-note space-y-2"><p>Account: <strong>{user?.username}</strong></p><p>Requested credits: <strong>{number(Number(amount))}</strong></p>{note && <p className="whitespace-pre-wrap break-words">{note}</p>}</div> : <><Field id="request-amount" label="Credits requested"><Input id="request-amount" type="number" min="0.01" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} /></Field><Field id="request-note" label="Note (optional)"><Textarea id="request-note" rows={3} maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></Field></>}
        <FormError message={request.error?.message} /><div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={request.isPending} onClick={() => review ? setReview(false) : update("request", "")}>{review ? "Back" : "Cancel"}</Button><Button type="submit" disabled={request.isPending}>{request.isPending ? "Submitting..." : review ? "Submit request" : "Review request"}</Button></div>
      </form>
    </DialogContent></Dialog>}
  </>;
}
