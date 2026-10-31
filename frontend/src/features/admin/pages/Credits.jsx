import { useState } from "react";
import { useSearchParams } from "react-router";
import {
  Plus,
  Wallet,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Coins,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminQuery } from "../hooks/useAdmin";
import { PageHeading, QueryState, FilterSelect, DataTable, Pager } from "../components/shared";
import ActionForm from "../components/ActionForm";
import { dateTime, number, ownerName } from "../lib/format";

const transactionLabels = {
  ALLOCATE: "Allocation",
  DEDUCT: "Deduction",
  REFUND: "Refund",
  RECLAIM: "Reclaim",
};

export default function Credits({ activity = false }) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const type = params.get("type") || "all";
  const account = params.get("account") || "all";
  const allocation = params.get("allocate");
  const [reclaimOpen, setReclaimOpen] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const accountsQuery = useAdminQuery("accounts");
  const overview = useAdminQuery("overview", {}, !activity);
  const reconcileQuery = useAdminQuery("reconcile", {}, showAudit);
  const ledger = useAdminQuery("transactions", {
    page,
    limit: 10,
    ...(type !== "all" ? { type } : {}),
    ...(account !== "all" ? { userId: account } : {}),
  });

  const accounts = (accountsQuery.data?.users || []).filter((a) => a.role !== "Super Admin");
  const resellers = accounts.filter((a) => a.role === "Reseller" && a.status === "active");

  function update(key, value) {
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        value ? next.set(key, value) : next.delete(key);
        if (key !== "page") next.delete("page");
        return next;
      },
      { replace: true }
    );
  }

  const columns = [
    {
      key: "date",
      label: "Date",
      render: (t) => <span className="text-xs text-muted-foreground">{dateTime(t.createdAt)}</span>,
    },
    {
      key: "type",
      label: "Type",
      render: (t) => {
        const isCreditIn = t.type === "ALLOCATE" || t.type === "REFUND";
        const style =
          t.type === "ALLOCATE"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : t.type === "REFUND"
            ? "border-cyan-200 bg-cyan-50 text-cyan-800"
            : t.type === "RECLAIM"
            ? "border-purple-200 bg-purple-50 text-purple-800"
            : "border-amber-200 bg-amber-50 text-amber-800";

        return (
          <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border ${style}`}>
            {isCreditIn ? <ArrowDownLeft className="size-3" /> : <ArrowUpRight className="size-3" />}
            {transactionLabels[t.type] || t.type}
          </span>
        );
      },
    },
    {
      key: "from",
      label: "From",
      render: (t) => (t.fromUser ? <span className="text-xs">{ownerName(t.fromUser)}</span> : <span className="text-xs font-medium text-muted-foreground">Admin Pool</span>),
    },
    {
      key: "to",
      label: "To",
      render: (t) => <span className="text-xs font-medium">{ownerName(t.toUser)}</span>,
    },
    {
      key: "amount",
      label: "Credits",
      className: "text-right",
      render: (t) => {
        const isPlus = t.type === "ALLOCATE" || t.type === "REFUND";
        return (
          <span className={`font-semibold tabular-nums text-sm ${isPlus ? "text-emerald-700" : "text-foreground"}`}>
            {isPlus ? "+" : "-"}{number(t.amount)}
          </span>
        );
      },
    },
    {
      key: "actor",
      label: "Recorded by",
      render: (t) => <span className="text-xs text-muted-foreground">{ownerName(t.performedBy)}</span>,
    },
    {
      key: "note",
      label: "Note / Reference",
      render: (t) => (
        <span className="block max-w-64 whitespace-normal break-words text-xs text-muted-foreground">
          {t.notes || "—"}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeading
        title={activity ? "Credit Activity & Audit" : "Credit Treasury & Allocation"}
        description={
          activity
            ? "Inspect double-entry ledger journals, campaign deductions, refunds, and operator actions."
            : "Allocate credits from your administrative pool, execute emergency recalls, and audit financial invariants."
        }
        action={
          !activity && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setReclaimOpen(true)}
                disabled={!resellers.length || accountsQuery.isError}
                className="gap-1.5 text-xs"
              >
                <RotateCcw className="size-3.5 text-amber-600" />
                Emergency Reclaim
              </Button>
              <Button
                onClick={() => update("allocate", "new")}
                disabled={!resellers.length || accountsQuery.isError}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Allocate Credits
              </Button>
            </div>
          )
        }
      />

      {!activity && (
        <QueryState query={overview}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  Your Credit Pool
                  <Wallet className="size-4" />
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-primary">Unlimited</p>
                <p className="mt-1 text-xs text-muted-foreground">Super Admin Treasury</p>
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  Total Allocated
                  <Coins className="size-4 text-emerald-500" />
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                  {number(overview.data?.stats?.credits?.totalAllocatedBySuperAdmin)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Cumulative grants</p>
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  Credits in Circulation
                  <RefreshCw className="size-4 text-blue-500" />
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                  {number(overview.data?.stats?.credits?.totalCreditsInCirculation)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Active wallet balances</p>
              </CardContent>
            </Card>
          </div>
        </QueryState>
      )}

      {/* Real-time Ledger Invariant Audit Card */}
      <Card className="rounded-lg border-dashed">
        <CardContent className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4.5 text-emerald-600" />
              <h2 className="text-sm font-semibold">Financial Ledger Integrity Monitor</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Mathematical guarantee: <code>Wallet Balance === Total Inflows - Total Outflows</code> with CAS atomic consistency.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAudit((prev) => !prev)}
            disabled={reconcileQuery.isFetching}
            className="gap-1.5"
          >
            <RefreshCw className={`size-3.5 ${reconcileQuery.isFetching ? "animate-spin" : ""}`} />
            {showAudit ? "Hide Audit Check" : "Run Invariant Audit"}
          </Button>
        </CardContent>

        {showAudit && (
          <div className="border-t p-4 sm:p-5 bg-muted/20">
            <QueryState query={reconcileQuery}>
              {reconcileQuery.data && (
                <div
                  className={`rounded-lg border p-4 space-y-2 text-xs ${
                    reconcileQuery.data.reconciliation?.isBalanced
                      ? "border-emerald-200 bg-emerald-50/70 text-emerald-950"
                      : "border-red-200 bg-red-50 text-red-950"
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {reconcileQuery.data.reconciliation?.isBalanced ? (
                      <>
                        <ShieldCheck className="size-4.5 text-emerald-600" />
                        <span>Audit Passed: System Ledger Fully Balanced</span>
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="size-4.5 text-red-600" />
                        <span>Discrepancy Detected in Journal</span>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 pt-2 border-t border-muted/40">
                    <div>
                      <p className="text-muted-foreground">Total Inflows</p>
                      <p className="text-sm font-bold tabular-nums">+{number(reconcileQuery.data.reconciliation?.totalInflow)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Total Outflows</p>
                      <p className="text-sm font-bold tabular-nums">-{number(reconcileQuery.data.reconciliation?.totalOutflow)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Calculated Balance</p>
                      <p className="text-sm font-bold tabular-nums">{number(reconcileQuery.data.reconciliation?.calculatedBalance)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Wallet Balance</p>
                      <p className="text-sm font-bold tabular-nums">{number(reconcileQuery.data.reconciliation?.walletBalance)}</p>
                    </div>
                  </div>
                </div>
              )}
            </QueryState>
          </div>
        )}
      </Card>

      {/* Transaction Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-sm font-semibold">Transaction Journal</h2>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Transaction type"
            value={type}
            onChange={(value) => update("type", value)}
            options={[
              { value: "all", label: "All transaction types" },
              ...Object.entries(transactionLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
          <FilterSelect
            label="Filter by account"
            value={account}
            onChange={(value) => update("account", value)}
            disabled={!accountsQuery.isSuccess}
            options={[
              { value: "all", label: "All accounts" },
              ...accounts.map((a) => ({ value: a._id, label: `${a.username} (${a.role})` })),
            ]}
          />
        </div>
      </div>

      {accountsQuery.isError && <QueryState query={accountsQuery} />}

      <QueryState query={ledger}>
        <div>
          <DataTable
            caption="Credit transaction history"
            paginated={false}
            rows={ledger.data?.transactions || []}
            columns={columns}
            emptyTitle="No transactions found"
          />
          <Pager
            page={page}
            totalPages={ledger.data?.pagination?.totalPages || 1}
            total={ledger.data?.pagination?.total || 0}
            onChange={(value) => update("page", String(value))}
            disabled={ledger.isFetching}
          />
        </div>
      </QueryState>

      {!activity && accountsQuery.isSuccess && !resellers.length && (
        <p className="text-sm text-muted-foreground">Add an active reseller account before allocating credits.</p>
      )}

      {/* Credit Allocation Dialog */}
      {allocation && accountsQuery.isSuccess && resellers.length > 0 && (
        <ActionForm
          title="Allocate Credits"
          description="Credits will be added to the selected reseller's wallet from your unlimited administrative pool."
          action="allocate"
          successMessage="Credits allocated successfully"
          onClose={() => update("allocate", null)}
          initialValues={{
            toUserId: resellers.some((a) => a._id === allocation) ? allocation : "",
            amount: "",
            notes: "",
          }}
          fields={[
            {
              key: "toUserId",
              label: "Target Reseller",
              required: true,
              options: [
                { value: "", label: "Select reseller" },
                ...resellers.map((a) => ({ value: a._id, label: `${a.username} · ${a.email}` })),
              ],
            },
            { key: "amount", label: "Credits to allocate", required: true, type: "number", min: 0.01, step: 0.01 },
            { key: "notes", label: "Transaction note / Invoice reference", type: "textarea", maxLength: 500 },
          ]}
          payload={(v) => ({ toUserId: v.toUserId, amount: Number(v.amount), notes: v.notes.trim() })}
          review={(v) => (
            <>
              <p className="font-medium">{resellers.find((a) => a._id === v.toUserId)?.username}</p>
              <p>
                Add <strong>{number(Number(v.amount))} credits</strong> to this wallet.
              </p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs mt-1">
                {v.notes || "No transaction note."}
              </p>
            </>
          )}
          submitLabel="Allocate credits"
        />
      )}

      {/* Emergency Reclaim Dialog */}
      {reclaimOpen && accountsQuery.isSuccess && (
        <ActionForm
          title="Emergency Credit Reclaim"
          description="Recall unspent credits from a reseller's wallet back to the administrative treasury."
          action="reclaim"
          successMessage="Credits reclaimed successfully"
          onClose={() => setReclaimOpen(false)}
          initialValues={{ fromUserId: "", amount: "", notes: "" }}
          fields={[
            {
              key: "fromUserId",
              label: "Source Reseller",
              required: true,
              options: [
                { value: "", label: "Select reseller" },
                ...resellers.map((a) => ({ value: a._id, label: `${a.username} · ${a.email}` })),
              ],
            },
            { key: "amount", label: "Credits to reclaim", required: true, type: "number", min: 0.01, step: 0.01 },
            { key: "notes", label: "Administrative audit justification", required: true, type: "textarea", maxLength: 500 },
          ]}
          payload={(v) => ({ fromUserId: v.fromUserId, amount: Number(v.amount), notes: v.notes.trim() })}
          review={(v) => (
            <>
              <p className="font-semibold text-destructive">Administrative Reclaim</p>
              <p>
                Recalling <strong>{number(Number(v.amount))} credits</strong> from{" "}
                {resellers.find((a) => a._id === v.fromUserId)?.username}.
              </p>
              <p className="text-muted-foreground text-xs mt-1">Reason: {v.notes}</p>
            </>
          )}
          submitLabel="Execute Reclaim"
        />
      )}
    </>
  );
}
