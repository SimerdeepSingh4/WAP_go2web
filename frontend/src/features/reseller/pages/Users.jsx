import BuyerPurchaseRatesDialog from "@/features/credits/components/PurchaseRateEditor";
import CategoryWalletBalances from "@/features/credits/components/CategoryWalletBalances";
import { creditCategoryField, creditCategoryNames } from "@/features/credits/lib/creditTransactionDisplay";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Plus,
  Eye,
  Pencil,
  Lock,
  ArrowRight,
  MinusCircle,
  Wallet,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PageHeading, QueryState, SearchBox, FilterSelect, DataTable, ClearFiltersButton } from "@/features/dashboard/components/shared";
import RowActionsMenu from "@/features/dashboard/components/RowActionsMenu";
import ResellerActionForm from "../components/ResellerActionForm";
import { useResellerQuery } from "../hooks/useReseller";
import { number, dateTime } from "@/lib/format";
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
import { useResellerMutation } from "../hooks/useReseller";
import UserAvatar from "@/features/accounts/components/UserAvatar";
import AccountStatusMenu, { AccountStatusDialog } from "@/features/accounts/components/AccountStatusMenu";
import { CreditBalancePreview } from "@/features/dashboard/components/ActionReview";
import "@/features/accounts/components/account-list.css";
import useMediaUploadLimits from "@/features/campaigns/hooks/useMediaUploadLimits";
import { resolveMediaUploadLimits } from "../../../../../shared/mediaUploadLimits.js";

function accountUploadSummary(account, defaults) {
  const limits = resolveMediaUploadLimits(account.mediaUploadLimits, defaults);
  return `Image ${limits.imageMB} MB / Video ${limits.videoMB} MB / PDF ${limits.pdfMB} MB`;
}

