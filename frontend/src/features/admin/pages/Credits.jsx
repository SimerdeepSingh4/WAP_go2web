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
  ALLOCATE: "Credit Added",
  DEDUCT: "Campaign Usage",
  REFUND: "Refund",
  RECLAIM: "Credit Deducted",
};

/**
 * Super Admin Transaction Display:
 * - RECLAIM: Credits deducted/returned from reseller -> Inflow (+, Green, ↙)
 * - ALLOCATE (from Super Admin): Credits given to Reseller -> Outflow (-, Blue, ↗)
 * - ALLOCATE (Reseller to User): Client transfer -> Transfer (neutral, Stone, →)
 * - DEDUCT: Message delivery usage -> Deduction (-, Red, ↘)
 * - REFUND: Delivery failure refund -> Refund (+, Cyan, ↙)
 */
function getTransactionDisplay(t) {
  const isFromSuperAdmin = !t.fromUser || t.fromUser?.role === "Super Admin";

  if (t.type === "RECLAIM") {
    return {
      label: "Credit Deducted",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800",
      amountClass: "text-emerald-700 font-semibold",
      sign: "+",
      icon: ArrowDownLeft,
    };
  }

  if (t.type === "ALLOCATE") {
    if (isFromSuperAdmin) {
      return {
        label: "Credit Added",
        badgeClass: "border-blue-200 bg-blue-50 text-blue-800",
        amountClass: "text-blue-700 font-semibold",
        sign: "-",
        icon: ArrowUpRight,
      };
    } else {
      return {
        label: "Transfer",
        badgeClass: "border-stone-200 bg-stone-100 text-stone-700",
        amountClass: "text-stone-700 font-medium",
        sign: "→",
        icon: ArrowRight,
      };
    }
  }

  if (t.type === "DEDUCT") {
    return {
      label: "Campaign Usage",
      badgeClass: "border-red-200 bg-red-50 text-red-800",
      amountClass: "text-red-700 font-semibold",
      sign: "-",
      icon: ArrowDownRight,
    };
  }

  if (t.type === "REFUND") {
    return {
      label: "Refund",
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
      label: "Date",
      render: (t) => <span className="text-xs text-muted-foreground">{dateTime(t.createdAt)}</span>,
    },
    {
      key: "type",
      label: "Type",
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
      label: "From",
      render: (t) => (t.fromUser ? <span className="text-xs">{ownerName(t.fromUser)}</span> : <span className="text-xs font-medium text-muted-foreground">Super Admin</span>),
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
      label: "By",
      render: (t) => <span className="text-xs text-muted-foreground">{ownerName(t.performedBy)}</span>,
    },
    {
      key: "note",
      label: "Note",
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
        title={activity ? "Credit History" : "Credits"}
        description={
          activity
            ? "View all credit transactions, campaign usage, and refunds."
            : "Add or deduct credits for resellers, and view transaction history."
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
                Deduct Credits
              </Button>
              <Button
                onClick={() => update("allocate", "new")}
                disabled={!resellers.length || accountsQuery.isError}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Add Credits
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
                  Super Admin Balance
                  <Wallet className="size-4 text-muted-foreground" />
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-primary">Unlimited</p>
                <p className="mt-1 text-xs text-muted-foreground">Unlimited sending credits</p>
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  Total Credits Given
                  <Coins className="size-4 text-emerald-600" />
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                  {number(overview.data?.stats?.credits?.totalAllocatedBySuperAdmin)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Total credits added to resellers</p>
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  Reseller Balances
                  <TrendingUp className="size-4 text-blue-600" />
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                  {number(overview.data?.stats?.credits?.totalCreditsInCirculation)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Current credits held by resellers</p>
              </CardContent>
            </Card>
          </div>
        </QueryState>
      )}

      {/* Transaction Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-sm font-semibold">Transactions</h2>
        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Transaction type"
            value={type}
            onChange={(value) => update("type", value)}
            options={[
              { value: "all", label: "All types" },
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
          title="Add Credits"
          description="Add credits to the selected reseller's wallet."
          action="allocate"
          successMessage="Credits added successfully"
          onClose={() => update("allocate", null)}
          initialValues={{
            toUserId: resellers.some((a) => a._id === allocation) ? allocation : "",
            amount: "",
            notes: "",
            expiryYears: "2",
          }}
          fields={[
            {
              key: "toUserId",
              label: "Select Reseller",
              required: true,
              options: [
                { value: "", label: "Select reseller" },
                ...resellers.map((a) => ({ value: a._id, label: `${a.username} · ${a.email}` })),
              ],
            },
            { key: "amount", label: "Credits to add", required: true, type: "number", min: 0.01, step: 0.01 },
            {
              key: "expiryYears",
              label: "Credit Validity in Years (Type e.g. 2, or 0 for Never)",
              required: true,
              type: "number",
              min: 0,
              step: "any",
              hint: "Type validity in years (e.g. 2 for 2 years, 0.5 for 6 months, 0 for never expires).",
            },
            { key: "notes", label: "Note (Optional)", type: "textarea", maxLength: 500 },
          ]}
          payload={(v) => ({
            toUserId: v.toUserId,
            amount: Number(v.amount),
            expiryYears: Number(v.expiryYears),
            notes: v.notes.trim(),
          })}
          review={(v) => (
            <>
              <p className="font-medium">{resellers.find((a) => a._id === v.toUserId)?.username}</p>
              <p>
                Add <strong>{number(Number(v.amount))} credits</strong> to this account.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Validity: <strong>{v.expiryYears === "0" ? "Never expires" : `${v.expiryYears} Year(s)`}</strong> (credits will lock if expired)
              </p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs mt-1">
                {v.notes || "No note."}
              </p>
            </>
          )}
          submitLabel="Add Credits"
        />
      )}

      {/* Deduct Credits Dialog */}
      {reclaimOpen && accountsQuery.isSuccess && (
        <ActionForm
          title="Deduct Credits"
          description="Take back unused credits from a reseller account."
          action="reclaim"
          successMessage="Credits deducted successfully"
          onClose={() => setReclaimOpen(false)}
          initialValues={{ fromUserId: "", amount: "", notes: "" }}
          fields={[
            {
              key: "fromUserId",
              label: "Select Reseller",
              required: true,
              options: [
                { value: "", label: "Select reseller" },
                ...resellers.map((a) => ({ value: a._id, label: `${a.username} · ${a.email}` })),
              ],
            },
            { key: "amount", label: "Credits to deduct", required: true, type: "number", min: 0.01, step: 0.01 },
            { key: "notes", label: "Reason", required: true, type: "textarea", maxLength: 500 },
          ]}
          payload={(v) => ({ fromUserId: v.fromUserId, amount: Number(v.amount), notes: v.notes.trim() })}
          review={(v) => (
            <>
              <p className="font-semibold text-destructive">Deduct Credits</p>
              <p>
                Taking back <strong>{number(Number(v.amount))} credits</strong> from{" "}
                {resellers.find((a) => a._id === v.fromUserId)?.username}.
              </p>
              <p className="text-muted-foreground text-xs mt-1">Reason: {v.notes}</p>
            </>
          )}
          submitLabel="Deduct Credits"
        />
      )}
    </>
  );
}
