import { useContext, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Clock3, Loader2, Lock } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { ReadOnlyContext } from "@/features/auth/context/read-only.context";
import { accountRestriction } from "../../../../../shared/accountAccess.js";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { StatusBadge, FormError } from "@/features/dashboard/components/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AccountAccessIdentity, AccountAccessSummary } from "./AccountAccessSummary";
import { accessExpiryForDate, dateInputToday } from "../lib/accessExpiry";
import { statusLabels } from "@/lib/format";
import "./account-access-menu.css";

const statuses = ["active", "blocked", "expired"];
const currentStatus = account => accountRestriction(account) || account.status || "active";
const descriptions = { active: "Allow account actions.", blocked: "Pause actions; keep the dashboard read-only.", expired: "Mark account access as expired." };
const icons = { active: CheckCircle2, blocked: Lock, expired: Clock3 };

export default function AccountStatusMenu({ account, onSelect, disabled = false }) {
  const { user } = useAuth();
  const readOnly = useContext(ReadOnlyContext);
  const status = currentStatus(account);
  const allowed = user?.role === "Super Admin" && ["User", "Reseller"].includes(account.role)
    || user?.role === "Reseller" && account.role === "User";
  if (!allowed || user?.isPreview || accountRestriction(user) || readOnly?.restriction) return <StatusBadge status={status} />;
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button type="button" variant="outline" size="xs" disabled={disabled} className="portal-status account-state-pill account-status-trigger" data-tone={status === "active" ? "success" : "danger"} aria-label={`Change status for ${account.username}, currently ${statusLabels[status] || status}`} />}>
      <span className="account-state-dot" aria-hidden="true" />{statusLabels[status] || status}<ChevronDown aria-hidden="true" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="account-access-menu account-status-menu">
      <DropdownMenuLabel className="account-menu-heading">Account status<strong>{account.username}</strong><small>{account.role} · {statusLabels[status] || status}</small></DropdownMenuLabel>
      {statuses.map(value => {
        const Icon = icons[value];
        return <DropdownMenuItem key={value} disabled={value === status} onClick={() => onSelect(value)} className="account-menu-option" aria-label={statusLabels[value]}>
          <span className="account-menu-icon"><Icon aria-hidden="true" /></span><span className="account-menu-copy"><span>{statusLabels[value]}</span><small>{descriptions[value]}</small></span>{value === status && <Check className="account-menu-current" aria-hidden="true" />}
        </DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function AccountStatusDialog({ change, mutation, onClose }) {
  const submitting = useRef(false);
  const [reason, setReason] = useState(change?.account.accessReason || "");
  const [renewDate, setRenewDate] = useState("");
  const [noExpiry, setNoExpiry] = useState(false);
  const [error, setError] = useState("");
  if (!change) return null;
  const { account, nextStatus } = change;
  const needsRenewal = nextStatus === "active" && account.expiresAt && new Date(account.expiresAt).getTime() <= Date.now();
  const confirmLabel = nextStatus === "blocked" ? "Block account" : nextStatus === "expired" ? "Mark expired" : "Set active";
  function confirm(event) {
    event.preventDefault();
    if (submitting.current || mutation.isPending) return;
    setError("");
    const payload = { id: account._id || account.id, status: nextStatus };
    if (needsRenewal) {
      try { payload.expiresAt = noExpiry ? null : accessExpiryForDate(renewDate); }
      catch (failure) { setError(failure.message); document.getElementById("status-renew-date")?.focus(); return; }
    }
    if (nextStatus !== "active" && reason.trim() !== (account.accessReason || "").trim()) payload.accessReason = reason.trim();
    submitting.current = true;
    mutation.mutate(payload, { onSettled: () => { submitting.current = false; } });
  }
  return <Dialog open onOpenChange={open => { if (!open && !mutation.isPending) onClose(); }}>
    <DialogContent className="account-action-dialog account-status-dialog" showCloseButton={!mutation.isPending}>
      <DialogHeader><DialogTitle>{nextStatus === "blocked" ? "Block account?" : nextStatus === "expired" ? "Mark account expired?" : "Activate account"}</DialogTitle><DialogDescription>Review this change before confirming.</DialogDescription></DialogHeader>
      <form className="access-action-form" onSubmit={confirm} noValidate>
        <div className="access-action-body">
          <AccountAccessIdentity account={account} />
          <AccountAccessSummary current={<StatusBadge status={currentStatus(account)} />} next={<StatusBadge status={nextStatus} />} />
          <p className="access-action-note">{nextStatus === "active" ? "Account actions will be enabled. Existing role permissions still apply." : "The account will keep read-only dashboard access and can contact support."}</p>
          {needsRenewal && <>
            <p className="access-action-notice">The account’s expiry date has passed. Set a new expiry to restore access.</p>
            <div className="access-action-field">
              <label htmlFor="status-renew-date">New account expiry</label>
              <div className="flex items-center gap-3">
                <Input
                  id="status-renew-date"
                  type="date"
                  min={dateInputToday()}
                  disabled={mutation.isPending || noExpiry}
                  value={renewDate}
                  aria-invalid={Boolean(error)}
                  onChange={event => { setRenewDate(event.target.value); setError(""); mutation.reset(); }}
                  className="flex-1"
                />
                <label className="access-no-expiry">
                  <input
                    type="checkbox"
                    checked={noExpiry}
                    disabled={mutation.isPending}
                    onChange={event => { setNoExpiry(event.target.checked); setError(""); mutation.reset(); }}
                  />
                  <span>No expiry</span>
                </label>
              </div>
            </div>
          </>}
          {nextStatus !== "active" && <div className="access-action-field"><label htmlFor="status-access-reason">Reason (optional)</label><Textarea id="status-access-reason" rows={2} maxLength={1000} disabled={mutation.isPending} value={reason} onChange={event => { setReason(event.target.value); mutation.reset(); }} /><small>This reason is visible to the account holder.</small></div>}
          <FormError message={error || mutation.error?.message} />
        </div>
        <div className="access-action-footer">
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={nextStatus === "active" ? "default" : "destructive"} disabled={mutation.isPending}>{mutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}{mutation.isPending ? "Saving…" : confirmLabel}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