function UserDetail({ account, onClose, onAction }) {
  const { user: signedInUser } = useAuth();
  const uploadLimits = useMediaUploadLimits();
  const balance = useResellerQuery("balance", { id: account._id });

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="account-profile-sheet w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{account.username}</SheetTitle>
          <SheetDescription>Client user profile & wallet</SheetDescription>
        </SheetHeader>

        <div className="detail-sheet-body space-y-5">
          <div className="detail-sheet-toolbar">
            <AccountStatusMenu account={account} onSelect={nextStatus => { onClose(); onAction("status", account, nextStatus); }} />
            {account.isExpired && (
              <span className="text-xs font-medium text-destructive">Expired</span>
            )}
          </div>

          <div className="detail-sheet-profile"><div className="flex min-w-0 items-center gap-3"><UserAvatar user={account} className="size-14" /><div className="min-w-0"><p className="text-sm font-semibold">{account.username}</p><p className="mt-1 text-xs text-muted-foreground">{account.companyName || "User"}</p></div></div></div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">User details</h3>
            <Button type="button" variant="outline" size="sm" className="account-profile-edit" disabled={signedInUser?.isPreview} onClick={() => { onClose(); onAction("editAccount", account); }}>
              <Pencil className="size-3.5" aria-hidden="true" />Edit details
            </Button>
          </div>
          <dl className="detail-sheet-details">
            {[
              ["Email", account.email],
              ["Company", account.companyName || "Not provided"],
              ["Phone", account.phone || "Not provided"],
              ["Role", account.role || "User"],
              ["Campaign upload limits", accountUploadSummary(account, uploadLimits.defaults)],
              ["User expiry", account.expiresAt ? `${dateTime(account.expiresAt)}${account.isExpired ? " (Expired)" : ""}` : "No expiry"],
              ["Created", dateTime(account.createdAt)],
            ].map(([label, value]) => (
              <div key={label} className="border-b pb-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-0.5 break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div data-locked={Boolean(balance.data?.wallet?.isLocked)} className={`detail-sheet-wallet space-y-2 ${balance.data?.wallet?.isLocked ? "border-red-300 bg-red-50/60" : "bg-muted/30"}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Available credits</p>
              {balance.data?.wallet?.isLocked && (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-100 text-red-800 px-2 py-0.5 text-xs font-semibold">
                  <Lock className="size-3 text-red-600" /> Wallet locked
                </span>
              )}
            </div>
            <QueryState query={balance}>
              <CategoryWalletBalances wallet={balance.data?.wallet} />
            </QueryState>
          </div>

          {/* Quick Actions */}
          <div className="detail-sheet-actions space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">User Actions</p>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                className="account-profile-rate justify-start gap-2"
                onClick={() => {
                  onClose();
                  onAction("rate", account);
                }}
              >
                <Pencil className="size-3.5 text-muted-foreground" />
                Change Campaign Rate
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="account-profile-allocate credit-allocate-button justify-start gap-2"
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
                className="account-profile-ledger justify-start gap-2 text-muted-foreground"
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
  const isPreview = signedInUser?.isPreview;
  const canReclaim = signedInUser?.role === "Super Admin" || signedInUser?.featureAccess?.reclaimCredit === true;
  const query = useResellerQuery("accounts");
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const status = params.get("status") || "all";
  const [modal, setModal] = useState(null);
  const [localDetail, setDetail] = useState(null);
  const selectedAccount = params.get("account");
  const detail = selectedAccount ? (query.data?.users || []).find((account) => String(account._id || account.id) === selectedAccount && account.role === "User") : localDetail;
  function closeDetail() {
    setDetail(null);
    setParams((previous) => { const next = new URLSearchParams(previous); next.delete("account"); return next; }, { replace: true });
  }
  const removeAccount = useResellerMutation("deleteAccount", "User removed", () => setModal(null));
  const statusUpdate = useResellerMutation("accountAccess", "User status updated", () => setModal(null));
  function selectStatus(account, nextStatus) {
    statusUpdate.reset();
    setModal({ type: "status", account, nextStatus });
  }

  const rawAccounts = query.data?.users || [];
  // Reseller only manages User role accounts
  const accounts = rawAccounts.filter((a) => a.role === "User");

  const rows = accounts.filter(
    (a) =>
      (status === "all" || (status === "expired" ? a.isExpired : a.status === status)) &&
      `${a.username} ${a.email} ${a.companyName || ""} ${a.phone || ""} ${a._id}`.toLowerCase().includes(search.toLowerCase())
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

  const columns = [
    {
      key: "dp_img",
      label: "DP",
      render: (a) => <UserAvatar user={a} className="size-9" />,
    },
    {
      key: "name",
      label: "User",
      sort: (a) => a.username,
      render: (a) => (
        <div className="min-w-0">
        <button
          title={a.username}
          className="max-w-48 truncate text-left font-medium hover:underline text-foreground cursor-pointer"
          onClick={() => setDetail(a)}
        >
          {a.username}
        </button>
        <span className="account-name-secondary" title={a.email}>{a.email}</span>
        </div>
      ),
    },
    {
      key: "email",
      label: "Email",
      render: (a) => <span className="text-muted-foreground">{a.email}</span>,
    },
    {
      key: "accountExpiry",
      label: "User expiry",
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
      render: (a) => <AccountStatusMenu account={a} disabled={statusUpdate.isPending} onSelect={nextStatus => selectStatus(a, nextStatus)} />,
    },
    {
      key: "actions",
      label: <span className="sr-only">Actions</span>,
      render: (a) => (
        <div className="portal-row-actions account-row-actions">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="credit-allocate-button"
            title="Allocate credits"
            aria-label={`Allocate credits to ${a.username}`}
            disabled={isPreview}
            onClick={() => setModal({ type: "allocate", account: a })}
          >
            <Wallet className="size-4" aria-hidden="true" />
            <span className="account-credit-label">Allocate credits</span>
          </Button>
          <RowActionsMenu
            name={a.username}
            actions={[
              { label: "Details", icon: Eye, onClick: () => setDetail(a) },
              { label: "Manage access & expiry", icon: Lock, disabled: isPreview, onClick: () => setModal({ type: "accountAccess", account: a }) },
              { label: "Purchase rates", icon: Pencil, disabled: isPreview, onClick: () => setModal({ type: "rate", account: a }) },
              { label: "Allocate credits", icon: Wallet, disabled: isPreview, onClick: () => setModal({ type: "allocate", account: a }) },
              ...(canReclaim ? [{ label: "Reclaim credits", icon: MinusCircle, disabled: isPreview, onClick: () => setModal({ type: "reclaim", account: a }) }] : []),
              { label: "Delete user", icon: Trash2, disabled: isPreview, destructive: true, onClick: () => setModal({ type: "deleteAccount", account: a }) },
            ]}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeading
        inlineMobile
        title="Users"
        description="Find users, allocate credits, and manage user access."
        action={
          <Button
            data-tour="reseller-add-user"
            disabled={signedInUser?.isPreview || query.isPending || query.isError}
            onClick={() => setModal({ type: "create" })}
            className="gap-1.5 font-semibold"
          >
            <Plus className="size-4" />
            Add user
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox
            label="Search name, company, email or phone"
            value={search}
            onChange={(value) => update("search", value)}
          />
          <FilterSelect
            label="User status"
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
        empty={!accounts.length}
        emptyTitle="No users yet"
        emptyDescription="Use Add user to create your first client user."
        emptyAction={<Button disabled={signedInUser?.isPreview} onClick={() => setModal({ type: "create" })}>Add user</Button>}
      >
        <DataTable
          key={`users-${search}-${status}`}
          caption="Client users"
          className="account-list-table account-list-table-managed account-card-list"
          rows={rows}
          emptyTitle="No users match your filters"
          emptyAction={<ClearFiltersButton />}
          columns={columns}
          mobile={{
            primary: "name",
            secondary: "email",
            featured: ["status", "accountExpiry"],
          }}
        />
      </QueryState>

      {detail && (
        <UserDetail
          account={detail}
          onClose={closeDetail}
          onAction={(type, acc, nextStatus) => type === "status" ? selectStatus(acc, nextStatus) : setModal({ type, account: acc })}
        />
      )}

      {modal?.type === "status" && <AccountStatusDialog change={modal} mutation={statusUpdate} onClose={() => setModal(null)} />}
      {modal?.type === "deleteAccount" && (
        <AlertDialog open onOpenChange={(open) => { if (!open && !removeAccount.isPending) setModal(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {modal.account.username}?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong className="block mb-2 text-foreground break-words">{modal.account.username}</strong>
                This user and their wallet will be permanently deleted. Campaign and credit history will be retained for audit.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {removeAccount.error && <p className="text-sm text-destructive">{removeAccount.error.message}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removeAccount.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={removeAccount.isPending || signedInUser?.isPreview}
                className="border border-destructive bg-white text-destructive hover:bg-red-50"
                onClick={(event) => {
                  event.preventDefault();
                  removeAccount.mutate(modal.account._id);
                }}
              >
                {removeAccount.isPending ? "Deleting…" : "Delete user"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {modal?.type === "create" && (
        <ResellerActionForm
          title="Add user"
          description="Create a client user under your reseller account.."
          action="createAccount"
          role="User"
          successMessage="User created successfully"
          onClose={() => setModal(null)}
          initialValues={{ username: "", email: "", phone: "", companyName: "", password: "", expiresAt: "" }}
          fields={[
            { key: "username", label: "User name", required: true, maxLength: 100 },
            { key: "email", label: "Email address", type: "email", required: true },
            { key: "companyName", label: "Company name", required: true, maxLength: 150 },
            { key: "phone", label: "Phone number", required: true, type: "tel", maxLength: 40, hint: "Include the country code, e.g. +919876543210." },
            {
              key: "password",
              label: "Initial password",
              type: "password",
              required: true,
              hint: "Must contain at least 8 characters.",
            },
            {
              key: "expiresAt",
              label: "User expiry date (optional)",
              type: "date",
              hint: "The user remains active through this date. Leave blank for no expiry.",
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
            phone: (v.phone || "").trim(),
            companyName: (v.companyName || "").trim(),
            password: v.password,
            role: "User",
            expiresAt: v.expiresAt || null,
          })}
          review={(v) => (
            <>
              <p className="font-medium text-foreground">{v.username}</p>
              <p className="text-muted-foreground text-xs">{v.email}</p>{v.companyName && <p className="text-xs">Company: {v.companyName}</p>}{v.phone && <p className="text-xs">Phone: {v.phone}</p>}
              <p className="text-xs mt-1">Role: User</p>
              <p className="text-xs">
                Expiry: <strong>{v.expiresAt || "No expiry"}</strong>
              </p>
            </>
          )}
          submitLabel="Create user"
        />
      )}

      {modal?.type === "rate" && (
        <BuyerPurchaseRatesDialog account={modal.account} onClose={() => setModal(null)} />
      )}

      {modal?.type === "editAccount" && (
        <ResellerActionForm
          title="Edit user"
          description="Update the user name, email, password, or expiry date. Leave the password blank to keep it unchanged."
          action="updateAccount"
          role="User"
          successMessage="User updated successfully"
          onClose={() => setModal(null)}
          initialValues={{
            username: modal.account.username || "",
            email: modal.account.email || "",
            phone: modal.account.phone || "",
            companyName: modal.account.companyName || "",
            password: "",
            expiresAt: modal.account.expiresAt ? new Date(modal.account.expiresAt).toISOString().slice(0, 10) : "",
          }}
          fields={[
            { key: "username", label: "User name", required: true, maxLength: 100 },
            { key: "email", label: "Email address", type: "email", required: true },
            { key: "companyName", label: "Company name", required: true, maxLength: 150 },
            { key: "phone", label: "Phone number", required: true, type: "tel", maxLength: 40, hint: "Include the country code, e.g. +919876543210." },
            { key: "password", label: "New password (optional)", type: "password", hint: "Leave blank to keep the current password. If set, use at least 8 characters." },
            { key: "expiresAt", label: "User expiry date (optional)", type: "date", hint: "Leave blank for no expiry." },
          ]}
          validate={(values) => values.password && values.password.trim().length < 8 ? "The new password must contain at least 8 characters." : ""}
          payload={(values) => ({
            id: modal.account._id,
            username: values.username.trim(),
            email: values.email.trim(),
            phone: (values.phone || "").trim(),
            companyName: (values.companyName || "").trim(),
            ...(values.password ? { password: values.password } : {}),
            expiresAt: values.expiresAt || null,
          })}
          review={(values) => (
            <>
              <p className="font-medium text-foreground">{values.username}</p>
              <p className="text-muted-foreground text-xs">{values.email}</p>{values.companyName && <p className="text-xs">Company: {values.companyName}</p>}{values.phone && <p className="text-xs">Phone: {values.phone}</p>}
              <p className="text-xs">Password: {values.password ? "Will be changed" : "Unchanged"}</p>
              <p className="text-xs">Expiry: <strong>{values.expiresAt || "No expiry"}</strong></p>
            </>
          )}
          submitLabel="Save user"
        />
      )}

      {modal?.type === "accountAccess" && (
        <ResellerActionForm
          title="Manage user access"
          description={`Set ${modal.account.username}'s user status and expiry date. Blocked and expired users keep read-only dashboard access.`}
          action="accountAccess"
          role="User"
          successMessage="User access updated successfully"
          onClose={() => setModal(null)}
          initialValues={{
            status: modal.account.status === "expired" || (modal.account.isExpired && modal.account.status === "active") ? "expired" : modal.account.status || "active",
            accessReason: modal.account.accessReason || "",
            expiresAt: modal.account.expiresAt ? new Date(modal.account.expiresAt).toISOString().slice(0, 10) : "",
          }}
          fields={[
            { key: "status", label: "User status", options: [{ value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }, { value: "expired", label: "Expired" }] },
            { key: "accessReason", label: "Reason shown to this user (optional)", type: "textarea", maxLength: 1000, hint: "The user can view this reason." },
            { key: "expiresAt", label: "User expiry date (optional)", type: "date", hint: "The user remains active through this date. Leave blank for no expiry." },
          ]}
          payload={(values) => ({ id: modal.account._id, status: values.status, expiresAt: values.expiresAt || null, accessReason: (values.accessReason || "").trim() })}
          review={(values) => (
            <>
              <p className="font-medium">{modal.account.username}</p>
              <p>Status: <strong>{values.status}</strong></p>
              {values.accessReason && <p>Reason: {values.accessReason}</p>}
              <p>Expiry: <strong>{values.expiresAt || "No expiry"}</strong></p>
            </>
          )}
          submitLabel="Save user access"
        />
      )}

      {modal?.type === "allocate" && (
        <ResellerActionForm
          title="Allocate credits"
          description="Credits will be deducted from your reseller wallet and transferred to this user's balance."
          action="allocate"
          successMessage="Credits allocated successfully"
          onClose={() => setModal(null)}
          initialValues={{ amount: "", category: "", notes: "" }}
          fields={[
            creditCategoryField,
            {
              key: "amount",
              label: "Credits to allocate",
              required: true,
              type: "number",
              min: 1,
              step: 1,
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
            amount: Number(v.amount), category: v.category,
            notes: v.notes.trim(),
          })}
          review={(v) => (
            <>
              <p className="font-medium text-foreground">{modal.account.username}</p>
              <p className="text-xs mt-1">
                Transfer{" "}
                <strong className="text-primary font-bold">
                  {number(Number(v.amount))} {creditCategoryNames[v.category]}
                </strong>{" "}
                from your wallet.
              </p>
              <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground mt-1">
                {v.notes || "No transaction note provided."}
              </p>
              <CreditBalancePreview balance={modal.account.wallet?.creditBalances?.[v.category]?.available ?? 0} amount={v.amount} />
            </>
          )}
          submitLabel="Allocate credits"
        />
      )}

      {modal?.type === "reclaim" && canReclaim && (
        <ResellerActionForm
          title="Reclaim credits"
          description="Deduct credits from this client user and return them to your wallet."
          action="reclaim"
          successMessage="Credits reclaimed successfully"
          onClose={() => setModal(null)}
          initialValues={{ fromUserId: modal.account._id, amount: "", category: "", notes: "" }}
          fields={[
            creditCategoryField,
            {
              key: "amount",
              label: "Credits to deduct",
              required: true,
              type: "number",
              min: 1,
              step: 1,
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
            amount: Number(v.amount), category: v.category,
            notes: v.notes.trim(),
          })}
          review={(v) => (
            <>
              <p className="font-semibold text-destructive">Reclaim credits</p>
              <p className="text-xs mt-1">
                Deducting{" "}
                <strong className="text-destructive font-bold">
                  {number(Number(v.amount))} {creditCategoryNames[v.category]}
                </strong>{" "}
                from {modal.account.username}.
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                Reason: <strong>{v.notes}</strong>
              </p>
              <CreditBalancePreview balance={modal.account.wallet?.creditBalances?.[v.category]?.available ?? 0} amount={v.amount} deduct />
            </>
          )}
          submitLabel="Reclaim credits"
        />
      )}
    </>
  );
}
