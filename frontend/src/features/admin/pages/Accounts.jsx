import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Wallet,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Ban,
  Percent,
  RefreshCw,
  RotateCcw,
  Lock,
  Trash2,
  LogIn,
  UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageHeading, QueryState, SearchBox, FilterSelect, StatusBadge, DataTable } from "../components/shared";
import ActionForm from "../components/ActionForm";
import { useAdminQuery } from "../hooks/useAdmin";
import { number, dateTime } from "../lib/format";
import { toast } from "@/components/ui/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAdminMutation } from "../hooks/useAdmin";
import { exitFullAccessImpersonation, startFullAccessImpersonation } from "@/features/dashboard/services/users.api";

function AccountDetail({ account, onClose, onAction }) {
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
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold border border-primary/20 bg-primary/10 text-primary">
                {account.role}
              </span>
              <StatusBadge status={account.status} />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="text-xs h-7 gap-1"
              onClick={() => {
                onClose();
                onAction?.("role", account);
              }}
            >
              <UserCog className="size-3.5" />
              Change role
            </Button>
          </div>

          <dl className="space-y-3.5 text-sm">
            {[
              ["Email", account.email],
              ["Rate", `${number(account.ratePerMsg)} credits / recipient`],
              ["Account expiry", account.expiresAt ? `${dateTime(account.expiresAt)}${account.isExpired ? " (Expired)" : ""}` : "No expiry"],
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
            <div className="pt-2 flex items-center gap-2 border-t border-muted/50 mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  onClose();
                  onAction?.("allocate", account);
                }}
                className="text-xs h-8 gap-1.5"
              >
                <Wallet className="size-3.5 text-primary" />
                Allocate credits
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  onClose();
                  onAction?.("reclaim", account);
                }}
                className="text-xs h-8 gap-1.5 text-amber-700 hover:text-amber-800"
              >
                <RotateCcw className="size-3.5" />
                Reclaim
              </Button>
            </div>
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
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const status = params.get("status") || "all";
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const removeAccount = useAdminMutation("deleteAccount", "Account removed", () => setModal(null));
  const accessAccount = useMutation({
    mutationFn: ({ id }) => startFullAccessImpersonation(id),
    onSuccess: async (data, { targetWindow }) => {
      if (targetWindow.closed) {
        await exitFullAccessImpersonation(data.token).catch(() => {});
        return;
      }
      targetWindow.postMessage({ type: "FULL_ACCESS_SESSION", token: data.token }, window.location.origin);
      queryClient.invalidateQueries({ queryKey: ["activeSessions"] });
    },
    onError: (error, { targetWindow }) => {
      if (!targetWindow.closed) targetWindow.close();
      toast.add({ title: "Could not open account", description: error.message, type: "error" });
    },
  });

  function openAccount(account) {
    const targetWindow = window.open("about:blank", "_blank");
    if (!targetWindow) {
      toast.add({ title: "New tab blocked", description: "Allow pop-ups to open the account in a separate tab.", type: "error" });
      return;
    }

    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", handleReady);
      if (!targetWindow.closed) targetWindow.close();
      toast.add({ title: "Account tab did not respond", type: "error" });
    }, 30000);
    function handleReady(event) {
      if (event.origin !== window.location.origin || event.source !== targetWindow || event.data?.type !== "FULL_ACCESS_READY") return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", handleReady);
      accessAccount.mutate({ id: account._id, targetWindow });
    }
    window.addEventListener("message", handleReady);
    targetWindow.location.href = "/impersonation-handoff";
  }

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
      (status === "all" || (status === "expired" ? a.isExpired : a.status === status)) &&
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
            label: "Assigned users",
            render: (a) =>
              number(accounts.filter((u) => u.role === "User" && (u.resellerId?._id || u.resellerId) === a._id).length),
          },
        ]),
    {
      key: "rate",
      label: "Credits per recipient",
      sort: (a) => a.ratePerMsg,
      render: (a) => <span className="tabular-nums font-semibold">{number(a.ratePerMsg)}</span>,
    },
    {
      key: "accountExpiry",
      label: "Account expiry",
      render: (a) => (
        <span className={a.isExpired ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
          {a.expiresAt ? dateTime(a.expiresAt) : "No expiry"}
          {a.isExpired ? " · Expired" : ""}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (a) => <StatusBadge status={a.isExpired ? "expired" : a.status} />,
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
            <DropdownMenuItem
              disabled={accessAccount.isPending || query.isPending}
              onClick={() => openAccount(a)}
            >
              <LogIn className="size-4 mr-2" />
              {accessAccount.isPending ? "Opening account…" : "Login as account"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDetail(a)}>
              <Eye className="size-4 mr-2" />
              Account details & audit
            </DropdownMenuItem>
            <DropdownMenuItem disabled={query.isPending} onClick={() => setModal({ type: "accountAccess", account: a })}>
              <Lock className="size-4 mr-2" />
              Manage access & expiry
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setModal({ type: "rate", account: a })}>
              <Pencil className="size-4 mr-2" />
              Change rate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setModal({ type: "role", account: a })}>
              <UserCog className="size-4 mr-2" />
              Change role
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setModal({ type: "allocate", account: a })}>
              <Wallet className="size-4 mr-2" />
              Allocate credits
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setModal({ type: "reclaim", account: a })}>
              <RotateCcw className="size-4 mr-2 text-amber-600" />
              Reclaim credits
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setModal({ type: "deleteAccount", account: a })}
            >
              <Trash2 className="size-4 mr-2" />
              Delete account
            </DropdownMenuItem>
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
            : "Manage user accounts, allocate credits directly, configure message rates, and audit usage."
        }
        action={
          <Button
            disabled={query.isPending || query.isError}
            onClick={() => setModal({ type: "create" })}
          >
            <Plus className="size-4 mr-1" />
            Add {role.toLowerCase()}
          </Button>
        }
      />

      {role === "User" && query.isSuccess && !resellers.length && (
        <p className="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
          No resellers exist yet. You can create direct user accounts or{" "}
          <Link className="font-medium underline text-foreground" to="/admin/resellers">
            add a reseller
          </Link>{" "}
          first.
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
            { value: "expired", label: "Expired" },
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

      {detail && <AccountDetail account={detail} onClose={() => setDetail(null)} onAction={(type, account) => setModal({ type, account })} />}

      {modal?.type === "deleteAccount" && (
        <AlertDialog open onOpenChange={(open) => { if (!open && !removeAccount.isPending) setModal(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {modal.account.role.toLowerCase()} account?</AlertDialogTitle>
              <AlertDialogDescription>
                {modal.account.role === "Reseller"
                  ? "This account and its wallet will be permanently deleted. Its client users will remain active as direct admin-managed users."
                  : "This account and its wallet will be permanently deleted."} Campaign and credit history will be retained for audit.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {removeAccount.error && <p className="text-sm text-destructive">{removeAccount.error.message}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removeAccount.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={removeAccount.isPending}
                className="border border-destructive bg-white text-destructive hover:bg-red-50"
                onClick={(event) => {
                  event.preventDefault();
                  removeAccount.mutate(modal.account._id);
                }}
              >
                {removeAccount.isPending ? "Deleting…" : "Delete account"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {modal?.type === "create" && (
        <ActionForm
          title={`Add ${role.toLowerCase()}`}
          description={
            role === "User"
              ? "Create a user account. You can allocate credits directly to this user after creation."
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
                    label: "Assigned reseller (optional)",
                    options: [{ value: "", label: "Direct (Managed by Admin)" }, ...resellers.map((a) => ({ value: a._id, label: a.username }))],
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
            ...(role === "User" && v.resellerId ? { resellerId: v.resellerId } : {}),
          })}
          review={(v) => (
            <>
              <p className="font-medium">{v.username}</p>
              <p>{v.email}</p>
              <p>Role: {role}</p>
              <p>Rate: {number(Number(v.ratePerMsg))} credits / recipient</p>
              {role === "User" && <p>Reseller: {resellers.find((a) => a._id === v.resellerId)?.username || "Direct (None)"}</p>}
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

      {modal?.type === "role" && (
        <ActionForm
          title="Change account role"
          description={`Convert ${modal.account.username}'s account role. Role can only be changed between Reseller and User.`}
          action="changeRole"
          successMessage="Account role updated successfully"
          onClose={() => setModal(null)}
          initialValues={{
            role: modal.account.role === "Reseller" ? "User" : "Reseller",
          }}
          fields={[
            {
              key: "role",
              label: "New account role",
              required: true,
              options: [
                { value: "Reseller", label: "Reseller (Can allocate credits & manage client users)" },
                { value: "User", label: "User (Standard client account for sending campaigns)" },
              ],
            },
          ]}
          validate={(v) =>
            v.role === modal.account.role
              ? `Account is already a ${modal.account.role}. Please select a different role.`
              : ""
          }
          payload={(v) => ({ id: modal.account._id, role: v.role })}
          review={(v) => (
            <>
              <p className="font-medium text-foreground">{modal.account.username}</p>
              <p className="text-xs text-muted-foreground">{modal.account.email}</p>
              <div className="mt-2 text-sm flex items-center gap-2">
                <span className="font-semibold">{modal.account.role}</span>
                <span>→</span>
                <span className="font-semibold text-primary">{v.role}</span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
                {modal.account.role === "Reseller" && v.role === "User"
                  ? "Note: Any client users previously assigned to this reseller will be moved directly under Super Admin."
                  : "Note: This account will become an independent Reseller and can manage client users."}
              </p>
            </>
          )}
          submitLabel="Change Role"
        />
      )}

      {modal?.type === "accountAccess" && (
        <ActionForm
          title="Manage account access"
          description={`Set ${modal.account.username}'s account status and optional expiry date. Expired users can sign in only to see the expiry notice.`}
          action="accountAccess"
          successMessage="Account access updated"
          onClose={() => setModal(null)}
          initialValues={{
            status: modal.account.status === "expired" || (modal.account.isExpired && modal.account.status === "active") ? "expired" : modal.account.status || "active",
            expiresAt: modal.account.expiresAt ? new Date(modal.account.expiresAt).toISOString().slice(0, 10) : "",
          }}
          fields={[
            { key: "status", label: "Account status", options: [{ value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }, { value: "expired", label: "Expired" }] },
            { key: "expiresAt", label: "Account expiry date (optional)", type: "date", hint: "The account remains active through this date. Leave blank for no expiry." },
          ]}
          payload={(values) => ({ id: modal.account._id, status: values.status, expiresAt: values.expiresAt || null })}
          review={(values) => (
            <>
              <p className="font-medium">{modal.account.username}</p>
              <p>Status: <strong>{values.status}</strong></p>
              <p>Expiry: <strong>{values.expiresAt || "No expiry"}</strong></p>
            </>
          )}
          submitLabel="Save account access"
        />
      )}

      {modal?.type === "allocate" && (
        <ActionForm
          title="Add Credits"
          description={`Add credits directly to ${modal.account.username}'s wallet.`}
          action="allocate"
          successMessage="Credits added successfully"
          onClose={() => setModal(null)}
          initialValues={{
            amount: "",
            notes: "",
            expiryYears: "2",
          }}
          fields={[
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
            toUserId: modal.account._id,
            amount: Number(v.amount),
            expiryYears: Number(v.expiryYears),
            notes: v.notes.trim(),
          })}
          review={(v) => (
            <>
              <p className="font-medium text-foreground">{modal.account.username} ({modal.account.role})</p>
              <p className="text-xs mt-1">
                Add <strong>{number(Number(v.amount))} credits</strong> to this account.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Validity: <strong>{v.expiryYears === "0" ? "Never expires" : `${v.expiryYears} Year(s)`}</strong>
              </p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs mt-1">
                {v.notes || "No note."}
              </p>
            </>
          )}
          submitLabel="Add Credits"
        />
      )}

      {modal?.type === "reclaim" && (
        <ActionForm
          title="Reclaim credits"
          description={`Take back unused credits from ${modal.account.username}.`}
          action="reclaim"
          successMessage="Credits deducted successfully"
          onClose={() => setModal(null)}
          initialValues={{ fromUserId: modal.account._id, amount: "", notes: "" }}
          fields={[
            { key: "amount", label: "Credits to deduct", required: true, type: "number", min: 0.01, step: 0.01 },
            { key: "notes", label: "Reason (optional)", type: "textarea", maxLength: 500, placeholder: "e.g. Account closure, overpayment reversal" },
          ]}
          payload={(v) => ({ fromUserId: modal.account._id, amount: Number(v.amount), notes: (v.notes || "").trim() })}
          review={(v) => (
            <>
              <p className="font-medium text-destructive">Reclaim credits</p>
              <p>
                Deducting <strong>{number(Number(v.amount))} credits</strong> from {modal.account.username} ({modal.account.role}).
              </p>
              <p className="text-muted-foreground text-xs mt-1">Reason: {v.notes ? v.notes.trim() : "None"}</p>
            </>
          )}
          submitLabel="Reclaim credits"
        />
      )}
    </>
  );
}
