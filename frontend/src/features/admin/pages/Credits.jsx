import { useState } from "react";
import { useSearchParams } from "react-router";
import {
  Plus,
  Wallet,
  RotateCcw,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  Coins,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminQuery } from "../hooks/useAdmin";
import { PageHeading, QueryState, FilterSelect, DataTable, Pager } from "../components/shared";
import ActionForm from "../components/ActionForm";
import { dateTime, number, ownerName } from "../lib/format";

const transactionLabels = {
  ALLOCATE: "Allocation",
  DEDUCT: "Usage Deduction",
  REFUND: "Auto-Refund",
  RECLAIM: "Administrative Recall",
};

/**
 * Super Admin Accounting Perspective:
 * - RECLAIM: Credits reclaimed from partner into Master Reserve -> Inflow (+, Green, ↙)
 * - ALLOCATE (from Master Reserve): Credits released from Reserve to Reseller -> Outflow (-, Blue, ↗)
 * - ALLOCATE (Reseller to User): Downstream client transfer -> Transfer (neutral, Stone, →)
 * - DEDUCT: Message delivery consumption -> Deduction (-, Red, ↘)
 * - REFUND: Delivery failure auto-refund -> Refund (+, Cyan, ↙)
 */
function getTransactionDisplay(t) {
  const isFromMasterReserve = !t.fromUser || t.fromUser?.role === "Super Admin";

  if (t.type === "RECLAIM") {
    return {
      label: "Administrative Recall",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
      amountClass: "text-emerald-700 font-semibold",
      sign: "+",
      icon: ArrowDownLeft,
    };
  }

  if (t.type === "ALLOCATE") {
    if (isFromMasterReserve) {
      return {
        label: "Allocation",
        badgeClass: "border-blue-200 bg-blue-50 text-blue-800",
        amountClass: "text-blue-700 font-semibold",
        sign: "-",
        icon: ArrowUpRight,
      };
    } else {
      return {
        label: "Client Transfer",
        badgeClass: "border-stone-200 bg-stone-100 text-stone-700",
        amountClass: "text-stone-700 font-medium",
        sign: "→",
        icon: ArrowRight,
      };
    }
  }

  if (t.type === "DEDUCT") {
    return {
      label: "Usage Deduction",
      badgeClass: "border-red-200 bg-red-50 text-red-800",
      amountClass: "text-red-700 font-semibold",
      sign: "-",
      icon: ArrowDownRight,
    };
  }

  if (t.type === "REFUND") {
    return {
      label: "Auto-Refund",
      badgeClass: "border-cyan-200 bg-cyan-50 text-cyan-800",
      amountClass: "text-cyan-700 font-semibold",
      sign: "+",
      icon: ArrowDownLeft,
    };
  }

  return {
    label: t.type,
    badgeClass: "border-stone-200 bg-stone-50 text-stone-700",
    amountClass: "text-stone-700 font-medium",
    sign: "",
    icon: ArrowRight,
  };
}

