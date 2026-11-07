import TransactionReference from "@/components/dashboard/TransactionReference";
import "./admin-transactions.css";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
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
  ReceiptText,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminQuery } from "../hooks/useAdmin";
import {
  PageHeading,
  QueryState,
  FilterSelect,
  SearchBox,
  StatusBadge,
  DataTable,
  Pager,
} from "../components/shared";
import ActionForm from "../components/ActionForm";
import { dateTime, number, ownerName } from "../lib/format";

const transactionLabels = {
  REQUEST: "Credit request",
  ALLOCATE: "Credit Added",
  DEDUCT: "Campaign Usage",
  REFUND: "Refund",
  RECLAIM: "Credit Deducted",
};

/**
 * Super Admin Transaction Display:
 * - RECLAIM: Credits deducted/returned from reseller -> Inflow (+, Green, ↙)
 * - ALLOCATE (from Super Admin): Credits given to Reseller/User -> Outflow (-, Blue, ↗)
 * - ALLOCATE (Reseller to User): Client transfer -> Transfer (neutral, Stone, →)
 * - DEDUCT: Message delivery usage -> Deduction (-, Red, ↘)
 * - REFUND: Delivery failure refund -> Refund (+, Cyan, ↙)
 */
function getTransactionDisplay(t) {
  if(t.type === "REQUEST") return {label:"Credit request",badgeClass:"border-amber-200 bg-amber-50 text-amber-800",amountClass:"text-amber-800 font-medium",sign:"",icon:Coins};
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
  const transactionId = params.get("transaction");
  const account = params.get("account") || "all";
  const allocation = params.get("allocate");

  const [reclaimOpen, setReclaimOpen] = useState(false);
  const [reclaimAccount, setReclaimAccount] = useState(null);
  const [walletSearch, setWalletSearch] = useState("");
  const [walletRole, setWalletRole] = useState("all");

  const accountsQuery = useAdminQuery("accounts");
  const overview = useAdminQuery("overview", {}, !activity);
  const ledger = useAdminQuery(
    "transactions",
    {
      page,
      limit: 10,
      ...(transactionId ? { transactionId } : {}),
      ...(type !== "all" ? { type } : {}),
      ...(account !== "all" ? { userId: account } : {}),
    },
    activity
  );

  const accounts = (accountsQuery.data?.users || []).filter((a) => a.role !== "Super Admin");
  const activeAccounts = accounts.filter((a) => a.status === "active");

  const filteredAccounts = accounts.filter((a) => {
    const matchesSearch = `${a.username} ${a.email} ${a.resellerId?.username || ""}`
      .toLowerCase()
      .includes(walletSearch.toLowerCase());
    const matchesRole = walletRole === "all" || a.role === walletRole;
    return matchesSearch && matchesRole;
  });

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

  // Columns for the Transaction History Table
  const transactionColumns = [
    { key: "transactionId", label: "Transaction ID", render: transaction => <TransactionReference transaction={transaction} /> },
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
    {
      key: "actions",
      label: "Action",
      className: "transaction-action-cell",
      render: (t) => t.type === "REQUEST" ? (
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          className="transaction-allocate-button"
          render={<Link to={`/admin/credits?allocate=${t.toUser?._id || t.toUser}&amount=${t.amount}`} />}
        >
          <Plus aria-hidden="true" className="size-3.5" />
          Allocate credits
        </Button>
      ) : <span className="text-muted-foreground" aria-label="No action available">&mdash;</span>,
    },
  ];

  // Columns for the Account Wallets & Balances Table (Credits view)
  const walletColumns = [
    {
      key: "account",
      label: "Account",
      sort: (a) => a.username,
      render: (a) => (
        <div className="max-w-44 truncate">
          <p className="font-medium text-foreground truncate">{a.username}</p>
          <p className="text-xs text-muted-foreground truncate">{a.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      sort: (a) => a.role,
      render: (a) => (
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border ${
            a.role === "Reseller"
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-stone-200 bg-stone-50 text-stone-700"
          }`}
        >
          {a.role}
        </span>
      ),
    },
    {
      key: "reseller",
      label: "Assigned reseller",
      render: (a) =>
        a.role === "User" ? (
          <span className="text-xs text-muted-foreground">{a.resellerId?.username || "Direct (Admin)"}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "balance",
      label: "Wallet balance",
      sort: (a) => a.wallet?.balance ?? 0,
      render: (a) => {
        const isLocked = a.wallet?.isLocked || a.wallet?.isExpired;
        return (
          <div className="flex items-center gap-1.5">
            <span className={`tabular-nums font-semibold text-sm ${isLocked ? "text-red-700" : "text-foreground"}`}>
              {number(a.wallet?.balance ?? 0)}
            </span>
            <span className="text-[11px] text-muted-foreground">credits</span>
            {isLocked && <Lock className="size-3 text-red-600" title="Locked or Expired" />}
          </div>
        );
      },
    },
    {
      key: "rate",
      label: "Rate / recipient",
      sort: (a) => a.ratePerMsg,
      render: (a) => <span className="tabular-nums text-xs">{number(a.ratePerMsg)}</span>,
    },
    {
      key: "expiry",
      label: "Credit validity",
      render: (a) => {
        if (!a.wallet?.expiresAt) return <span className="text-xs text-muted-foreground">No expiry</span>;
        return (
          <span className={`text-xs ${a.wallet?.isExpired ? "text-destructive font-medium" : "text-muted-foreground"}`}>
            {dateTime(a.wallet.expiresAt)}
            {a.wallet.isExpired && " (Expired)"}
          </span>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      render: (a) => <StatusBadge status={a.isExpired ? "expired" : a.status} />,
    },
    {
      key: "actions",
      label: <span className="sr-only">Actions</span>,
      className: "text-right",
      render: (a) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1 px-2.5"
            onClick={() => update("allocate", a._id)}
          >
            <Plus className="size-3" />
            Add credits
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 px-2 text-amber-700 hover:text-amber-800"
            onClick={() => {
              setReclaimAccount(a);
              setReclaimOpen(true);
            }}
          >
            <RotateCcw className="size-3" />
            Reclaim
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
            render={<Link to={`/admin/activity?account=${a._id}`} />}
            title="View transactions for this account"
          >
            <ReceiptText className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  // Modals for Allocation & Reclaim
  const modals = (
    <>
      {/* Credit Allocation Dialog */}
      {allocation && accountsQuery.isSuccess && activeAccounts.length > 0 && (
        <ActionForm
          title="Add Credits"
          description="Add credits to the selected reseller or user wallet."
          action="allocate"
          successMessage="Credits added successfully"
          onClose={() => update("allocate", null)}
          initialValues={{
            toUserId: accounts.some((a) => a._id === allocation) ? allocation : "",
            amount: params.get("amount") || "",
            notes: "",
            expiryYears: "2",
          }}
          fields={[
            {
              key: "toUserId",
              label: "Select Account (User or Reseller)",
              required: true,
              options: [
                { value: "", label: "Select account" },
                ...accounts
                  .filter((a) => a.status === "active" || a._id === allocation)
                  .map((a) => ({ value: a._id, label: `${a.username} (${a.role}) · ${a.email}` })),
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
          review={(v) => {
            const target = accounts.find((a) => a._id === v.toUserId);
            return (
              <>
                <p className="font-medium text-foreground">{target?.username} <span className="text-xs text-muted-foreground font-normal">({target?.role})</span></p>
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
            );
          }}
          submitLabel="Add Credits"
        />
      )}

      {/* Reclaim credits Dialog */}
      {reclaimOpen && accountsQuery.isSuccess && activeAccounts.length > 0 && (
        <ActionForm
          title="Reclaim credits"
          description="Take back unused credits from an account."
          action="reclaim"
          successMessage="Credits deducted successfully"
          onClose={() => {
            setReclaimOpen(false);
            setReclaimAccount(null);
          }}
          initialValues={{
            fromUserId: reclaimAccount ? reclaimAccount._id : "",
            amount: "",
            notes: "",
          }}
          fields={[
            {
              key: "fromUserId",
              label: "Select Account (User or Reseller)",
              required: true,
              options: [
                { value: "", label: "Select account" },
                ...accounts
                  .filter((a) => a.status === "active")
                  .map((a) => ({ value: a._id, label: `${a.username} (${a.role}) · ${a.email}` })),
              ],
            },
            { key: "amount", label: "Credits to deduct", required: true, type: "number", min: 0.01, step: 0.01 },
            { key: "notes", label: "Reason (optional)", type: "textarea", maxLength: 500, placeholder: "e.g. Account closure, overpayment reversal" },
          ]}
          payload={(v) => ({ fromUserId: v.fromUserId, amount: Number(v.amount), notes: (v.notes || "").trim() })}
          review={(v) => {
            const target = accounts.find((a) => a._id === v.fromUserId);
            return (
              <>
                <p className="font-semibold text-destructive">Reclaim credits</p>
                <p>
                  Taking back <strong>{number(Number(v.amount))} credits</strong> from{" "}
                  {target?.username} ({target?.role}).
                </p>
                <p className="text-muted-foreground text-xs mt-1">Reason: {v.notes ? v.notes.trim() : "None"}</p>
              </>
            );
          }}
          submitLabel="Reclaim credits"
        />
      )}
    </>
  );

  // ─────────────────────────────────────────────────────────────
  // VIEW 1: CREDITS & WALLETS (Activity = false)
  // ─────────────────────────────────────────────────────────────
  if (!activity) {
    return (
      <>
        <PageHeading
          title="Credits & Wallets"
          description="Manage wallet balances, allocate credits to users and resellers, and track network balances."
          action={
            <div data-tour="credit-actions" className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setReclaimAccount(null);
                  setReclaimOpen(true);
                }}
                disabled={!activeAccounts.length || accountsQuery.isError}
                className="gap-1.5 text-xs"
              >
                <RotateCcw className="size-3.5 text-amber-600" />
                Reclaim credits
              </Button>
              <Button
                onClick={() => update("allocate", "new")}
                disabled={!activeAccounts.length || accountsQuery.isError}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Add Credits
              </Button>
            </div>
          }
        />

        {/* Overview Stats Cards */}
        <QueryState query={overview}>
          <div data-tour="credit-summary" className="grid gap-3 sm:grid-cols-3">
            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  Super Admin Balance
                  <Wallet className="size-4 text-muted-foreground" />
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight text-primary">Unlimited</p>
                <p className="mt-1 text-xs text-muted-foreground">Unlimited sending pool</p>
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
                <p className="mt-1 text-xs text-muted-foreground">Total credits added across network</p>
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <p className="flex items-center justify-between text-xs text-muted-foreground">
                  Circulating Balances
                  <TrendingUp className="size-4 text-blue-600" />
                </p>
                <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">
                  {number(overview.data?.stats?.credits?.totalCreditsInCirculation)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Current credits held in user/reseller wallets</p>
              </CardContent>
            </Card>
          </div>
        </QueryState>

        {/* Account Wallets & Balances Section */}
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Account Wallet Balances</h2>
              <p className="text-xs text-muted-foreground">Live wallet balances across all resellers and client users</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SearchBox
                label="Search account..."
                value={walletSearch}
                onChange={setWalletSearch}
              />
              <FilterSelect
                label="Filter by role"
                value={walletRole}
                onChange={setWalletRole}
                options={[
                  { value: "all", label: "All accounts" },
                  { value: "Reseller", label: "Resellers" },
                  { value: "User", label: "Users" },
                ]}
              />
            </div>
          </div>

          <QueryState query={accountsQuery} empty={!filteredAccounts.length} emptyTitle="No accounts found">
            <DataTable
              caption="Account wallets and balances"
              rows={filteredAccounts}
              columns={walletColumns}
              pageSize={10}
            />
          </QueryState>
        </div>

        {modals}
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VIEW 2: TRANSACTIONS AUDIT LEDGER (Activity = true)
  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeading
        title="Transactions"
        description="Complete audit log of all credit allocations, campaign charges, refunds, and deductions."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/admin/credits" />}
              className="gap-1.5 text-xs"
            >
              <Wallet className="size-3.5 text-primary" />
              Manage Wallets
            </Button>
            <Button
              onClick={() => update("allocate", "new")}
              disabled={!activeAccounts.length || accountsQuery.isError}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              Add Credits
            </Button>
          </div>
        }
      />

      {/* Transaction Filter Header */}
      <div className="transaction-ledger-toolbar">
        <h2 className="text-sm font-semibold">Transaction Audit Ledger</h2>
        <div className="transaction-ledger-filters">
          <div className="transaction-type-filter">
          <FilterSelect
            label="Transaction type"
            value={type}
            onChange={(value) => update("type", value)}
            options={[
              { value: "all", label: "All types" },
              ...Object.entries(transactionLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
          </div>
          <div className="transaction-account-filter">
          <FilterSelect
            label="Filter by account"
            accountSearch={{}}
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
      </div>

      {transactionId && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm"><span>Showing selected transaction</span><button type="button" className="font-medium text-indigo-700 underline" onClick={() => setParams((previous) => { const next = new URLSearchParams(previous); next.delete("transaction"); next.delete("page"); return next; }, { replace: true })}>View all transactions</button></div>}
      <QueryState query={ledger}>
        <div className="transaction-ledger-table">
          <DataTable
            caption="Credit transaction history"
            paginated={false}
            rows={ledger.data?.transactions || []}
            columns={transactionColumns}
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

      {modals}
    </>
  );
}
