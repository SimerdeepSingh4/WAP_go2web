import { useRef, useState } from "react";
import { AnimatedCollapse } from "@/components/ui/animated-collapse";
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
  RefreshCw,
  RotateCcw,
  Lock,
  Trash2,
  LogIn,
  UserCog,
  Download,
  Upload,
  Sparkles,
} from "lucide-react";
import api from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageHeading, QueryState, SearchBox, FilterSelect, StatusBadge, DataTable } from "../components/shared";
import ActionForm from "../components/ActionForm";
import WhiteLabelAccessDialog from "../components/WhiteLabelAccessDialog";
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
import UserAvatar from "@/components/dashboard/UserAvatar";
import { resolveUserImageUrl } from "@/components/dashboard/profileImage";

function AccountDetail({ account, onClose, onAction }) {
  const [showAudit, setShowAudit] = useState(false);
  const [downloadingDp, setDownloadingDp] = useState(false);
  const [dpImage, setDpImage] = useState(account.dp_img || "");
  const dpInput = useRef(null);
  const queryClient = useQueryClient();
  const balance = useAdminQuery("balance", { id: account._id });
  const reconcile = useAdminQuery("reconcile", { id: account._id }, showAudit);
  const updateDp = useMutation({
    mutationFn: async (file) => {
      const body = new FormData();
      body.append("dp_img", file);
      return (await api.post(`/users/${account._id}/dp-image`, body)).data;
    },
    onSuccess: async (data) => {
      setDpImage(data.user.dp_img || "");
      if (dpInput.current) dpInput.current.value = "";
      toast.add({ title: "Profile DP updated", type: "success" });
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => toast.add({ title: "DP upload failed", description: error.message, type: "error" }),
  });

  async function downloadDp() {
    if (!dpImage || downloadingDp) return;
    setDownloadingDp(true);
    let objectUrl;
    let anchor;
    try {
      const response = await fetch(resolveUserImageUrl(dpImage));
      if (!response.ok) throw new Error("Could not download this profile image.");
      objectUrl = URL.createObjectURL(await response.blob());
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${String(account.username || "user").replace(/[^a-z0-9_-]+/gi, "-")}-dp.webp`;
      document.body.appendChild(anchor);
      anchor.click();
    } catch (error) {
      toast.add({ title: "DP download failed", description: error.message, type: "error" });
    } finally {
      anchor?.remove();
      if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setDownloadingDp(false);
    }
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{account.username}</SheetTitle>
          <SheetDescription>{account.role} account profile & ledger</SheetDescription>
        </SheetHeader>

        <div className="detail-sheet-body space-y-5">
          <div className="detail-sheet-toolbar">
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

          <div className="detail-sheet-profile">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <UserAvatar user={{ ...account, dp_img: dpImage }} className="size-14 border border-border" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Profile photo</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{dpImage ? "Uploaded image" : "No profile image uploaded"}</p>
              </div>
            </div>
            <input ref={dpInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={`Choose DP for ${account.username}`} disabled={updateDp.isPending} onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                toast.add({ title: "Image is too large", description: "Choose an image up to 5 MB.", type: "error" });
                event.target.value = "";
                return;
              }
              updateDp.mutate(file);
            }} />
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" disabled={updateDp.isPending} onClick={() => dpInput.current?.click()}>
                <Upload className="size-3.5" />
                {updateDp.isPending ? "Uploading…" : dpImage ? "Change photo" : "Add photo"}
              </Button>
              <Button size="icon" variant="outline" aria-label={downloadingDp ? "Downloading DP" : "Download DP"} title={downloadingDp ? "Downloading DP" : "Download DP"} disabled={!dpImage || downloadingDp || updateDp.isPending} onClick={downloadDp}>
                <Download className="size-3.5" />
              </Button>
            </div>
          </div>

          <dl className="detail-sheet-details">
            {[
              ["Email", account.email],
              ["Company", account.companyName || "Not provided"],
              ["Phone", account.phone || "Not provided"],
              ["Rate", `${number(account.ratePerMsg)} credits / recipient`],
              ["Account expiry", account.expiresAt ? `${dateTime(account.expiresAt)}${account.isExpired ? " (Expired)" : ""}` : "No expiry"],
              ["Assigned reseller", account.resellerId?.username || "—"],
              ["Created", dateTime(account.createdAt)],
              ...(account.role === "Reseller"
                ? [
                    [
                      "White-label access",
                      account.whiteLabel?.enabled
                        ? `${account.whiteLabel?.expiresAt ? `Active (Expires ${dateTime(account.whiteLabel.expiresAt)})` : "Active (Unlimited)"}${account.whiteLabel?.subdomain ? ` · Subdomain: ${account.whiteLabel.subdomain}` : ""}`
                        : "Disabled",
                    ],
                  ]
                : []),
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
                  <Lock className="size-3 text-red-600" /> Locked & Expired
                </span>
              )}
            </div>
            <QueryState query={balance}>
              <p className={`detail-sheet-wallet-balance font-bold tabular-nums ${balance.data?.wallet?.isLocked ? "text-red-700" : "text-foreground"}`}>
                {number(balance.data?.wallet?.balance)}{" "}
                <span className="text-xs font-normal text-muted-foreground">credits</span>
              </p>
              {balance.data?.wallet?.expiresAt && (
                <p className="detail-sheet-wallet-expiry text-muted-foreground mt-1">
                  Expires on: <strong>{dateTime(balance.data?.wallet?.expiresAt)}</strong>
                  {balance.data?.wallet?.isExpired && (
                    <span className="text-red-600 ml-1 font-semibold">(Expired)</span>
                  )}
                </p>
              )}
            </QueryState>
            <div className="detail-sheet-wallet-actions">
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
          <div className="detail-sheet-check space-y-3">
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

            <AnimatedCollapse open={showAudit}>
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
            </AnimatedCollapse>
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
  const [localDetail, setDetail] = useState(null);
  const selectedAccount = params.get("account");
  const detail = selectedAccount ? (query.data?.users || []).find((account) => String(account._id || account.id) === selectedAccount && account.role === role) : localDetail;
  function closeDetail() {
    setDetail(null);
    setParams((previous) => { const next = new URLSearchParams(previous); next.delete("account"); return next; }, { replace: true });
  }
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

  const rows = roleAccounts.filter(
    (a) =>
      (status === "all" || (status === "expired" ? a.isExpired : a.status === status)) &&
      `${a.username} ${a.email} ${a.companyName || ""} ${a.phone || ""} ${a._id} ${a.resellerId?.username || ""}`.toLowerCase().includes(search.toLowerCase())
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
      key: "dp_img",
      label: "DP",
      render: (a) => <UserAvatar user={a} className="size-9" />,
    },
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
          {
            key: "whiteLabel",
            label: "White-Label",
            render: (a) => {
              const isEnabled = Boolean(a.whiteLabel?.enabled);
              const isExpired = Boolean(isEnabled && a.whiteLabel?.expiresAt && new Date(a.whiteLabel.expiresAt) <= new Date());
              if (!isEnabled) {
                return <Badge variant="outline" className="text-muted-foreground text-[11px] font-normal">Disabled</Badge>;
              }
              if (isExpired) {
                return (
                  <Badge variant="outline" className="text-destructive border-destructive/40 text-[11px] font-medium" title={a.whiteLabel?.expiresAt ? `Expired on ${dateTime(a.whiteLabel.expiresAt)}` : "Expired"}>
                    Expired
                  </Badge>
                );
              }
              return (
                <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 text-[11px] font-medium" title={a.whiteLabel?.expiresAt ? `Expires ${dateTime(a.whiteLabel.expiresAt)}` : "Unlimited access"}>
                  Active {a.whiteLabel?.subdomain ? `(${a.whiteLabel.subdomain})` : ""}
                </Badge>
              );
            },
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
            <DropdownMenuItem disabled={query.isPending} onClick={() => setModal({ type: "edit", account: a })}>
              <Pencil className="size-4 mr-2" />
              Edit account
            </DropdownMenuItem>
            <DropdownMenuItem disabled={query.isPending} onClick={() => setModal({ type: "accountAccess", account: a })}>
              <Lock className="size-4 mr-2" />
              Manage access & expiry
            </DropdownMenuItem>
            {role === "Reseller" && (
              <DropdownMenuItem onClick={() => setModal({ type: "whiteLabel", account: a })}>
                <Sparkles className="size-4 mr-2 text-primary" />
                White-label access
              </DropdownMenuItem>
            )}
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
            data-tour="add-account"
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

      {detail && <AccountDetail account={detail} onClose={closeDetail} onAction={(type, account) => setModal({ type, account })} />}

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
          initialValues={{ username: "", email: "", phone: "", companyName: "", password: "", ratePerMsg: "", resellerId: "", expiresAt: "" }}
          fields={[
            { key: "username", label: "Account name", required: true, maxLength: 100 },
            { key: "email", label: "Email", type: "email", required: true },
            { key: "companyName", label: "Company name (optional)", maxLength: 150 },
            { key: "phone", label: "Phone number (optional)", type: "tel", maxLength: 40, hint: "Include the country code, e.g. +919876543210." },
            { key: "password", label: "Initial password", type: "password", required: true, hint: "Use at least 8 characters." },
            { key: "ratePerMsg", label: "Rate (credits / recipient)", type: "number", min: 0.01, step: 0.01, required: true },
            {
              key: "expiresAt",
              label: "Account expiry date (optional)",
              type: "date",
              hint: "The account remains active through this date. Leave blank for no expiry.",
            },
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
            phone: (v.phone || "").trim(),
            companyName: (v.companyName || "").trim(),
            password: v.password,
            role,
            ratePerMsg: Number(v.ratePerMsg),
            expiresAt: v.expiresAt || null,
            ...(role === "User" && v.resellerId ? { resellerId: v.resellerId } : {}),
          })}
          review={(v) => (
            <>
              <p className="font-medium">{v.username}</p>
              <p>{v.email}</p>{v.companyName && <p>Company: {v.companyName}</p>}{v.phone && <p>Phone: {v.phone}</p>}
              <p>Role: {role}</p>
              <p>Rate: {number(Number(v.ratePerMsg))} credits / recipient</p>
              <p>Expiry: {v.expiresAt || "No expiry"}</p>
              {role === "User" && <p>Reseller: {resellers.find((a) => a._id === v.resellerId)?.username || "Direct (None)"}</p>}
            </>
          )}
          submitLabel="Create account"
        />
      )}

            {modal?.type === "edit" && (
        <ActionForm
          title={`Edit ${role.toLowerCase()} account`}
          description={`Update details, rate, or access expiry for ${modal.account.username}.`}
          action="updateAccount"
          successMessage="Account updated successfully"
          onClose={() => setModal(null)}
          initialValues={{
            username: modal.account.username || "",
            email: modal.account.email || "",
            phone: modal.account.phone || "",
            companyName: modal.account.companyName || "",
            password: "",
            ratePerMsg: String(modal.account.ratePerMsg ?? 12),
            status: modal.account.status === "expired" || (modal.account.isExpired && modal.account.status === "active") ? "expired" : modal.account.status || "active",
            expiresAt: modal.account.expiresAt ? new Date(modal.account.expiresAt).toISOString().slice(0, 10) : "",
            resellerId: modal.account.resellerId?._id || modal.account.resellerId || "",
          }}
          fields={[
            { key: "username", label: "Account name", required: true, maxLength: 100 },
            { key: "email", label: "Email", type: "email", required: true },
            { key: "companyName", label: "Company name (optional)", maxLength: 150 },
            { key: "phone", label: "Phone number (optional)", type: "tel", maxLength: 40, hint: "Include the country code, e.g. +919876543210." },
            { key: "password", label: "New password (optional)", type: "password", hint: "Leave blank to keep existing password. If setting new, min 8 characters." },
            { key: "ratePerMsg", label: "Rate (credits / recipient)", type: "number", min: 0.01, step: 0.01, required: true },
            {
              key: "status",
              label: "Account status",
              options: [
                { value: "active", label: "Active" },
                { value: "blocked", label: "Blocked" },
                { value: "expired", label: "Expired" },
              ],
            },
            {
              key: "expiresAt",
              label: "Account expiry date (optional)",
              type: "date",
              hint: "The account remains active through this date. Leave blank for no expiry.",
            },
            ...(role === "User"
              ? [
                  {
                    key: "resellerId",
                    label: "Assigned reseller",
                    options: [{ value: "", label: "Direct (Managed by Admin)" }, ...resellers.map((a) => ({ value: a._id, label: a.username }))],
                  },
                ]
              : []),
          ]}
          validate={(v) => (v.password && v.password.trim().length > 0 && v.password.trim().length < 8 ? "New password must be at least 8 characters." : "")}
          payload={(v) => ({
            id: modal.account._id,
            username: v.username.trim(),
            email: v.email.trim(),
            phone: (v.phone || "").trim(),
            companyName: (v.companyName || "").trim(),
            ...(v.password && v.password.trim() ? { password: v.password.trim() } : {}),
            ratePerMsg: Number(v.ratePerMsg),
            status: v.status,
            expiresAt: v.expiresAt || null,
            ...(role === "User" ? { resellerId: v.resellerId || null } : {}),
          })}
          review={(v) => (
            <>
              <p className="font-medium text-foreground">{v.username}</p>
              <p className="text-xs text-muted-foreground">{v.email}</p>{v.companyName && <p className="text-xs">Company: {v.companyName}</p>}{v.phone && <p className="text-xs">Phone: {v.phone}</p>}
              <p className="text-xs">Rate: <strong>{number(Number(v.ratePerMsg))} credits / recipient</strong></p>
              <p className="text-xs">Status: <strong>{v.status}</strong></p>
              <p className="text-xs">Expiry: <strong>{v.expiresAt || "No expiry"}</strong></p>
              {role === "User" && <p className="text-xs">Reseller: <strong>{resellers.find((a) => a._id === v.resellerId)?.username || "Direct (None)"}</strong></p>}
            </>
          )}
          submitLabel="Save changes"
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
            allowCampaignDp: modal.account.featureAccess?.campaignDp === true,
            allowCampaignNumber: modal.account.featureAccess?.campaignNumber === true,
            allowCampaignLink: modal.account.featureAccess?.campaignLink === true,
          }}
          fields={[
            { key: "status", label: "Account status", options: [{ value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }, { value: "expired", label: "Expired" }] },
            { key: "expiresAt", label: "Account expiry date (optional)", type: "date", hint: "The account remains active through this date. Leave blank for no expiry." },
            ...(role === "User" ? [
              { key: "allowCampaignDp", label: "Share profile DP in campaigns", type: "checkbox", hint: "Allow this user's profile DP (from settings) to be shared in campaigns." },
              { key: "allowCampaignNumber", label: "Campaign number", type: "checkbox", hint: "Allow this user to add an optional contact number to a campaign." },
              { key: "allowCampaignLink", label: "Campaign link", type: "checkbox", hint: "Show an optional link field when this user creates a campaign." },
            ] : []),
          ]}
          payload={(values) => ({
            id: modal.account._id,
            status: values.status,
            expiresAt: values.expiresAt || null,
            ...(role === "User" ? { featureAccess: { campaignDp: values.allowCampaignDp, campaignNumber: values.allowCampaignNumber, campaignLink: values.allowCampaignLink } } : {}),
          })}
          review={(values) => (
            <>
              <p className="font-medium">{modal.account.username}</p>
              <p>Status: <strong>{values.status}</strong></p>
              <p>Expiry: <strong>{values.expiresAt || "No expiry"}</strong></p>
              {role === "User" && <p>Share profile DP in campaigns: <strong>{values.allowCampaignDp ? "Allowed" : "Not allowed"}</strong></p>}
              {role === "User" && <p>Campaign number: <strong>{values.allowCampaignNumber ? "Allowed" : "Not allowed"}</strong></p>}
              {role === "User" && <p>Campaign link: <strong>{values.allowCampaignLink ? "Allowed" : "Not allowed"}</strong></p>}
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

      {modal?.type === "whiteLabel" && (
        <WhiteLabelAccessDialog
          open
          account={modal.account}
          onClose={() => setModal(null)}
          onSuccess={() => {
            query.refetch();
          }}
        />
      )}
    </>
  );
}