export default function Credits({ activity = false }) {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const type = params.get("type") || "all";
  const account = params.get("account") || "all";
  const allocation = params.get("allocate");
  const [reclaimOpen, setReclaimOpen] = useState(false);

  const accountsQuery = useAdminQuery("accounts");
  const overview = useAdminQuery("overview", {}, !activity);
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
      label: "Timestamp",
      render: (t) => <span className="text-xs text-muted-foreground">{dateTime(t.createdAt)}</span>,
    },
    {
      key: "type",
      label: "Transaction Type",
      render: (t) => {
        const info = getTransactionDisplay(t);
        const Icon = info.icon;
        return (
          <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium border ${info.badgeClass}`}>
            <Icon className="size-3 shrink-0" />
            {info.label}
          </span>
        );
      },
    },
    {
      key: "from",
      label: "Source",
      render: (t) => (t.fromUser ? <span className="text-xs">{ownerName(t.fromUser)}</span> : <span className="text-xs font-medium text-muted-foreground">Master Reserve</span>),
    },
    {
      key: "to",
      label: "Beneficiary",
      render: (t) => <span className="text-xs font-medium">{ownerName(t.toUser)}</span>,
    },
    {
      key: "amount",
      label: "Credits",
      className: "text-right",
      render: (t) => {
        const info = getTransactionDisplay(t);
        return (
          <span className={`tabular-nums text-sm ${info.amountClass}`}>
            {info.sign}{number(t.amount)}
          </span>
        );
      },
    },
    {
      key: "actor",
      label: "Authorized By",
      render: (t) => <span className="text-xs text-muted-foreground">{ownerName(t.performedBy)}</span>,
    },
    {
      key: "note",
      label: "Reference Note",
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
        title={activity ? "Audit Log & Journal" : "Credit Treasury & Disbursement"}
        description={
          activity
            ? "Inspect double-entry journal records, campaign usage deductions, automatic refunds, and administrative actions."
            : "Disburse messaging credits to reseller partners, manage balance reserves, and audit transaction records."
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
                Emergency Recall
              </Button>
              <Button
                onClick={() => update("allocate", "new")}
                disabled={!resellers.length || accountsQuery.isError}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Disburse Credits
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
                  Master Credit Reserve
                  <Wallet className="size-4 text-muted-foreground" />
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-primary">Uncapped</p>
                <p className="mt-1 text-xs text-muted-foreground">Primary Issuance Authority</p>
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  Total Disbursed
                  <Coins className="size-4 text-emerald-600" />
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                  {number(overview.data?.stats?.credits?.totalAllocatedBySuperAdmin)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Cumulative network allocations</p>
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  Active Circulation
                  <TrendingUp className="size-4 text-blue-600" />
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                  {number(overview.data?.stats?.credits?.totalCreditsInCirculation)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Outstanding reseller balances</p>
              </CardContent>
            </Card>
          </div>
        </QueryState>
      )}

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
          title="Disburse Credits"
          description="Credits will be transferred to the selected reseller's operational wallet from the master reserve."
          action="allocate"
          successMessage="Credits disbursed successfully"
          onClose={() => update("allocate", null)}
          initialValues={{
            toUserId: resellers.some((a) => a._id === allocation) ? allocation : "",
            amount: "",
            notes: "",
          }}
          fields={[
            {
              key: "toUserId",
              label: "Target Reseller Account",
              required: true,
              options: [
                { value: "", label: "Select reseller" },
                ...resellers.map((a) => ({ value: a._id, label: `${a.username} · ${a.email}` })),
              ],
            },
            { key: "amount", label: "Credits to Disburse", required: true, type: "number", min: 0.01, step: 0.01 },
            { key: "notes", label: "Invoice / Reference Note", type: "textarea", maxLength: 500 },
          ]}
          payload={(v) => ({ toUserId: v.toUserId, amount: Number(v.amount), notes: v.notes.trim() })}
          review={(v) => (
            <>
              <p className="font-medium">{resellers.find((a) => a._id === v.toUserId)?.username}</p>
              <p>
                Disburse <strong>{number(Number(v.amount))} credits</strong> to this account.
              </p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs mt-1">
                {v.notes || "No reference note."}
              </p>
            </>
          )}
          submitLabel="Confirm Disbursement"
        />
      )}

      {/* Emergency Reclaim Dialog */}
      {reclaimOpen && accountsQuery.isSuccess && (
        <ActionForm
          title="Administrative Credit Recall"
          description="Recall unspent credits from a partner account back into the primary reserve."
          action="reclaim"
          successMessage="Credits recalled successfully"
          onClose={() => setReclaimOpen(false)}
          initialValues={{ fromUserId: "", amount: "", notes: "" }}
          fields={[
            {
              key: "fromUserId",
              label: "Source Account",
              required: true,
              options: [
                { value: "", label: "Select reseller" },
                ...resellers.map((a) => ({ value: a._id, label: `${a.username} · ${a.email}` })),
              ],
            },
            { key: "amount", label: "Credits to Recall", required: true, type: "number", min: 0.01, step: 0.01 },
            { key: "notes", label: "Justification / Audit Reason", required: true, type: "textarea", maxLength: 500 },
          ]}
          payload={(v) => ({ fromUserId: v.fromUserId, amount: Number(v.amount), notes: v.notes.trim() })}
          review={(v) => (
            <>
              <p className="font-semibold text-destructive">Administrative Recall Notice</p>
              <p>
                Recalling <strong>{number(Number(v.amount))} credits</strong> from{" "}
                {resellers.find((a) => a._id === v.fromUserId)?.username}.
              </p>
              <p className="text-muted-foreground text-xs mt-1">Audit reason: {v.notes}</p>
            </>
          )}
          submitLabel="Execute Recall"
        />
      )}
    </>
  );
}
