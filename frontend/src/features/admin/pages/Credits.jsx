import { useSearchParams } from "react-router";
import { Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminQuery } from "../hooks/useAdmin";
import { PageHeading, QueryState, FilterSelect, DataTable, Pager } from "../components/shared";
import ActionForm from "../components/ActionForm";
import { dateTime, number, ownerName } from "../lib/format";

const transactionLabels = { ALLOCATE: "Allocation", DEDUCT: "Deduction", REFUND: "Refund", RECLAIM: "Reclaim" };

export default function Credits({ activity = false }) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const type = params.get("type") || "all";
  const account = params.get("account") || "all";
  const allocation = params.get("allocate");
  const accountsQuery = useAdminQuery("accounts");
  const overview = useAdminQuery("overview", {}, !activity);
  const ledger = useAdminQuery("transactions", { page, limit: 10, ...(type !== "all" ? { type } : {}), ...(account !== "all" ? { userId: account } : {}) });
  const accounts = (accountsQuery.data?.users || []).filter((a) => a.role !== "Super Admin");
  const resellers = accounts.filter((a) => a.role === "Reseller" && a.status === "active");
  function update(key, value) { setParams((old) => { const next = new URLSearchParams(old); value ? next.set(key, value) : next.delete(key); if (key !== "page") next.delete("page"); return next; }, { replace: true }); }
  const columns = [
    { key: "date", label: "Date", render: (t) => <span className="text-xs">{dateTime(t.createdAt)}</span> },
    { key: "type", label: "Type", render: (t) => transactionLabels[t.type] || t.type },
    { key: "from", label: "From", render: (t) => t.fromUser ? ownerName(t.fromUser) : "Super Admin pool" },
    { key: "to", label: "To", render: (t) => ownerName(t.toUser) },
    { key: "amount", label: "Credits", className: "text-right", render: (t) => <span className="font-medium tabular-nums">{number(t.amount)}</span> },
    { key: "actor", label: "Recorded by", render: (t) => ownerName(t.performedBy) },
    { key: "note", label: "Note", render: (t) => <span className="block max-w-60 whitespace-normal break-words text-xs text-muted-foreground">{t.notes || "—"}</span> },
  ];
  return <><PageHeading title={activity ? "Activity" : "Credits"} description={activity ? "Trace credit movements and the account that recorded each transaction." : "Allocate credits from your unlimited pool to reseller accounts."} action={!activity && <Button onClick={() => update("allocate", "new")} disabled={!resellers.length || accountsQuery.isError}><Plus />Allocate credits</Button>} />
    {!activity && <QueryState query={overview}><div className="grid gap-3 sm:grid-cols-3">{[["Your credit pool", "Unlimited"], ["Total allocated", number(overview.data?.stats?.credits?.totalAllocatedBySuperAdmin)], ["Credits in circulation", number(overview.data?.stats?.credits?.totalCreditsInCirculation)]].map(([label, value]) => <Card key={label} className="rounded-lg"><CardContent><p className="flex items-center justify-between text-xs text-muted-foreground">{label}<Wallet className="size-4" /></p><p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>)}</div></QueryState>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-medium">Transaction history</h2><div className="flex flex-wrap gap-2"><FilterSelect label="Transaction type" value={type} onChange={(value) => update("type", value)} options={[{ value: "all", label: "All transactions" }, ...Object.entries(transactionLabels).map(([value, label]) => ({ value, label }))]} /><FilterSelect label="Filter by account" value={account} onChange={(value) => update("account", value)} disabled={!accountsQuery.isSuccess} options={[{ value: "all", label: "All accounts" }, ...accounts.map((a) => ({ value: a._id, label: `${a.username} (${a.role})` }))]} /></div></div>
    {accountsQuery.isError && <QueryState query={accountsQuery} />}
    <QueryState query={ledger}><div><DataTable caption="Credit transaction history" paginated={false} rows={ledger.data?.transactions || []} columns={columns} emptyTitle="No transactions found" /><Pager page={page} totalPages={ledger.data?.pagination?.totalPages || 1} total={ledger.data?.pagination?.total || 0} onChange={(value) => update("page", String(value))} disabled={ledger.isFetching} /></div></QueryState>
    {!activity && accountsQuery.isSuccess && !resellers.length && <p className="text-sm text-muted-foreground">Add an active reseller account before allocating credits.</p>}
    {allocation && accountsQuery.isSuccess && resellers.length > 0 && <ActionForm title="Allocate credits" description="Credits will be added to the selected reseller's wallet from your unlimited pool." action="allocate" successMessage="Credits allocated successfully" onClose={() => update("allocate", null)} initialValues={{ toUserId: resellers.some((a) => a._id === allocation) ? allocation : "", amount: "", notes: "" }} fields={[
      { key: "toUserId", label: "Reseller", required: true, options: [{ value: "", label: "Select reseller" }, ...resellers.map((a) => ({ value: a._id, label: `${a.username} · ${a.email}` }))] },
      { key: "amount", label: "Credits to allocate", required: true, type: "number", min: 0.01, step: 0.01 },
      { key: "notes", label: "Transaction note", type: "textarea", maxLength: 500 },
    ]} payload={(v) => ({ toUserId: v.toUserId, amount: Number(v.amount), notes: v.notes.trim() })} review={(v) => <><p className="font-medium">{resellers.find((a) => a._id === v.toUserId)?.username}</p><p>Add <strong>{number(Number(v.amount))} credits</strong> to this wallet.</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{v.notes || "No transaction note."}</p></>} submitLabel="Allocate credits" />}
  </>;
}
