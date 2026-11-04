import { useAuth } from "@/features/auth/hooks/useAuth";
import { useSearchParams } from "react-router";
import { useState } from "react";
import {
  Plus,
  Wallet,
  Lock,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowRight,
  Coins,
  Users,
  CheckCircle2,
  RefreshCw,
  MinusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useResellerQuery } from "../hooks/useReseller";
import { PageHeading, QueryState, FilterSelect, DataTable, Pager } from "@/features/admin/components/shared";
import ResellerActionForm from "../components/ResellerActionForm";
import { dateTime, number, ownerName } from "@/features/admin/lib/format";

/**
 * Reseller Transaction Display:
 * - ALLOCATE (From Super Admin / null): Incoming credit topup -> Inflow (+, Green, ↙) "Credit Received"
 * - ALLOCATE (From Reseller to User): Credit given to user -> Outflow (-, Blue, ↗) "Credit Allocated"
 * - DEDUCT: Message delivery usage -> Deduction (-, Red, ↘) "Campaign Usage"
 * - REFUND: Delivery failure refund -> Refund (+, Cyan, ↙) "Refund"
 * - RECLAIM: Returned to Super Admin -> Outflow (-, Amber, ↗) "Reclaimed"
 */
function getTransactionDisplay(t) {
  const isFromSuperAdmin = !t.fromUser || t.fromUser?.role === "Super Admin";

  if (t.type === "ALLOCATE") {
    if (isFromSuperAdmin) {
      return {
        label: "Credit Received",
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
        amountClass: "text-emerald-700 dark:text-emerald-400 font-semibold",
        sign: "+",
        icon: ArrowDownLeft,
      };
    } else {
      return {
        label: "Credit Allocated",
        badgeClass: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300",
        amountClass: "text-blue-700 dark:text-blue-400 font-semibold",
        sign: "-",
        icon: ArrowUpRight,
      };
    }
  }

  if (t.type === "DEDUCT") {
    return {
      label: "Campaign Usage",
      badgeClass: "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300",
      amountClass: "text-red-700 dark:text-red-400 font-semibold",
      sign: "-",
      icon: ArrowDownRight,
    };
  }

  if (t.type === "REFUND") {
    return {
      label: "Refund",
      badgeClass: "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-300",
      amountClass: "text-cyan-700 dark:text-cyan-400 font-semibold",
      sign: "+",
      icon: ArrowDownLeft,
    };
  }

  if (t.type === "RECLAIM") {
    return {
      label: "Reclaimed",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
      amountClass: "text-amber-700 dark:text-amber-400 font-semibold",
      sign: "-",
      icon: ArrowUpRight,
    };
  }

  return {
    label: t.type,
    badgeClass: "border-border bg-muted text-foreground",
    amountClass: "text-foreground font-medium",
    sign: "",
    icon: ArrowRight,
  };
}

