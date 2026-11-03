import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Wallet,
  ShieldCheck,
  ShieldAlert,
  Users,
  CheckCircle2,
  Ban,
  Percent,
  RefreshCw,
  RotateCcw,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageHeading, QueryState, SearchBox, FilterSelect, StatusBadge, DataTable } from "../components/shared";
import ActionForm from "../components/ActionForm";
import { useAdminQuery } from "../hooks/useAdmin";
import { number, dateTime } from "../lib/format";

function AccountDetail({ account, onClose }) {
  const [showAudit, setShowAudit] = useState(false);
  const balance = useAdminQuery("balance", { id: account._id });
  const reconcile = useAdminQuery("reconcile", { id: account._id }, showAudit);

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{account.username}</SheetTitle>
          <SheetDescription>{account.role} account profile & ledger</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4">
          <div className="flex items-center justify-between">
            <StatusBadge status={account.status} />
            <span className="text-xs text-muted-foreground font-mono">{account._id}</span>
          </div>

          <dl className="space-y-3.5 text-sm">
            {[
              ["Email", account.email],
              ["Rate", `${number(account.ratePerMsg)} credits / recipient`],
              ["Assigned reseller", account.resellerId?.username || "—"],
              ["Created", dateTime(account.createdAt)],
            ].map(([label, value]) => (
              <div key={label} className="border-b pb-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div className={`rounded-lg border p-4 space-y-2 ${balance.data?.wallet?.isLocked ? "border-red-300 bg-red-50/60" : "bg-muted/30"}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Current Wallet Balance</p>
              {balance.data?.wallet?.isLocked && (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-100 text-red-800 px-2 py-0.5 text-xs font-semibold">
                  <Lock className="size-3 text-red-600" /> Locked & Expired
                </span>
              )}
            </div>
            <QueryState query={balance}>
              <p className={`text-2xl font-bold tabular-nums ${balance.data?.wallet?.isLocked ? "text-red-700" : "text-foreground"}`}>
                {number(balance.data?.wallet?.balance)}{" "}
                <span className="text-xs font-normal text-muted-foreground">credits</span>
              </p>
              {balance.data?.wallet?.expiresAt && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Expires on: <strong>{dateTime(balance.data?.wallet?.expiresAt)}</strong>
                  {balance.data?.wallet?.isExpired && (
                    <span className="text-red-600 ml-1 font-semibold">(Expired)</span>
                  )}
                </p>
              )}
            </QueryState>
          </div>

          {/* Balance Check Section */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Balance Check</p>
                <p className="text-xs text-muted-foreground">Check if transactions match wallet balance</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAudit(true)}
                disabled={reconcile.isFetching}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className={`size-3.5 ${reconcile.isFetching ? "animate-spin" : ""}`} />
                {showAudit ? "Re-check" : "Check Balance"}
              </Button>
            </div>

            {showAudit && (
              <QueryState query={reconcile}>
                {reconcile.data && (
                  <div
                    className={`rounded-lg border p-3.5 space-y-2.5 text-xs ${
                      reconcile.data.reconciliation?.isBalanced
                        ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
                        : "border-red-200 bg-red-50 text-red-900"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      {reconcile.data.reconciliation?.isBalanced ? (
                        <>
                          <ShieldCheck className="size-4 text-emerald-600" />
                          <span>Balance Verified: Transactions match wallet balance</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="size-4 text-red-600" />
                          <span>Balance Mismatch Detected</span>
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-muted/50 text-[11px]">
                      <div>
                        <span className="text-muted-foreground">Added:</span>{" "}
                        <strong className="tabular-nums">+{number(reconcile.data.reconciliation?.totalInflow)}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Used:</span>{" "}
                        <strong className="tabular-nums">-{number(reconcile.data.reconciliation?.totalOutflow)}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Calculated Balance:</span>{" "}
                        <strong className="tabular-nums">{number(reconcile.data.reconciliation?.calculatedBalance)}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Wallet Balance:</span>{" "}
                        <strong className="tabular-nums">{number(reconcile.data.reconciliation?.walletBalance)}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </QueryState>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function Accounts({ role }) {
  const query = useAdminQuery("accounts");
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const status = params.get("status") || "all";
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);

  const accounts = query.data?.users || [];
  const resellers = accounts.filter((a) => a.role === "Reseller" && a.status === "active");
  const roleAccounts = accounts.filter((a) => a.role === role);

  const activeCount = roleAccounts.filter((a) => a.status === "active").length;
  const blockedCount = roleAccounts.filter((a) => a.status === "blocked").length;
  const avgRate = roleAccounts.length
    ? roleAccounts.reduce((sum, a) => sum + (Number(a.ratePerMsg) || 0), 0) / roleAccounts.length
    : 0;

  const rows = roleAccounts.filter(
    (a) =>
      (status === "all" || a.status === status) &&
      `${a.username} ${a.email} ${a.resellerId?.username || ""}`.toLowerCase().includes(search.toLowerCase())
  );

  function update(key, value) {
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        next.set(key, value);
        return next;
      },
      { replace: true }
    );
  }

  const columns = [
    {
      key: "name",
      label: "Account",
      sort: (a) => a.username,
      render: (a) => (
        <button
          className="max-w-48 truncate text-left font-medium hover:underline text-foreground block"
          onClick={() => setDetail(a)}
        >
          {a.username}
        </button>
      ),
    },
    {
      key: "email",
      label: "Email",
      render: (a) => <span className="text-muted-foreground text-xs">{a.email}</span>,
    },
    ...(role === "User"
      ? [
          {
            key: "reseller",
            label: "Reseller",
            render: (a) =>
              a.resellerId?.username ? (
                <span className="text-xs font-medium">{a.resellerId.username}</span>
              ) : (
                <span className="text-muted-foreground text-xs">Unassigned</span>
              ),
          },
        ]
      : [
          {
            key: "users",
            label: "Child Users",
            render: (a) =>
              number(accounts.filter((u) => u.role === "User" && (u.resellerId?._id || u.resellerId) === a._id).length),
          },
        ]),
    {
      key: "rate",
      label: "Rate (Credits / Msg)",
      sort: (a) => a.ratePerMsg,
      render: (a) => <span className="tabular-nums font-semibold">{number(a.ratePerMsg)}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (a) => <StatusBadge status={a.status} />,
    },
    {
      key: "actions",
      label: <span className="sr-only">Actions</span>,
      render: (a) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label={`Actions for ${a.username}`} />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => setDetail(a)}>
              <Eye className="size-4 mr-2" />
              Account details & audit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setModal({ type: "rate", account: a })}>
              <Pencil className="size-4 mr-2" />
              Change rate
            </DropdownMenuItem>
            {role === "Reseller" && (
              <>
                <DropdownMenuItem render={<Link to={`/admin/credits?allocate=${a._id}`} />}>
                  <Wallet className="size-4 mr-2" />
                  Allocate credits
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setModal({ type: "reclaim", account: a })}>
                  <RotateCcw className="size-4 mr-2 text-amber-600" />
                  Reclaim credits
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeading
        title={role === "Reseller" ? "Resellers Network" : "User Accounts"}
        description={
          role === "Reseller"
            ? "Manage reseller accounts, add credits, set message rates, and check balances."
            : "Review sub-accounts managed under resellers and check credit usage."
        }
        action={
          <Button
            disabled={query.isPending || query.isError || (role === "User" && !resellers.length)}
            onClick={() => setModal({ type: "create" })}
          >
            <Plus className="size-4 mr-1" />
            Add {role.toLowerCase()}
          </Button>
        }
      />

      {/* Account KPI Header Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Total {role}s
              <Users className="size-4" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{number(roleAccounts.length)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Active Accounts
              <CheckCircle2 className="size-4 text-emerald-500" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-600">{number(activeCount)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Blocked Accounts
              <Ban className="size-4 text-red-500" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-red-600">{number(blockedCount)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Average Rate
              <Percent className="size-4 text-blue-500" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{avgRate.toFixed(2)} cr</p>
          </CardContent>
        </Card>
      </div>

      {role === "User" && query.isSuccess && !resellers.length && (
        <p className="rounded-md border bg-muted/50 p-3 text-sm">
          Create an active reseller before adding a user.{" "}
          <Link className="font-medium underline" to="/admin/resellers">
            Manage resellers
          </Link>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox label="Search name or email..." value={search} onChange={(value) => update("search", value)} />
        <FilterSelect
          label="Account status"
          value={status}
          onChange={(value) => update("status", value)}
          options={[
            { value: "all", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "blocked", label: "Blocked" },
          ]}
        />
      </div>

      <QueryState
        query={query}
        empty={!accounts.some((a) => a.role === role)}
        emptyTitle={`No ${role.toLowerCase()} accounts yet`}
        emptyDescription={`Use Add ${role.toLowerCase()} to create the first account.`}
      >
        <DataTable
          key={`${role}-${search}-${status}`}
          caption={`${role} accounts`}
          rows={rows}
          columns={columns}
        />
      </QueryState>

      {detail && <AccountDetail account={detail} onClose={() => setDetail(null)} />}

      {modal?.type === "create" && (
        <ActionForm
          title={`Add ${role.toLowerCase()}`}
          description={
            role === "User"
              ? "Create a user under their account provider."
              : "Create a reseller account. Credits can be allocated after creation."
          }
          action="createAccount"
          successMessage={`${role} account created`}
          onClose={() => setModal(null)}
          initialValues={{ username: "", email: "", password: "", ratePerMsg: "", resellerId: "" }}
          fields={[
            { key: "username", label: "Account name", required: true, maxLength: 100 },
            { key: "email", label: "Email", type: "email", required: true },
            { key: "password", label: "Initial password", type: "password", required: true, hint: "Use at least 8 characters." },
            { key: "ratePerMsg", label: "Rate (credits / recipient)", type: "number", min: 0.01, step: 0.01, required: true },
            ...(role === "User"
              ? [
                  {
                    key: "resellerId",
                    label: "Assigned reseller",
                    required: true,
                    options: [{ value: "", label: "Select reseller" }, ...resellers.map((a) => ({ value: a._id, label: a.username }))],
                  },
                ]
              : []),
          ]}
          validate={(v) => (v.password.trim().length < 8 ? "The initial password must contain at least 8 characters." : "")}
          payload={(v) => ({
            username: v.username.trim(),
            email: v.email.trim(),
            password: v.password,
            role,
            ratePerMsg: Number(v.ratePerMsg),
            ...(role === "User" ? { resellerId: v.resellerId } : {}),
          })}
          review={(v) => (
            <>
              <p className="font-medium">{v.username}</p>
              <p>{v.email}</p>
              <p>Role: {role}</p>
              <p>Rate: {number(Number(v.ratePerMsg))} credits / recipient</p>
              {role === "User" && <p>Reseller: {resellers.find((a) => a._id === v.resellerId)?.username}</p>}
            </>
          )}
          submitLabel="Create account"
        />
      )}

      {modal?.type === "rate" && (
        <ActionForm
          title="Change account rate"
          description="This rate applies to future campaign submissions. Existing campaign charges are not recalculated."
          action="rate"
          successMessage="Account rate updated"
          onClose={() => setModal(null)}
          initialValues={{ ratePerMsg: String(modal.account.ratePerMsg) }}
          fields={[{ key: "ratePerMsg", label: "Rate (credits / recipient)", required: true, type: "number", min: 0.01, step: 0.01 }]}
          payload={(v) => ({ userId: modal.account._id, ratePerMsg: Number(v.ratePerMsg) })}
          review={(v) => (
            <>
              <p className="font-medium">{modal.account.username}</p>
              <p>
                {number(modal.account.ratePerMsg)} → {number(Number(v.ratePerMsg))} credits / recipient
              </p>
            </>
          )}
          submitLabel="Update rate"
        />
      )}

      {modal?.type === "reclaim" && (
        <ActionForm
          title="Deduct Credits"
          description="Take back unused credits from this reseller."
          action="reclaim"
          successMessage="Credits deducted successfully"
          onClose={() => setModal(null)}
          initialValues={{ fromUserId: modal.account._id, amount: "", notes: "" }}
          fields={[
            { key: "amount", label: "Credits to deduct", required: true, type: "number", min: 0.01, step: 0.01 },
            { key: "notes", label: "Reason", required: true, type: "textarea", maxLength: 500 },
          ]}
          payload={(v) => ({ fromUserId: modal.account._id, amount: Number(v.amount), notes: v.notes.trim() })}
          review={(v) => (
            <>
              <p className="font-medium text-destructive">Deduct Credits</p>
              <p>
                Deducting <strong>{number(Number(v.amount))} credits</strong> from {modal.account.username}.
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
