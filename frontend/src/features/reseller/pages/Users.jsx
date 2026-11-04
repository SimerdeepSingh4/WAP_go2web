import { useAuth } from "@/features/auth/hooks/useAuth";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Wallet,
  Users,
  CheckCircle2,
  Ban,
  Percent,
  RefreshCw,
  Lock,
  ArrowRight,
  MinusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageHeading, QueryState, SearchBox, FilterSelect, StatusBadge, DataTable } from "@/features/admin/components/shared";
import ResellerActionForm from "../components/ResellerActionForm";
import { useResellerQuery } from "../hooks/useReseller";
import { number, dateTime } from "@/features/admin/lib/format";

function UserDetail({ account, onClose, onAction }) {
  const balance = useResellerQuery("balance", { id: account._id });

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{account.username}</SheetTitle>
          <SheetDescription>Client user account profile & wallet</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4">
          <div className="flex items-center justify-between">
            <StatusBadge status={account.status} />
            {account.isExpired && (
              <span className="text-xs font-medium text-destructive">Expired</span>
            )}
          </div>

          <dl className="space-y-3.5 text-sm">
            {[
              ["Email", account.email],
              ["Role", account.role || "User"],
              ["Rate", `${number(account.ratePerMsg)} credits / recipient`],
              ["Account expiry", account.expiresAt ? `${dateTime(account.expiresAt)}${account.isExpired ? " (Expired)" : ""}` : "No expiry"],
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

          {/* Quick Actions */}
          <div className="border-t pt-4 space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Account Actions</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                onClick={() => {
                  onClose();
                  onAction("rate", account);
                }}
              >
                <Pencil className="size-3.5 text-muted-foreground" />
                Change Message Rate
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="justify-start gap-2"
                onClick={() => {
                  onClose();
                  onAction("allocate", account);
                }}
              >
                <Wallet className="size-3.5 text-muted-foreground" />
                Allocate Credits from My Wallet
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start gap-2 text-muted-foreground"
                nativeButton={false} render={<Link to={`/reseller/credits?account=${account._id}`} />}
              >
                View Credit Ledger
                <ArrowRight className="size-3.5 ml-auto" />
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Reseller Users page — exact UI/UX design matching Super Admin Accounts.jsx
 */
export default function ResellerUsers() {
  const { user: signedInUser } = useAuth();
  const query = useResellerQuery("accounts");
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const status = params.get("status") || "all";
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);

  const rawAccounts = query.data?.users || [];
  // Reseller only manages User role accounts
  const accounts = rawAccounts.filter((a) => a.role === "User");

  const rows = accounts.filter(
    (a) =>
      (status === "all" || (status === "expired" ? a.isExpired : a.status === status)) &&
      `${a.username} ${a.email}`.toLowerCase().includes(search.toLowerCase())
  );

  function update(key, value) {
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        value ? next.set(key, value) : next.delete(key);
        return next;
      },
      { replace: true }
    );
  }

  // Calculate 4 KPI Metrics
  const activeCount = accounts.filter((a) => a.status === "active").length;
  const blockedCount = accounts.filter((a) => a.status === "blocked").length;
  const avgRate = accounts.length
    ? accounts.reduce((acc, a) => acc + (a.ratePerMsg || 0), 0) / accounts.length
    : 0;

  const columns = [
    {
      key: "name",
      label: "Account",
      sort: (a) => a.username,
      render: (a) => (
        <button
          className="max-w-48 truncate text-left font-medium hover:underline text-foreground cursor-pointer"
          onClick={() => setDetail(a)}
        >
          {a.username}
        </button>
      ),
    },
    {
      key: "email",
      label: "Email",
      render: (a) => <span className="text-muted-foreground">{a.email}</span>,
    },
    {
      key: "rate",
      label: "Credits / recipient",
      sort: (a) => a.ratePerMsg,
      render: (a) => <span className="tabular-nums">{number(a.ratePerMsg)}</span>,
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
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${a.username}`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => setDetail(a)}>
              <Eye className="size-4 mr-2" />
              Account details
            </DropdownMenuItem>
            <DropdownMenuItem disabled={signedInUser?.isPreview} onClick={() => setModal({ type: "accountAccess", account: a })}>
              <Lock className="size-4 mr-2" />
              Manage access & expiry
            </DropdownMenuItem>
            <DropdownMenuItem disabled={signedInUser?.isPreview} onClick={() => setModal({ type: "rate", account: a })}>
              <Pencil className="size-4 mr-2" />
              Change rate
            </DropdownMenuItem>
            <DropdownMenuItem disabled={signedInUser?.isPreview} onClick={() => setModal({ type: "allocate", account: a })}>
              <Wallet className="size-4 mr-2" />
              Allocate credits
            </DropdownMenuItem>
            <DropdownMenuItem disabled={signedInUser?.isPreview} onClick={() => setModal({ type: "reclaim", account: a })}>
              <MinusCircle className="size-4 mr-2" />
              Reclaim credits
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <PageHeading
        title="Users"
        description="Manage your client user accounts, configure per-recipient rates, and allocate wallet credits."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              disabled={signedInUser?.isPreview || query.isPending || query.isError}
              onClick={() => setModal({ type: "create" })}
              className="gap-1.5 font-semibold"
            >
              <Plus className="size-4" />
              Add user
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox
            label="Search username or email"
            value={search}
            onChange={(value) => update("search", value)}
          />
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

        {(search || status !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setParams(
                (old) => {
                  const next = new URLSearchParams(old);
                  next.delete("search");
                  next.delete("status");
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

      <QueryState
        query={query}
        empty={!rows.length}
        emptyTitle="No user accounts yet"
        emptyDescription="Use Add user to create your first client user account."
      >
        <DataTable
          key={`users-${search}-${status}`}
          caption="Client user accounts"
          rows={rows}
          columns={columns}
        />
      </QueryState>

      {detail && (
        <UserDetail
          account={detail}
          onClose={() => setDetail(null)}
          onAction={(type, acc) => setModal({ type, account: acc })}
        />
      )}

      {modal?.type === "create" && (
        <ResellerActionForm
          title="Add user"
          description="Create a client user under your reseller account. Credits can be allocated from your balance after creation."
          action="createAccount"
          successMessage="User account created successfully"
          onClose={() => setModal(null)}
          initialValues={{ username: "", email: "", password: "", ratePerMsg: "1" }}
          fields={[
            { key: "username", label: "Username / Company", required: true, maxLength: 100 },
            { key: "email", label: "Email address", type: "email", required: true },
            {
              key: "password",
              label: "Initial password",
              type: "password",
              required: true,
              hint: "Must contain at least 8 characters.",
            },
            {
              key: "ratePerMsg",
              label: "Rate (credits / recipient)",
              type: "number",
              min: 0.01,
              step: 0.01,
              required: true,
              hint: "Deducted from user's balance per contact message.",
            },
          ]}
          validate={(v) =>
            v.password.trim().length < 8
              ? "The initial password must contain at least 8 characters."
              : ""
          }
          payload={(v) => ({
            username: v.username.trim(),
            email: v.email.trim(),
            password: v.password,
            role: "User",
            ratePerMsg: Number(v.ratePerMsg),
          })}
          review={(v) => (
            <>
              <p className="font-medium text-foreground">{v.username}</p>
              <p className="text-muted-foreground text-xs">{v.email}</p>
              <p className="text-xs mt-1">Role: User</p>
              <p className="text-xs">
                Rate: <strong>{number(Number(v.ratePerMsg))} credits / recipient</strong>
              </p>
            </>
          )}
          submitLabel="Create account"
        />
      )}

      {modal?.type === "rate" && (
        <ResellerActionForm
          title="Change account rate"
          description="This rate applies to future campaign broadcasts submitted by this user. Existing campaigns are not recalculated."
          action="rate"
          successMessage="Account rate updated successfully"
          onClose={() => setModal(null)}
          initialValues={{ ratePerMsg: String(modal.account.ratePerMsg) }}
          fields={[
            {
              key: "ratePerMsg",
              label: "Rate (credits / recipient)",
              required: true,
              type: "number",
              min: 0.01,
              step: 0.01,
            },
          ]}
          payload={(v) => ({
            userId: modal.account._id,
            ratePerMsg: Number(v.ratePerMsg),
          })}
          review={(v) => (
            <>
              <p className="font-medium text-foreground">{modal.account.username}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {number(modal.account.ratePerMsg)} →{" "}
                <strong className="text-primary">{number(Number(v.ratePerMsg))}</strong>{" "}
                credits / recipient
              </p>
            </>
          )}
          submitLabel="Update rate"
        />
      )}

      {modal?.type === "accountAccess" && (
        <ResellerActionForm
          title="Manage account access"
          description={`Set ${modal.account.username}'s account status and optional expiry date. Expired users can sign in only to see the expiry notice.`}
          action="accountAccess"
          successMessage="Account access updated successfully"
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
        <ResellerActionForm
          title="Allocate credits"
          description="Credits will be deducted from your reseller wallet and transferred to this user's balance."
          action="allocate"
          successMessage="Credits allocated successfully"
          onClose={() => setModal(null)}
          initialValues={{ amount: "", notes: "" }}
          fields={[
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
              placeholder: "e.g. Monthly top-up package recharge",
            },
          ]}
          payload={(v) => ({
            toUserId: modal.account._id,
            amount: Number(v.amount),
            notes: v.notes.trim(),
          })}
          review={(v) => (
            <>
              <p className="font-medium text-foreground">{modal.account.username}</p>
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

      {modal?.type === "reclaim" && (
        <ResellerActionForm
          title="Reclaim credits"
          description="Deduct credits from this client user and return them to your wallet."
          action="reclaim"
          successMessage="Credits reclaimed successfully"
          onClose={() => setModal(null)}
          initialValues={{ fromUserId: modal.account._id, amount: "", notes: "" }}
          fields={[
            {
              key: "amount",
              label: "Credits to deduct",
              required: true,
              type: "number",
              min: 0.01,
              step: 0.01,
            },
            {
              key: "notes",
              label: "Reason",
              required: true,
              type: "textarea",
              maxLength: 500,
              placeholder: "Enter mandatory reason for reclaiming credits",
            },
          ]}
          payload={(v) => ({
            fromUserId: modal.account._id,
            amount: Number(v.amount),
            notes: v.notes.trim(),
          })}
          review={(v) => (
            <>
              <p className="font-semibold text-destructive">Reclaim credits</p>
              <p className="text-xs mt-1">
                Deducting{" "}
                <strong className="text-destructive font-bold">
                  {number(Number(v.amount))} credits
                </strong>{" "}
                from {modal.account.username}.
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