export default function ResellerCredits({ activity = false }) {
  const { user: signedInUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const type = params.get("type") || "all";
  const account = params.get("account") || "all";
  const allocation = params.get("allocate");
  const [reclaimOpen, setReclaimOpen] = useState(false);

  const accountsQuery = useResellerQuery("accounts");
  const myBalance = useResellerQuery("myBalance", {}, !activity);
  const overviewQuery = useResellerQuery("overview", {}, !activity);
  const ledger = useResellerQuery("transactions", {
    page,
    limit: 10,
    ...(type !== "all" ? { type } : {}),
    ...(account !== "all" ? { userId: account } : {}),
  });

  const accounts = (accountsQuery.data?.users || []).filter((a) => a.role === "User");
  const ownId = signedInUser?.id || signedInUser?._id;
  const transactionAccounts = accounts.filter((account) => String(account.createdBy?._id || account.createdBy) === String(ownId));
  const isWalletLocked = Boolean(myBalance.data?.wallet?.isLocked);
  const stats = overviewQuery.data?.stats;

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
      render: (t) => (
        <span className="text-xs text-muted-foreground">{dateTime(t.createdAt)}</span>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (t) => {
        const info = getTransactionDisplay(t);
        const Icon = info.icon;
        return (
          <span
            className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium border ${info.badgeClass}`}
          >
            <Icon className="size-3 shrink-0" />
            {info.label}
          </span>
        );
      },
    },
    {
      key: "from",
      label: "From",
      render: (t) =>
        t.fromUser ? (
          <span className="text-xs font-medium">{ownerName(t.fromUser)}</span>
        ) : (
          <span className="text-xs font-medium text-muted-foreground">Super Admin</span>
        ),
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
      render: (t) => (
        <span className="text-xs text-muted-foreground">{ownerName(t.performedBy)}</span>
      ),
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
        title={activity ? "Transactions" : "Credits"}
        description={
          activity
            ? "Audit trail of credit transfers, client allocations, and broadcast deductions."
            : "Manage your credit wallet and allocate broadcast credits to your client accounts."
        }
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                myBalance.refetch();
                ledger.refetch();
                accountsQuery.refetch();
              }}
              disabled={ledger.isFetching || myBalance.isFetching}
              className="gap-1.5"
            >
              <RefreshCw
                className={`size-3.5 ${
                  ledger.isFetching || myBalance.isFetching ? "animate-spin" : ""
                }`}
              />
              Refresh
            </Button>
            {!activity && (
              <>
                <Button
                  onClick={() => update("allocate", "new")}
                  disabled={signedInUser?.isPreview || !accounts.length || accountsQuery.isError || isWalletLocked}
                  title={isWalletLocked ? "Your credit balance is expired and locked." : undefined}
                  className="gap-1.5 font-semibold"
                >
                  <Plus className="size-4" />
                  Allocate credits
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setReclaimOpen(true)}
                  disabled={signedInUser?.isPreview || !accounts.length || accountsQuery.isError}
                  className="gap-1.5"
                >
                  <MinusCircle className="size-4" />
                  Reclaim credits
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Top 4 KPI Metrics Grid (matching Super Admin Credits page) */}
      {!activity && (
        <QueryState query={myBalance}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card
              className={`rounded-lg shadow-none ${
                isWalletLocked ? "border-red-300 bg-red-50/60" : ""
              }`}
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Available credits</span>
                  {isWalletLocked ? (
                    <Lock className="size-4 text-red-600" />
                  ) : (
                    <Wallet className="size-4 text-primary" />
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <p
                    className={`text-2xl font-bold tabular-nums tracking-tight ${
                      isWalletLocked ? "text-red-700" : "text-foreground"
                    }`}
                  >
                    {number(myBalance.data?.wallet?.balance)}
                  </p>
                  {isWalletLocked && (
                    <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-800">
                      Locked
                    </span>
                  )}
                </div>
                {myBalance.data?.wallet?.expiresAt ? (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Expires: <strong>{dateTime(myBalance.data?.wallet?.expiresAt)}</strong>
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Available for campaigns and allocation
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Received this month</span>
                  <Coins className="size-4 text-emerald-600" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-400">
                  {number(
                    stats?.credits?.creditsPurchasedThisMonth ??
                      stats?.wallet?.creditsPurchasedThisMonth ??
                      0
                  )}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Received from Super Admin
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Assigned users</span>
                  <Users className="size-4 text-blue-600" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
                  {number(accountsQuery.isSuccess ? accounts.length : null)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Registered under your agency
                </p>
              </CardContent>
            </Card>

            <Card className="rounded-lg shadow-none">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Active accounts</span>
                  <CheckCircle2 className="size-4 text-emerald-600" />
                </div>
                <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
                  {number(accountsQuery.isSuccess ? accounts.filter((a) => a.status === "active").length : null)}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Eligible for campaigns
                </p>
              </CardContent>
            </Card>
          </div>
        </QueryState>
      )}

      {/* Transaction Filter Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <h2 className="text-sm font-semibold text-foreground">Transaction History</h2>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Transaction type"
            value={type}
            onChange={(value) => update("type", value)}
            options={[
              { value: "all", label: "All transaction types" },
              { value: "ALLOCATE", label: "Allocations & Topups" },
              { value: "DEDUCT", label: "Campaign Deductions" },
              { value: "REFUND", label: "Refunds" },
              { value: "RECLAIM", label: "Reclaimed Credits" },
            ]}
          />
          <FilterSelect
            label="Filter by account"
            value={account}
            onChange={(value) => update("account", value)}
            disabled={!accountsQuery.isSuccess}
            options={[
              { value: "all", label: "My account and users I created" },
              ...(ownId ? [{ value: ownId, label: "My transactions" }] : []),
              ...transactionAccounts.map((a) => ({ value: a._id, label: a.username })),
            ]}
          />

          {(type !== "all" || account !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setParams(
                  (old) => {
                    const next = new URLSearchParams(old);
                    next.delete("type");
                    next.delete("account");
                    next.delete("page");
                    return next;
                  },
                  { replace: true }
                );
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear filters
            </Button>
          )}
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
            emptyDescription="Transactions will appear here when credits are allocated or campaigns are dispatched."
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

      {!activity && accountsQuery.isSuccess && !accounts.length && (
        <p className="text-sm text-muted-foreground">
          Add a client user account before allocating credits.
        </p>
      )}

      {!signedInUser?.isPreview && allocation && accountsQuery.isSuccess && accounts.length > 0 && (
        <ResellerActionForm
          title="Allocate credits"
          description="Credits will be deducted from your reseller wallet and transferred to the selected client user."
          action="allocate"
          successMessage="Credits allocated successfully"
          onClose={() => update("allocate", null)}
          initialValues={{
            toUserId: accounts.some((a) => a._id === allocation) ? allocation : "",
            amount: "",
            notes: "",
          }}
          fields={[
            {
              key: "toUserId",
              label: "Client user",
              required: true,
              options: [
                { value: "", label: "Select client user" },
                ...accounts.map((a) => ({
                  value: a._id,
                  label: `${a.username} · ${a.email}`,
                })),
              ],
            },
            {
              key: "amount",
              label: "Credits to allocate",
              required: true,
              type: "number",
              min: 0.01,
              step: 0.01,
            },
            {
              key: "notes",
              label: "Transaction note",
              type: "textarea",
              maxLength: 500,
              placeholder: "e.g. Package topup",
            },
          ]}
          payload={(v) => ({
            toUserId: v.toUserId,
            amount: Number(v.amount),
            notes: v.notes.trim(),
          })}
          review={(v) => (
            <>
              <p className="font-medium text-foreground">
                {accounts.find((a) => a._id === v.toUserId)?.username}
              </p>
              <p className="text-xs mt-1">
                Transfer{" "}
                <strong className="text-primary font-bold">
                  {number(Number(v.amount))} credits
                </strong>{" "}
                from your wallet.
              </p>
              <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground mt-1">
                {v.notes || "No transaction note provided."}
              </p>
            </>
          )}
          submitLabel="Allocate credits"
        />
      )}

      {/* Reclaim credits Dialog */}
      {reclaimOpen && accountsQuery.isSuccess && (
        <ResellerActionForm
          title="Reclaim credits"
          description="Deduct unused credits from a client user and return them to your reseller wallet."
          action="reclaim"
          successMessage="Credits reclaimed successfully"
          onClose={() => setReclaimOpen(false)}
          initialValues={{ fromUserId: "", amount: "", notes: "" }}
          fields={[
            {
              key: "fromUserId",
              label: "Select Client User",
              required: true,
              options: [
                { value: "", label: "Select client user" },
                ...accounts.map((a) => ({ value: a._id, label: `${a.username} · ${a.email}` })),
              ],
            },
            { key: "amount", label: "Credits to deduct", required: true, type: "number", min: 0.01, step: 0.01 },
            {
              key: "notes",
              label: "Reason",
              required: true,
              type: "textarea",
              maxLength: 500,
              placeholder: "Enter mandatory reason for reclaiming credits",
            },
          ]}
          payload={(v) => ({ fromUserId: v.fromUserId, amount: Number(v.amount), notes: v.notes.trim() })}
          review={(v) => (
            <>
              <p className="font-semibold text-destructive">Reclaim credits</p>
              <p className="text-xs mt-1">
                Deducting{" "}
                <strong className="text-destructive font-bold">
                  {number(Number(v.amount))} credits
                </strong>{" "}
                from {accounts.find((a) => a._id === v.fromUserId)?.username}.
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                Reason: <strong>{v.notes}</strong>
              </p>
            </>
          )}
          submitLabel="Reclaim credits"
        />
      )}
    </>
  );
}
