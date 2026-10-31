import { useSearchParams } from "react-router";
import { Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useResellerQuery } from "../hooks/useReseller";
import { PageHeading, QueryState, FilterSelect, DataTable, Pager } from "@/features/admin/components/shared";
import ResellerActionForm from "../components/ResellerActionForm";
import { dateTime, number, ownerName } from "@/features/admin/lib/format";

const transactionLabels = { ALLOCATE: "Allocation", DEDUCT: "Deduction", REFUND: "Refund", RECLAIM: "Reclaim" };

/**
 * Reseller Credits page — shows the reseller's own wallet balance,
 * lets them allocate credits to their users (from own balance),
 * and view transaction history scoped to their accounts.
 */
export default function ResellerCredits({ activity = false }) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const type = params.get("type") || "all";
  const account = params.get("account") || "all";
  const allocation = params.get("allocate");
  const accountsQuery = useResellerQuery("accounts");
  const myBalance = useResellerQuery("myBalance", {}, !activity);
  const ledger = useResellerQuery("transactions", { page, limit: 10, ...(type !== "all" ? { type } : {}), ...(account !== "all" ? { userId: account } : {}) });
  const accounts = (accountsQuery.data?.users || []).filter((a) => a.role === "User");
  function update(key, value) { setParams((old) => { const next = new URLSearchParams(old); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.delete("page"); return next; }, { replace: true }); }
  const columns = [
    { key: "date", label: "Date", render: (t) => <span className="text-xs">{dateTime(t.createdAt)}</span> },
    { key: "type", label: "Type", render: (t) => transactionLabels[t.type] || t.type },
    { key: "from", label: "From", render: (t) => t.fromUser ? ownerName(t.fromUser) : "—" },
    { key: "to", label: "To", render: (t) => ownerName(t.toUser) },
    { key: "amount", label: "Credits", className: "text-right", render: (t) => <span className="font-medium tabular-nums">{number(t.amount)}</span> },
    { key: "actor", label: "Recorded by", render: (t) => ownerName(t.performedBy) },
    { key: "note", label: "Note", render: (t) => <span className="block max-w-60 whitespace-normal break-words text-xs text-muted-foreground">{t.notes || "—"}</span> },
  ];
  return <><PageHeading title={activity ? "Activity" : "Credits"} description={activity ? "Trace credit movements across your user accounts." : "Manage your credit balance and allocate credits to your users."} action={!activity && <Button onClick={() => update("allocate", "new")} disabled={!accounts.length || accountsQuery.isError}><Plus />Allocate credits</Button>} />
    {!activity && <QueryState query={myBalance}><div className="grid gap-3 sm:grid-cols-3">{[["Your wallet balance", number(myBalance.data?.wallet?.balance)], ["Total users", accounts.length], ["Active users", accounts.filter((a) => a.status === "active").length]].map(([label, value]) => <Card key={label} className="rounded-lg"><CardContent><p className="flex items-center justify-between text-xs text-muted-foreground">{label}<Wallet className="size-4" /></p><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>)}</div></QueryState>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-medium">Transaction history</h2><div className="flex flex-wrap gap-2"><FilterSelect label="Transaction type" value={type} onChange={(value) => update("type", value)} options={[{ value: "all", label: "All transactions" }, ...Object.entries(transactionLabels).map(([value, label]) => ({ value, label }))]} /><FilterSelect label="Filter by account" value={account} onChange={(value) => update("account", value)} disabled={!accountsQuery.isSuccess} options={[{ value: "all", label: "All accounts" }, ...accounts.map((a) => ({ value: a._id, label: `${a.username}` }))]} /></div></div>
    {accountsQuery.isError && <QueryState query={accountsQuery} />}
    <QueryState query={ledger}><div><DataTable caption="Credit transaction history" paginated={false} rows={ledger.data?.transactions || []} columns={columns} emptyTitle="No transactions found" /><Pager page={page} totalPages={ledger.data?.pagination?.totalPages || 1} total={ledger.data?.pagination?.total || 0} onChange={(value) => update("page", String(value))} disabled={ledger.isFetching} /></div></QueryState>
    {!activity && accountsQuery.isSuccess && !accounts.length && <p className="text-sm text-muted-foreground">Add a user account before allocating credits.</p>}
    {allocation && accountsQuery.isSuccess && accounts.length > 0 && <ResellerActionForm title="Allocate credits" description="Credits will be deducted from your wallet and added to the selected user's balance." action="allocate" successMessage="Credits allocated successfully" onClose={() => update("allocate", null)} initialValues={{ toUserId: accounts.some((a) => a._id === allocation) ? allocation : "", amount: "", notes: "" }} fields={[
      { key: "toUserId", label: "User", required: true, options: [{ value: "", label: "Select user" }, ...accounts.map((a) => ({ value: a._id, label: `${a.username} · ${a.email}` }))] },
      { key: "amount", label: "Credits to allocate", required: true, type: "number", min: 0.01, step: 0.01 },
      { key: "notes", label: "Transaction note", type: "textarea", maxLength: 500 },
    ]} payload={(v) => ({ toUserId: v.toUserId, amount: Number(v.amount), notes: v.notes.trim() })} review={(v) => <><p className="font-medium">{accounts.find((a) => a._id === v.toUserId)?.username}</p><p>Add <strong>{number(Number(v.amount))} credits</strong> from your wallet.</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{v.notes || "No transaction note."}</p></>} submitLabel="Allocate credits" />}
  </>;
}
