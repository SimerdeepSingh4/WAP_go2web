import BuyerPurchaseRatesDialog from "@/features/credits/components/PurchaseRateEditor";
import CategoryWalletBalances from "@/features/credits/components/CategoryWalletBalances";
import { creditCategoryField, creditCategoryNames } from "@/features/credits/lib/creditTransactionDisplay";
import { useRef, useState } from "react";
import { AnimatedCollapse } from "@/components/ui/animated-collapse";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Eye,
  Pencil,
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
  Camera,
  Mail,
  Phone,
  Building2,
  Copy,
  Check,
  FileText,
  Wallet,
  ArrowUpRight,
  ChevronDown,
  Users,
  UserRoundCheck,
  UserRoundX,
  Clock3,
} from "lucide-react";
import api from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";
import RowActionsMenu from "@/features/dashboard/components/RowActionsMenu";
import { PageHeading, QueryState, SearchBox, FilterSelect, DataTable, ClearFiltersButton } from "../../dashboard/components/shared";
import ActionForm from "../components/ActionForm";
import WhiteLabelAccessDialog from "../components/WhiteLabelAccessDialog";
import WhiteLabelAccessMenu from "../components/WhiteLabelAccessMenu";
import { AccountMediaLimitsDialog } from "../components/MediaUploadLimits";
import { mediaUploadSummary } from "../components/mediaUploadSummary";
import useMediaUploadLimits from "@/features/campaigns/hooks/useMediaUploadLimits";
import { useAdminQuery } from "../hooks/useAdmin";
import { number, dateTime } from "../../../lib/format";
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
import { exitFullAccessImpersonation, startFullAccessImpersonation } from "@/features/accounts/services/users.api.js";
import UserAvatar from "@/features/accounts/components/UserAvatar";
import AccountStatusMenu, { AccountStatusDialog } from "@/features/accounts/components/AccountStatusMenu";
import { CreditBalancePreview } from "@/features/dashboard/components/ActionReview";
import "@/features/accounts/components/account-list.css";
import { resolveUserImageUrl } from "@/features/accounts/lib/profileImage";
import "./admin-accounts.css";

