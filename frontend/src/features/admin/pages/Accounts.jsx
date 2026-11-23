import BuyerPurchaseRatesDialog from "@/features/credits/components/PurchaseRateEditor";
import CategoryWalletBalances from "@/features/credits/components/CategoryWalletBalances";
import { creditCategoryField, creditCategoryNames } from "@/features/credits/lib/creditTransactionDisplay";
import { useRef, useState } from "react";
import { AnimatedCollapse } from "@/components/ui/animated-collapse";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  MoreHorizontal,
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
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import api from "@/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { PageHeading, QueryState, SearchBox, FilterSelect, DataTable, ClearFiltersButton } from "../../dashboard/components/shared";
import ActionForm from "../components/ActionForm";
import WhiteLabelAccessDialog from "../components/WhiteLabelAccessDialog";
import WhiteLabelAccessMenu from "../components/WhiteLabelAccessMenu";
import { AccountMediaLimitsDialog, mediaUploadSummary } from "../components/MediaUploadLimits";
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
        <SheetHeader className="p-5 border-b border-border bg-card flex-shrink-0">
          <SheetTitle className="text-base font-semibold">Account Profile & Details</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">{account.role} account profile, parameters, and ledger audit</SheetDescription>
        </SheetHeader>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Profile Hero Card */}
          <div className="rounded-2xl border border-border/80 bg-gradient-to-b from-muted/30 via-card to-card p-5 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="relative group">
                <UserAvatar
                  user={{ ...account, dp_img: dpImage }}
                  className="size-16 rounded-2xl border-2 border-background shadow-sm ring-1 ring-border object-cover"
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
                  className="absolute -bottom-1 -right-1 size-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xs hover:scale-105 transition-transform disabled:opacity-50 cursor-pointer"
                >
                  <Camera className="size-3" />
                </button>
              </div>

              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-1.5">
                  <Badge variant={account.role === "Reseller" ? "default" : "secondary"} className="font-semibold text-xs px-2.5 py-0.5">
                    {account.role}
                  </Badge>
                  <AccountStatusMenu account={account} onSelect={nextStatus => { onClose(); onAction?.("status", account, nextStatus); }} />
                </div>
                {dpImage && (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="h-6 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                    disabled={downloadingDp}
                    onClick={downloadDp}
                  >
                    <Download className="size-3" />
                    {downloadingDp ? "Saving…" : "Save DP"}
                  </Button>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground truncate" title={account.username}>
                {account.username}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={copyEmail}
                  className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors cursor-pointer group"
                  title="Copy email address"
                >
                  <Mail className="size-3.5 text-muted-foreground/70" />
                  <span className="truncate max-w-[200px]">{account.email}</span>
                  {copiedEmail ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                </button>
                {account.phone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="size-3 text-muted-foreground/70" />
                    {account.phone}
                  </span>
                )}
                {account.companyName && (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Building2 className="size-3 text-muted-foreground/70" />
                    {account.companyName}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs gap-1.5 font-medium cursor-pointer"
                onClick={() => { onClose(); onAction?.("edit", account); }}
              >
                <Pencil className="size-3.5" />
                Edit details
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 h-8 text-xs gap-1.5 font-medium cursor-pointer"
                onClick={() => { onClose(); onAction?.("role", account); }}
              >
                <UserCog className="size-3.5" />
                Change role
              </Button>
            </div>
          </div>

          {/* Wallet Balance Card */}
          <div data-locked={Boolean(balance.data?.wallet?.isLocked)} className="rounded-2xl border border-border p-3">
            <QueryState query={balance}>
              <CategoryWalletBalances wallet={balance.data?.wallet} />
              {balance.data?.wallet?.isLocked && <p className="mt-2 text-xs text-destructive">Wallet locked</p>}
            </QueryState>

            <div className="mt-4 pt-3.5 border-t border-border/60 flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => { onClose(); onAction?.("allocate", account); }}
                className="flex-1 h-8 text-xs gap-1.5 font-medium cursor-pointer"
              >
                <Plus className="size-3.5" />
                Allocate credits
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { onClose(); onAction?.("reclaim", account); }}
                className="h-8 text-xs gap-1.5 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer font-medium"
              >
                <RotateCcw className="size-3.5" />
                Reclaim
              </Button>
            </div>
          </div>

          {/* Account Parameters */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Account Parameters</h3>
            </div>

            <div className="divide-y divide-border/60 text-xs">
              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Daily Campaign Limit</span>
                <span className="font-medium text-foreground">
                  {account.dailyCampaignLimit ? `${number(account.dailyCampaignLimit)} campaigns / day` : "Platform default"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Account Expiry</span>
                <span className={account.isExpired ? "font-semibold text-destructive flex items-center gap-1" : "font-medium text-foreground"}>
                  {account.expiresAt ? dateTime(account.expiresAt) : "No expiry"}
                  {account.isExpired && " · Expired"}
                </span>
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Assigned Reseller</span>
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
              </div>

              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Upload Limits</span>
                <span className="font-medium text-foreground max-w-[220px] text-right truncate" title={mediaUploadSummary(account, uploadLimits.defaults)}>
                  {mediaUploadSummary(account, uploadLimits.defaults)}
                </span>
              </div>

              {account.role === "Reseller" && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-muted-foreground">White-Label Access</span>
                  {account.whiteLabel?.enabled ? (
                    <Badge variant="outline" className="gap-1 text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                      <Sparkles className="size-3 text-emerald-600" />
                      {account.whiteLabel?.subdomain ? `${account.whiteLabel.subdomain}.go2web` : "Active"}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Disabled</span>
                  )}
                </div>
              )}

              {account.role === "Reseller" && (
                <div className="flex items-center justify-between py-2.5">
                  <span className="text-muted-foreground">Credit Reclaim</span>
                  {account.featureAccess?.reclaimCredit ? (
                    <Badge variant="outline" className="gap-1 text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                      Allowed
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">Not allowed</span>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between py-2.5">
                <span className="text-muted-foreground">Registered</span>
                <span className="text-muted-foreground">{dateTime(account.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Balance & Ledger Reconciliation */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
                  <RefreshCw className={`size-4 ${reconcile.isFetching ? "animate-spin text-primary" : ""}`} />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ledger Reconciliation</p>
                  <p className="text-[11px] text-muted-foreground">Verify transactions against wallet</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAudit(true)}
                disabled={reconcile.isFetching}
                className="h-8 text-xs gap-1.5 cursor-pointer font-medium"
              >
                <RefreshCw className={`size-3.5 ${reconcile.isFetching ? "animate-spin" : ""}`} />
                {showAudit ? "Re-check" : "Check balance"}
              </Button>
            </div>

            <AnimatedCollapse open={showAudit}>
              <QueryState query={reconcile}>
                {reconcile.data && (
                  <div
                    className={`rounded-xl border p-4 space-y-3 text-xs transition-colors ${
                      reconcile.data.report?.isReconciled
                        ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-950 dark:text-emerald-200"
                        : "border-destructive/30 bg-destructive/5 text-destructive-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold">
                      {reconcile.data.report?.isReconciled ? (
                        <>
                          <ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>Wallet and recorded ledger match cleanly</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="size-4 text-destructive shrink-0" />
                          <span>
                            {reconcile.data.report?.classification === "cannot_confirm"
                              ? "Conflicting records need review"
                              : "Balance mismatch detected"}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/40 text-[11px]">
                      <div className="p-2.5 rounded-lg bg-background/60 border border-border/40">
                        <span className="text-muted-foreground block text-[10px] uppercase font-medium">Added (Inflow)</span>
                        <strong className="text-emerald-600 dark:text-emerald-400 font-bold tabular-nums text-xs">
                          +{number(reconcile.data.report?.totalInflow)}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background/60 border border-border/40">
                        <span className="text-muted-foreground block text-[10px] uppercase font-medium">Used (Outflow)</span>
                        <strong className="text-muted-foreground font-bold tabular-nums text-xs">
                          -{number(reconcile.data.report?.totalOutflow)}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background/60 border border-border/40">
                        <span className="text-muted-foreground block text-[10px] uppercase font-medium">Calculated</span>
                        <strong className="tabular-nums font-bold text-xs">{number(reconcile.data.report?.calculatedBalance)}</strong>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background/60 border border-border/40">
                        <span className="text-muted-foreground block text-[10px] uppercase font-medium">Wallet Balance</span>
                        <strong className="tabular-nums font-bold text-xs">{number(reconcile.data.report?.currentBalance)}</strong>
                      </div>
                    </div>

                    <div className="pt-1">
                      <Link
                        to={`/admin/reconciliation?account=${account._id}`}
                        onClick={onClose}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-4"
                      >
                        Inspect full ledger & correction options →
                      </Link>
                    </div>
                  </div>
                )}
              </QueryState>
            </AnimatedCollapse>
          </div>
          <div className="border-t pt-4">
            <Button variant="outline" className="text-destructive" onClick={() => { onClose(); onAction?.("deleteAccount", account); }}>
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
  { type: "detail", label: "Account details", icon: Eye },
];

function AccountActionsMenu({ account, mobile, loading, onAction }) {
  const Trigger = mobile ? SheetTrigger : DropdownMenuTrigger;
  const Item = mobile ? SheetClose : DropdownMenuItem;
  const trigger = (
    <Trigger render={<Button variant="ghost" size="icon" title="Account actions" aria-label={`Actions for ${account.username}`} />}>
      <MoreHorizontal />
    </Trigger>
  );
  const itemClass = mobile ? "flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left hover:bg-accent disabled:opacity-50" : "min-h-6 py-0.5 text-[13px]";
  const actions = accountMenuItems.map(({ type, label, icon: Icon, needsData }) => (
    <Item key={type} className={itemClass} disabled={needsData && loading} onClick={() => onAction(type)}>
      <Icon className="size-4" />
      {label}
    </Item>
  ));
  if (mobile) {
    return (
      <Sheet>
        {trigger}
        <SheetContent side="bottom" className="max-h-[90dvh] gap-1 overflow-y-auto rounded-t-xl p-4">
          <SheetHeader className="p-0 pb-2 pr-8">
            <SheetTitle className="break-all">Actions for {account.username}</SheetTitle>
          </SheetHeader>
          {actions}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <DropdownMenu>
      {trigger}
      <DropdownMenuContent align="end" className="w-44">{actions}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Accounts({ role }) {
  const mobile = useIsMobile();
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
      label: "Account expiry",
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
            className="min-w-11 lg:min-w-8"
            title="Log in as account"
            aria-label={`Log in as ${a.username}`}
            disabled={accessAccount.isPending || query.isPending}
            onClick={() => openAccount(a)}
          >
            <LogIn className="size-4" />
            <span className="account-login-label">Log in</span>
          </Button>
          <Button type="button" variant="outline" size="sm" title="Allocate credits" aria-label={`Allocate credits to ${a.username}`} onClick={() => setModal({ type: "allocate", account: a })}>
            <span>Allocate<span className="account-credit-label"> credits</span></span>
          </Button>
          <AccountActionsMenu
            account={a}
            mobile={mobile}
            loading={query.isPending}
            onAction={(type) => type === "detail" ? setDetail(a) : setModal({ type, account: a })}
          />
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeading
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
          title={`Add ${role.toLowerCase()}`}
          description={
            role === "User"
              ? "Create a user account. You can allocate credits directly to this user after creation."
              : "Create a reseller account. Credits can be allocated after creation."
          }
          action="createAccount"
          successMessage={`${role} account created`}
          onClose={() => setModal(null)}
          initialValues={{ username: "", email: "", phone: "", companyName: "", password: "", dailyCampaignLimit: "", resellerId: "", expiresAt: "", allowCreditReclaim: false }}
          fields={[
            { key: "username", label: "Account name", required: true, maxLength: 100 },
            { key: "email", label: "Email", type: "email", required: true },
            { key: "companyName", label: "Company name (optional)", maxLength: 150 },
            { key: "phone", label: "Phone number (optional)", type: "tel", maxLength: 40, hint: "Include the country code, e.g. +919876543210." },
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
            ...(role === "User" && v.resellerId ? { resellerId: v.resellerId } : {}),
            ...(role === "Reseller" ? { featureAccess: { reclaimCredit: v.allowCreditReclaim } } : {}),
          })}
          review={(v) => (
            <>
              <p className="font-medium">{v.username}</p>
              <p>{v.email}</p>{v.companyName && <p>Company: {v.companyName}</p>}{v.phone && <p>Phone: {v.phone}</p>}
              <p>Role: {role}</p>
              <p>Daily limit: {v.dailyCampaignLimit ? `${v.dailyCampaignLimit} campaigns / day (Custom)` : "Platform default"}</p>
              <p>Expiry: {v.expiresAt || "No expiry"}</p>
              {role === "User" && <p>Reseller: {resellers.find((a) => a._id === v.resellerId)?.username || "Direct (None)"}</p>}
              {role === "Reseller" && <p>Credit reclaim: <strong>{v.allowCreditReclaim ? "Allowed" : "Not allowed"}</strong></p>}
            </>
          )}
          submitLabel="Create account"
        />
      )}

            {modal?.type === "edit" && (
        <ActionForm
          title={`Edit ${role.toLowerCase()} account`}
          description={`Update details or access expiry for ${modal.account.username}.`}
          action="updateAccount"
          successMessage="Account updated successfully"
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
            { key: "username", label: "Account name", required: true, maxLength: 100 },
            { key: "email", label: "Email", type: "email", required: true },
            { key: "companyName", label: "Company name (optional)", maxLength: 150 },
            { key: "phone", label: "Phone number (optional)", type: "tel", maxLength: 40, hint: "Include the country code, e.g. +919876543210." },
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
          title="Manage account access"
          description={`Set ${modal.account.username}'s account status and expiry date. Blocked and expired accounts keep read-only dashboard access.`}
          action="accountAccess"
          successMessage="Account access updated"
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
          }}
          fields={[
            { key: "status", label: "Account status", options: [{ value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }, { value: "expired", label: "Expired" }] },
            { key: "accessReason", label: "Reason shown to this account (optional)", type: "textarea", maxLength: 1000, hint: "Explain why access is blocked or expired. The account holder can view this reason." },
            { key: "expiresAt", label: "Account expiry date (optional)", type: "date", hint: "The account remains active through this date. Leave blank for no expiry." },
            {
              key: "dailyCampaignLimit",
              label: "Daily campaign limit (optional)",
              type: "number",
              min: 1,
              step: 1,
              hint: "Max campaigns per day. Leave blank for platform default.",
            },
            ...(role === "User" || role === "Reseller" ? [
              { key: "allowCampaignDp", label: "Share profile DP in campaigns", type: "checkbox", hint: "Allow this account's profile DP (from settings) to be shared in campaigns. If disabled, DP upload is blocked and existing DP is removed." },
              { key: "allowCampaignNumber", label: "Campaign number", type: "checkbox", hint: "Allow this account to add an optional contact number to a campaign." },
              { key: "allowCampaignLink", label: "Campaign link", type: "checkbox", hint: "Show an optional link field when this account creates a campaign." },
            ] : []),
            ...(role === "Reseller" ? [
              { key: "allowCreditReclaim", label: "Reclaim credits from client users", type: "checkbox", hint: "Allow this reseller to reclaim unused credits from their client users back to their reseller wallet." },
            ] : []),
          ]}
          payload={(values) => ({
            id: modal.account._id,
            status: values.status,
            accessReason: (values.accessReason || "").trim(),
            expiresAt: values.expiresAt || null,
            dailyCampaignLimit: values.dailyCampaignLimit ? Number(values.dailyCampaignLimit) : null,
            ...((role === "User" || role === "Reseller") ? { featureAccess: {
              campaignDp: values.allowCampaignDp,
              campaignNumber: values.allowCampaignNumber,
              campaignLink: values.allowCampaignLink,
              ...(role === "Reseller" ? { reclaimCredit: values.allowCreditReclaim } : {}),
            } } : {}),
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
            </>
          )}
          submitLabel="Save account access"
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