function AccountDetail({ account, onClose, onAction }) {
  const uploadLimits = useMediaUploadLimits();
  const [showAudit, setShowAudit] = useState(false);
  const [downloadingDp, setDownloadingDp] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
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

  function copyEmail() {
    if (!account.email) return;
    navigator.clipboard?.writeText(account.email);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  }

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg p-0 flex flex-col gap-0 overflow-hidden">
        <SheetHeader className="px-4 py-3 border-b border-border bg-card shrink-0">
          <SheetTitle className="text-base font-semibold">Account Profile & Details</SheetTitle>
          <SheetDescription className="sr-only">{account.role} account profile, parameters, and ledger audit</SheetDescription>
        </SheetHeader>

        <div className="overflow-y-auto flex-1 space-y-2.5 p-3 sm:p-4">
          <section aria-labelledby="account-profile-name" className="rounded-2xl border border-border bg-card shadow-xs">
            <div className="flex items-start gap-3 px-3 pt-3 pb-2">
              <div className="relative shrink-0 self-start">
                <UserAvatar
                  user={{ ...account, dp_img: dpImage }}
                  className="size-14 rounded-xl border-2 border-background shadow-sm ring-1 ring-border object-cover"
                />
                <input
                  ref={dpInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label={`Choose DP for ${account.username}`}
                  disabled={updateDp.isPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) {
                      toast.add({ title: "Image is too large", description: "Choose an image up to 5 MB.", type: "error" });
                      event.target.value = "";
                      return;
                    }
                    updateDp.mutate(file);
                  }}
                />
                <button
                  type="button"
                  disabled={updateDp.isPending || (account.role !== "Super Admin" && account.featureAccess?.campaignDp !== true)}
                  onClick={() => dpInput.current?.click()}
                  title={account.role !== "Super Admin" && account.featureAccess?.campaignDp !== true ? "Enable profile DP in Manage account access first" : "Change photo"}
                  aria-label="Change profile photo"
                  className="absolute -bottom-1 -right-1 size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs hover:scale-105 transition-transform disabled:opacity-50 cursor-pointer"
                >
                  <Camera className="size-3" aria-hidden="true" />
                </button>
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="account-profile-name" className="break-words text-xl leading-tight font-semibold tracking-tight text-card-foreground">
                  {account.username}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant={account.role === "Reseller" ? "default" : "secondary"}>
                    {account.role}
                  </Badge>
                  <AccountStatusMenu account={account} onSelect={nextStatus => { onClose(); onAction?.("status", account, nextStatus); }} />
                </div>
              </div>
              {dpImage && (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={downloadingDp}
                  onClick={downloadDp}
                  title="Save profile photo"
                  aria-label={downloadingDp ? "Saving profile photo" : "Save profile photo"}
                >
                  <Download aria-hidden="true" />
                </Button>
              )}
            </div>

            {(account.email || account.phone || account.companyName) && (
              <div className="mx-3 grid gap-1.5 rounded-xl bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground">
                {account.email && (
                  <button
                    type="button"
                    onClick={copyEmail}
                    className="flex min-w-0 items-center gap-2 rounded-sm text-left hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={copiedEmail ? "Email copied" : "Copy email address"}
                    title={account.email}
                  >
                    <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{account.email}</span>
                    {copiedEmail ? <Check className="size-3.5 shrink-0" aria-hidden="true" /> : <Copy className="size-3.5 shrink-0" aria-hidden="true" />}
                  </button>
                )}
                {(account.phone || account.companyName) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {account.phone && (
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                        {account.phone}
                      </span>
                    )}
                    {account.companyName && (
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="break-words">{account.companyName}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 p-3">
              <Button type="button" size="sm" onClick={() => { onClose(); onAction?.("edit", account); }}>
                <Pencil aria-hidden="true" />
                Edit details
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => { onClose(); onAction?.("role", account); }}>
                <UserCog aria-hidden="true" />
                Change role
              </Button>
            </div>
          </section>

          <section aria-labelledby="account-wallet-heading" data-locked={Boolean(balance.data?.wallet?.isLocked)} className="space-y-2.5 rounded-2xl border border-border bg-card p-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Wallet className="size-4" aria-hidden="true" /></span>
              <h3 id="account-wallet-heading" className="flex-1 text-sm font-semibold">Wallet balances</h3>
              {balance.data?.wallet?.isLocked && <Badge variant="outline" className="border-destructive/30 text-destructive"><Lock aria-hidden="true" />Wallet locked</Badge>}
            </div>
            <QueryState query={balance}>
              <div className="rounded-xl bg-muted/50 p-2.5 [&_dl]:grid-cols-2 [&_dl>div]:flex-col [&_dl>div]:gap-1 [&_dt]:text-muted-foreground">
                <CategoryWalletBalances wallet={balance.data?.wallet} />
              </div>
            </QueryState>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" onClick={() => { onClose(); onAction?.("allocate", account); }}>
                <Plus aria-hidden="true" />
                Allocate credits
              </Button>
              <Button size="sm" variant="outline" onClick={() => { onClose(); onAction?.("reclaim", account); }}>
                <RotateCcw aria-hidden="true" />
                Reclaim
              </Button>
            </div>
          </section>

          <details className="group/parameters rounded-2xl border border-border bg-card shadow-xs">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-2xl p-3 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><FileText className="size-4" aria-hidden="true" /></span>
              <span className="flex-1 text-sm font-semibold">Account parameters</span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground group-open/parameters:rotate-180" aria-hidden="true" />
            </summary>
            <dl className="mx-3 mb-3 divide-y divide-border/60 rounded-xl bg-muted/50 px-3 text-xs [&_dd]:min-w-0 [&_dd]:text-right [&_dd]:wrap-anywhere [&_dt]:text-muted-foreground">
              <div className="grid grid-cols-2 items-start gap-3 py-2.5">
                <dt>Daily campaign limit</dt>
                <dd>
                  <span className="font-medium text-foreground">
                    {account.dailyCampaignLimit ? `${number(account.dailyCampaignLimit)} campaigns / day` : "Platform default"}
                  </span>
                </dd>
              </div>

              <div className="grid grid-cols-2 items-start gap-3 py-2.5">
                <dt>{account.role} expiry</dt>
                <dd>
                  <span className={account.isExpired ? "font-semibold text-destructive flex items-center gap-1" : "font-medium text-foreground"}>
                    {account.expiresAt ? dateTime(account.expiresAt) : "No expiry"}
                    {account.isExpired && " · Expired"}
                  </span>
                </dd>
              </div>

              {/* <div className="grid grid-cols-2 items-start gap-3 py-2.5">
                <dt>Assigned reseller</dt>
                <dd>
                  {account.resellerId?.username ? (
                    <span className="font-semibold text-foreground">{account.resellerId.username}</span>
                  ) : account.role === "User" ? (
                    <Badge variant="secondary" className="gap-1 font-medium text-xs">
                      <ShieldCheck className="size-3 text-primary" />
                      Super Admin
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </dd>
              </div> */}

              <div className="grid grid-cols-2 items-start gap-3 py-2.5">
                <dt>Upload limits</dt>
                <dd>
                  <span className="font-medium text-foreground" title={mediaUploadSummary(account, uploadLimits.defaults)}>
                    {mediaUploadSummary(account, uploadLimits.defaults)}
                  </span>
                </dd>
              </div>

              {account.role === "Reseller" && (
                <div className="grid grid-cols-2 items-start gap-3 py-2.5">
                  <dt>White-label access</dt>
                  <dd>
                    {account.whiteLabel?.enabled ? (
                      <Badge variant="outline" className="gap-1 text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                        <Sparkles className="size-3 text-emerald-600" />
                        {account.whiteLabel?.subdomain ? `${account.whiteLabel.subdomain}.go2web` : "Active"}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Disabled</span>
                    )}
                  </dd>
                </div>
              )}

              {account.role === "Reseller" && (
                <div className="grid grid-cols-2 items-start gap-3 py-2.5">
                  <dt>Credit reclaim</dt>
                  <dd>
                    {account.featureAccess?.reclaimCredit ? (
                      <Badge variant="outline" className="gap-1 text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                        Allowed
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">Not allowed</span>
                    )}
                  </dd>
                </div>
              )}

              <div className="grid grid-cols-2 items-start gap-3 py-2.5">
                <dt>Registered</dt>
                <dd>
                  <span className="text-muted-foreground">{dateTime(account.createdAt)}</span>
                </dd>
              </div>
            </dl>
          </details>

          <section aria-labelledby="account-ledger-heading" className="space-y-2.5 rounded-2xl border border-border bg-card p-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <RefreshCw className="size-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 id="account-ledger-heading" className="text-sm font-semibold">Ledger reconciliation</h3>
                  <p className="text-xs text-muted-foreground">Compare transactions with the wallet balance.</p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => showAudit ? reconcile.refetch() : setShowAudit(true)}
                disabled={reconcile.isFetching}
              >
                <RefreshCw className={reconcile.isFetching ? "animate-spin" : undefined} aria-hidden="true" />
                {reconcile.isFetching ? "Checking..." : showAudit ? "Recheck balance" : "Check balance"}
              </Button>
            </div>

            <AnimatedCollapse open={showAudit}>
              <QueryState query={reconcile}>
                {reconcile.data && (
                  <div
                    className={`space-y-3 rounded-xl border p-3 text-xs ${reconcile.data.report?.isReconciled
                      ? "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[color:var(--status-success-text)]"
                      : "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[color:var(--status-danger-text)]"
                      }`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      {reconcile.data.report?.isReconciled ? (
                        <>
                          <ShieldCheck className="size-4 shrink-0" />
                          <span>Wallet and recorded ledger match cleanly</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="size-4 shrink-0" />
                          <span>
                            {reconcile.data.report?.classification === "cannot_confirm"
                              ? "Conflicting records need review"
                              : "Balance mismatch detected"}
                          </span>
                        </>
                      )}
                    </div>

                    <dl className="grid grid-cols-2 gap-2">
                      {[
                        ["Added (inflow)", "+" + number(reconcile.data.report?.totalInflow)],
                        ["Used (outflow)", "-" + number(reconcile.data.report?.totalOutflow)],
                        ["Calculated balance", number(reconcile.data.report?.calculatedBalance)],
                        ["Wallet balance", number(reconcile.data.report?.currentBalance)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-border bg-card p-2.5 text-card-foreground">
                          <dt className="text-[11px] text-muted-foreground">{label}</dt>
                          <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
                        </div>
                      ))}
                    </dl>

                    <div className="pt-1">
                      <Link
                        to={`/admin/reconciliation?account=${account._id}`}
                        onClick={onClose}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-4"
                      >
                        Inspect ledger and correction options <ArrowUpRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                )}
              </QueryState>
            </AnimatedCollapse>
          </section>
          <div className="flex justify-end pt-1">
            <Button type="button" variant="destructive" size="sm" onClick={() => { onClose(); onAction?.("deleteAccount", account); }}>
              <Trash2 className="size-4" /> Delete account
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const accountMenuItems = [
  { type: "accountAccess", label: "Access & expiry", icon: Lock, needsData: true },
  { type: "rate", label: "Purchase rates", icon: Pencil },
  { type: "mediaLimits", label: "Upload limits", icon: Upload, needsData: true },
  { type: "detail", label: "Details", icon: Eye },
];

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
  const statusUpdate = useAdminMutation("accountAccess", "Account status updated", () => setModal(null));
  function selectStatus(account, nextStatus) {
    statusUpdate.reset();
    setModal({ type: "status", account, nextStatus });
  }
  const accessAccount = useMutation({
    mutationFn: ({ id }) => startFullAccessImpersonation(id),
    onSuccess: async (data, { targetWindow }) => {
      if (targetWindow.closed) {
        await exitFullAccessImpersonation(data.token).catch(() => { });
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
  const activeCount = roleAccounts.filter((a) => a.status === "active" && !a.isExpired).length;
  const blockedCount = roleAccounts.filter((a) => a.status === "blocked").length;
  const expiredCount = roleAccounts.filter((a) => a.isExpired).length;
  const accountMetrics = [
    {
      label: role === "Reseller" ? "Total resellers" : "Total users",
      value: roleAccounts.length,
      caption: "Accounts in your workspace",
      icon: Users,
      tone: "blue-filled",
    },
    {
      label: "Active",
      value: activeCount,
      caption: "Ready to access the platform",
      icon: UserRoundCheck,
      accent: true,
    },
    {
      label: "Blocked",
      value: blockedCount,
      caption: "Access currently restricted",
      icon: UserRoundX,
      tone: "rose-filled",
    },
    {
      label: "Expired",
      value: expiredCount,
      caption: "Accounts past their expiry",
      icon: Clock3,
      tone: "purple-filled",
    },
  ].map((metric) => ({ ...metric, loading: query.isPending }));

  const rows = roleAccounts.filter(
    (a) =>
      (status === "all" || (status === "expired" ? a.isExpired : a.status === status)) &&
      `${a.username} ${a.email} ${a.companyName || ""} ${a.phone || ""} ${a._id} ${a.resellerId?.username || (a.role === "User" ? "super admin" : "")}`.toLowerCase().includes(search.toLowerCase())
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
        <div className="min-w-0">
          <button
            title={`Open profile for ${a.username}`}
            className="max-w-48 truncate text-left font-medium underline decoration-muted-foreground/50 underline-offset-2 text-foreground block"
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
      render: (a) => <span className="text-muted-foreground text-xs">{a.email}</span>,
    },
    ...(role === "User"
      ? [
        {
          key: "reseller",
          label: "Reseller",
          sort: (a) => a.resellerId?.username || "Super Admin",
          render: (a) =>
            a.resellerId?.username ? (
              <span className="text-xs font-medium">{a.resellerId.username}</span>
            ) : (
              <Badge variant="secondary" className="gap-1 font-medium text-xs">
                <ShieldCheck className="size-3 text-primary" />
                Super Admin
              </Badge>
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
          key: "status",
          label: "Status",
          render: (a) => <AccountStatusMenu account={a} disabled={statusUpdate.isPending} onSelect={nextStatus => selectStatus(a, nextStatus)} />,
        },
      ]),
    {
      key: "accountExpiry",
      label: `${role} expiry`,
      render: (a) => (
        <span className={a.isExpired ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
          {a.expiresAt ? dateTime(a.expiresAt) : "No expiry"}
          {a.isExpired ? " · Expired" : ""}
        </span>
      ),
    },
    ...(role === "User"
      ? [
        {
          key: "status",
          label: "Status",
          render: (a) => <AccountStatusMenu account={a} disabled={statusUpdate.isPending} onSelect={nextStatus => selectStatus(a, nextStatus)} />,
        },
      ]
      : [
        {
          key: "whiteLabel",
          label: "White-Label",
          render: (a) => <WhiteLabelAccessMenu account={a} onSelect={intent => setModal({ type: "whiteLabel", account: a, intent })} />,
        },
      ]),
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
            onClick={() => setModal({ type: "allocate", account: a })}
          >
            <Wallet className="size-4" aria-hidden="true" />
            <span className="account-credit-label">Allocate credits</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-11 lg:min-w-8 account-login-button"
            title="Log in as account"
            aria-label={`Log in as ${a.username}`}
            disabled={accessAccount.isPending || query.isPending}
            onClick={() => openAccount(a)}
          >
            <LogIn className="size-4" aria-hidden="true" />
            <span className="account-login-label">Log in</span>
          </Button>
          <RowActionsMenu
            name={a.username}
            actions={accountMenuItems.map(({ type, label, icon, needsData }) => ({
              label,
              icon,
              disabled: needsData && query.isPending,
              onClick: () => type === "detail" ? setDetail(a) : setModal({ type, account: a }),
            }))}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeading
        eyebrow="Account management"
        title={role === "Reseller" ? "Resellers" : "Users"}
        description={
          role === "Reseller"
            ? "Find resellers, allocate credits, and manage account access."
            : "Find users, allocate credits, and manage account access."
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

      <OverviewMetricCards
        className="account-overview overview-metrics-compact"
        label={`${role} account overview`}
        items={accountMetrics}
      />

      <section className="account-directory" aria-label="Account directory">
        <div className="account-directory-toolbar">
          <div><h2>Account directory</h2><p>Search accounts and manage access, credits, and details.</p></div>
          <div className="flex flex-wrap items-center gap-2.5">
            <SearchBox label="Search name or email..." value={search} onChange={(value) => update("search", value)} />
            <FilterSelect
              label={`${role} status`}
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
        </div>

        <QueryState
          query={query}
          empty={!accounts.some((a) => a.role === role)}
          emptyTitle={`No ${role.toLowerCase()}s yet`}
          emptyDescription={`Use Add ${role.toLowerCase()} to create the first ${role.toLowerCase()}.`}
          emptyAction={<Button onClick={() => setModal({ type: "create" })}>Add {role.toLowerCase()}</Button>}
        >
          <DataTable
            key={`${role}-${search}-${status}`}
            caption={`${role} accounts`}
            className={`account-list-table account-card-list ${role === "Reseller" ? "account-list-table-resellers" : ""}`}
            rows={rows}
            emptyTitle={`No ${role.toLowerCase()} accounts match your filters`}
            emptyAction={<ClearFiltersButton />}
            columns={columns}
            mobile={{
              primary: "name",
              secondary: "email",
              featured: role === "Reseller"
                ? ["status", "whiteLabel", "users", "accountExpiry"]
                : ["status", "accountExpiry", "reseller"],
            }}
          />
        </QueryState>
      </section>

      {detail && <AccountDetail account={detail} onClose={closeDetail} onAction={(type, account, nextStatus) => type === "status" ? selectStatus(account, nextStatus) : setModal({ type, account })} />}
      {modal?.type === "status" && <AccountStatusDialog change={modal} mutation={statusUpdate} onClose={() => setModal(null)} />}

      {modal?.type === "deleteAccount" && (
        <AlertDialog open onOpenChange={(open) => { if (!open && !removeAccount.isPending) setModal(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {modal.account.role.toLowerCase()} account?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong className="block mb-2 text-foreground break-words">{modal.account.username}</strong>
                {modal.account.role === "Reseller"
                  ? "This reseller can be deleted after its wallet and assigned accounts are resolved."
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

      {modal?.type === "mediaLimits" && <AccountMediaLimitsDialog account={modal.account} onClose={() => setModal(null)} />}

      {modal?.type === "create" && (
        <ActionForm
          role={role}
          title={`Add ${role.toLowerCase()}`}
          description={
            role === "User"
              ? "Create a user account."
              : "Create a reseller account."
          }
          action="createAccount"
          successMessage={`${role} created successfully`}
          onClose={() => setModal(null)}
          initialValues={{ username: "", email: "", phone: "", companyName: "", password: "", dailyCampaignLimit: "", resellerId: "", expiresAt: "", allowCreditReclaim: false }}
          fields={[
            { key: "username", label: `${role} name`, required: true, maxLength: 100 },
            { key: "email", label: "Email", type: "email", required: true },
            { key: "companyName", label: "Company name", required: true, maxLength: 150 },
            { key: "phone", label: "Phone number", required: true, type: "tel", maxLength: 40, hint: "Include the country code, e.g. +919876543210." },
            { key: "password", label: "Initial password", type: "password", required: true, hint: "Use at least 8 characters." },
            {
              key: "dailyCampaignLimit",
              label: "Daily campaign limit (optional)",
              type: "number",
              min: 1,
              step: 1,
              hint: "Max campaigns per day. Leave blank for platform default.",
            },
            {
              key: "expiresAt",
              label: `${role} expiry date (optional)`,
              type: "date",
              hint: `The ${role.toLowerCase()} remains active through this date. Leave blank for no expiry.`,
            },
            // ...(role === "User"
            //   ? [
            //     {
            //       key: "resellerId",
            //       label: "Assigned reseller (optional)",
            //       options: [{ value: "", label: "Direct (Managed by Admin)" }, ...resellers.map((a) => ({ value: a._id, label: a.username }))],
            //     },
            //   ]
            //   : []),
            ...(role === "Reseller"
              ? [
                {
                  key: "allowCreditReclaim",
                  label: "Allow credit reclaim",
                  type: "checkbox",
                  hint: "Allow this reseller to reclaim unused credits from their client users back to their reseller wallet.",
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
            dailyCampaignLimit: v.dailyCampaignLimit ? Number(v.dailyCampaignLimit) : null,
            expiresAt: v.expiresAt || null,
            // ...(role === "User" && v.resellerId ? { resellerId: v.resellerId } : {}),
            ...(role === "Reseller" ? { featureAccess: { reclaimCredit: v.allowCreditReclaim } } : {}),
          })}
          review={(v) => (
            <>
              <p className="font-medium">{v.username}</p>
              <p>{v.email}</p>{v.companyName && <p>Company: {v.companyName}</p>}{v.phone && <p>Phone: {v.phone}</p>}
              <p>Role: {role}</p>
              <p>Daily limit: {v.dailyCampaignLimit ? `${v.dailyCampaignLimit} campaigns / day (Custom)` : "Platform default"}</p>
              <p>Expiry: {v.expiresAt || "No expiry"}</p>
              {/* {role === "User" && <p>Reseller: {resellers.find((a) => a._id === v.resellerId)?.username || "Direct (None)"}</p>} */}
              {role === "Reseller" && <p>Credit reclaim: <strong>{v.allowCreditReclaim ? "Allowed" : "Not allowed"}</strong></p>}
            </>
          )}
          submitLabel={`Create ${role.toLowerCase()}`}
        />
      )}

      {modal?.type === "edit" && (
        <ActionForm
          role={role}
          title={`Edit ${role.toLowerCase()}`}
          description={`Update details or access expiry for ${modal.account.username}.`}
          action="updateAccount"
          successMessage={`${role} updated successfully`}
          onClose={() => setModal(null)}
          initialValues={{
            username: modal.account.username || "",
            email: modal.account.email || "",
            phone: modal.account.phone || "",
            companyName: modal.account.companyName || "",
            password: "",
            dailyCampaignLimit: modal.account.dailyCampaignLimit != null ? String(modal.account.dailyCampaignLimit) : "",
            status: modal.account.status === "expired" || (modal.account.isExpired && modal.account.status === "active") ? "expired" : modal.account.status || "active",
            expiresAt: modal.account.expiresAt ? new Date(modal.account.expiresAt).toISOString().slice(0, 10) : "",
          }}
          fields={[
            { key: "username", label: `${role} name`, required: true, maxLength: 100 },
            { key: "email", label: "Email", type: "email", required: true },
            { key: "companyName", label: "Company name", required: true, maxLength: 150 },
            { key: "phone", label: "Phone number", required: true, type: "tel", maxLength: 40, hint: "Include the country code, e.g. +919876543210." },
            { key: "password", label: "New password (optional)", type: "password", hint: "Leave blank to keep existing password. If setting new, min 8 characters." },
            {
              key: "dailyCampaignLimit",
              label: "Daily campaign limit (optional)",
              type: "number",
              min: 1,
              step: 1,
              hint: "Max campaigns per day. Leave blank for platform default.",
            },
            {
              key: "status",
              label: `${role} status`,
              options: [
                { value: "active", label: "Active" },
                { value: "blocked", label: "Blocked" },
                { value: "expired", label: "Expired" },
              ],
            },
            {
              key: "expiresAt",
              label: `${role} expiry date (optional)`,
              type: "date",
              hint: `The ${role.toLowerCase()} remains active through this date. Leave blank for no expiry.`,
            },
          ]}
          validate={(v) => (v.password && v.password.trim().length > 0 && v.password.trim().length < 8 ? "New password must be at least 8 characters." : "")}
          payload={(v) => ({
            id: modal.account._id,
            username: v.username.trim(),
            email: v.email.trim(),
            phone: (v.phone || "").trim(),
            companyName: (v.companyName || "").trim(),
            ...(v.password && v.password.trim() ? { password: v.password.trim() } : {}),
            dailyCampaignLimit: v.dailyCampaignLimit ? Number(v.dailyCampaignLimit) : null,
            status: v.status,
            expiresAt: v.expiresAt || null,
          })}
          review={(v) => (
            <>
              <p className="font-medium text-foreground">{v.username}</p>
              <p className="text-xs text-muted-foreground">{v.email}</p>{v.companyName && <p className="text-xs">Company: {v.companyName}</p>}{v.phone && <p className="text-xs">Phone: {v.phone}</p>}
              <p className="text-xs">Daily limit: <strong>{v.dailyCampaignLimit ? `${v.dailyCampaignLimit} campaigns / day (Custom)` : "Platform default"}</strong></p>
              <p className="text-xs">Status: <strong>{v.status}</strong></p>
              <p className="text-xs">Expiry: <strong>{v.expiresAt || "No expiry"}</strong></p>
              {v.password?.trim() && <p className="text-xs">Password: <strong>Will be updated</strong></p>}
            </>
          )}
          submitLabel="Save changes"
        />
      )}

      {modal?.type === "rate" && (
        <BuyerPurchaseRatesDialog account={modal.account} onClose={() => setModal(null)} />
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
          role={role}
          title={`Manage ${role.toLowerCase()} access`}
          description={`Set ${modal.account.username}'s ${role.toLowerCase()} status and expiry date. Blocked and expired accounts keep read-only dashboard access.`}
          action="accountAccess"
          successMessage={`${role} access updated`}
          onClose={() => setModal(null)}
          initialValues={{
            status: modal.account.status === "expired" || (modal.account.isExpired && modal.account.status === "active") ? "expired" : modal.account.status || "active",
            accessReason: modal.account.accessReason || "",
            expiresAt: modal.account.expiresAt ? new Date(modal.account.expiresAt).toISOString().slice(0, 10) : "",
            dailyCampaignLimit: modal.account.dailyCampaignLimit != null ? String(modal.account.dailyCampaignLimit) : "",
            allowCampaignDp: modal.account.featureAccess?.campaignDp === true,
            allowCampaignNumber: modal.account.featureAccess?.campaignNumber === true,
            allowCampaignLink: modal.account.featureAccess?.campaignLink === true,
            allowCreditReclaim: modal.account.featureAccess?.reclaimCredit === true,
            canManageClientCampaignLimits: modal.account.canManageClientCampaignLimits === true,
          }}
          fields={[
            { key: "status", label: `${role} status`, options: [{ value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }, { value: "expired", label: "Expired" }] },
            { key: "accessReason", label: `Reason shown to this ${role.toLowerCase()} (optional)`, type: "textarea", maxLength: 1000, hint: `Explain why access is blocked or expired. The ${role.toLowerCase()} can view this reason.` },
            { key: "expiresAt", label: `${role} expiry date (optional)`, type: "date", hint: `The ${role.toLowerCase()} remains active through this date. Leave blank for no expiry.` },
            {
              key: "dailyCampaignLimit",
              label: "Daily campaign limit (optional)",
              type: "number",
              min: 1,
              step: 1,
              hint: "Max campaigns per day. Leave blank for platform default.",
            },
            ...(role === "User" || role === "Reseller" ? [
              { key: "allowCampaignDp", label: "Share profile DP in campaigns", type: "checkbox", hint: `Allow this ${role.toLowerCase()}'s profile DP (from settings) to be shared in campaigns. If disabled, DP upload is blocked and existing DP is removed.` },
              { key: "allowCampaignNumber", label: "Campaign number", type: "checkbox", hint: `Allow this ${role.toLowerCase()} to add an optional contact number to a campaign.` },
              { key: "allowCampaignLink", label: "Campaign link", type: "checkbox", hint: `Show an optional link field when this ${role.toLowerCase()} creates a campaign.` },
            ] : []),
            ...(role === "Reseller" ? [
              { key: "allowCreditReclaim", label: "Reclaim credits from client users", type: "checkbox", hint: "Allow this reseller to reclaim unused credits from their client users back to their reseller wallet." },
              { key: "canManageClientCampaignLimits", label: "Manage client daily campaign limits", type: "checkbox", hint: "Allow this reseller to set or clear daily campaign limits for their client users." },
            ] : []),
          ]}
          payload={(values) => ({
            id: modal.account._id,
            status: values.status,
            accessReason: (values.accessReason || "").trim(),
            expiresAt: values.expiresAt || null,
            dailyCampaignLimit: values.dailyCampaignLimit ? Number(values.dailyCampaignLimit) : null,
            ...((role === "User" || role === "Reseller") ? {
              featureAccess: {
                campaignDp: values.allowCampaignDp,
                campaignNumber: values.allowCampaignNumber,
                campaignLink: values.allowCampaignLink,
                ...(role === "Reseller" ? { reclaimCredit: values.allowCreditReclaim } : {}),
              }
            } : {}),
            ...(role === "Reseller" ? { canManageClientCampaignLimits: values.canManageClientCampaignLimits } : {}),
          })}
          review={(values) => (
            <>
              <p className="font-medium">{modal.account.username}</p>
              <p>Status: <strong>{values.status}</strong></p>
              {values.accessReason && <p>Reason: {values.accessReason}</p>}
              <p>Expiry: <strong>{values.expiresAt || "No expiry"}</strong></p>
              <p>Daily limit: <strong>{values.dailyCampaignLimit ? `${values.dailyCampaignLimit} campaigns / day (Custom)` : "Platform default"}</strong></p>
              {(role === "User" || role === "Reseller") && <p>Share profile DP in campaigns: <strong>{values.allowCampaignDp ? "Allowed" : "Not allowed (removes current DP)"}</strong></p>}
              {(role === "User" || role === "Reseller") && <p>Campaign number: <strong>{values.allowCampaignNumber ? "Allowed" : "Not allowed"}</strong></p>}
              {(role === "User" || role === "Reseller") && <p>Campaign link: <strong>{values.allowCampaignLink ? "Allowed" : "Not allowed"}</strong></p>}
              {role === "Reseller" && <p>Reclaim credits: <strong>{values.allowCreditReclaim ? "Allowed" : "Not allowed"}</strong></p>}
              {role === "Reseller" && <p>Manage client daily campaign limits: <strong>{values.canManageClientCampaignLimits ? "Allowed" : "Not allowed"}</strong></p>}
            </>
          )}
          submitLabel={`Save ${role.toLowerCase()} access`}
        />
      )}

      {modal?.type === "allocate" && (
        <ActionForm
          title="Allocate credits"
          description={`Add credits directly to ${modal.account.username}'s wallet.`}
          action="allocate"
          successMessage="Credits added successfully"
          onClose={() => setModal(null)}
          initialValues={{
            amount: "",
            category: "",
            notes: "",
          }}
          fields={[
            creditCategoryField,
            { key: "amount", label: "Credits to allocate", required: true, type: "number", min: 1, step: 1 },
            { key: "notes", label: "Note (Optional)", type: "textarea", maxLength: 500 },
          ]}
          payload={(v) => ({
            toUserId: modal.account._id,
            amount: Number(v.amount), category: v.category,
            notes: v.notes.trim(),
          })}
          review={(v) => (
            <>
              <p className="font-medium text-foreground">{modal.account.username} ({modal.account.role})</p>
              <p className="text-xs mt-1">
                Add <strong>{number(Number(v.amount))} {creditCategoryNames[v.category]}</strong> to this account.
              </p>
              <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs mt-1">
                {v.notes || "No note."}
              </p>
              <CreditBalancePreview balance={modal.account.wallet?.creditBalances?.[v.category]?.available ?? 0} amount={v.amount} />
            </>
          )}
          submitLabel="Allocate credits"
        />
      )}

      {modal?.type === "reclaim" && (
        <ActionForm
          title="Reclaim credits"
          description={`Take back unused credits from ${modal.account.username}.`}
          action="reclaim"
          successMessage="Credits deducted successfully"
          onClose={() => setModal(null)}
          initialValues={{ fromUserId: modal.account._id, amount: "", category: "", notes: "" }}
          fields={[
            creditCategoryField,
            { key: "amount", label: "Credits to deduct", required: true, type: "number", min: 1, step: 1 },
            { key: "notes", label: "Reason (optional)", type: "textarea", maxLength: 500, placeholder: "e.g. Account closure, overpayment reversal" },
          ]}
          payload={(v) => ({ fromUserId: modal.account._id, amount: Number(v.amount), category: v.category, notes: (v.notes || "").trim() })}
          review={(v) => (
            <>
              <p className="font-medium text-destructive">Reclaim credits</p>
              <p>
                Deducting <strong>{number(Number(v.amount))} {creditCategoryNames[v.category]}</strong> from {modal.account.username} ({modal.account.role}).
              </p>
              <p className="text-muted-foreground text-xs mt-1">Reason: {v.notes ? v.notes.trim() : "None"}</p>
              <CreditBalancePreview balance={modal.account.wallet?.creditBalances?.[v.category]?.available ?? 0} amount={v.amount} deduct />
            </>
          )}
          submitLabel="Reclaim credits"
        />
      )}

      {modal?.type === "whiteLabel" && (
        <WhiteLabelAccessDialog
          open
          account={modal.account}
          intent={modal.intent}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
