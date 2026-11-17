import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { updateWhiteLabelAccess } from "@/features/branding/services/branding.api.js";
import { whiteLabelAccessPayload, whiteLabelAccessState } from "@/features/branding/lib/whiteLabelAccess";
import { dateInputToday } from "@/features/accounts/lib/accessExpiry";
import { AccountAccessIdentity, AccountAccessSummary } from "@/features/accounts/components/AccountAccessSummary";
import { WhiteLabelStateBadge } from "./WhiteLabelAccessMenu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { Field, FilterSelect, FormError } from "@/features/dashboard/components/shared";
import { dateTime } from "@/lib/format";
import "@/features/accounts/components/account-access-menu.css";

const titles = { enable: "Enable white-label access", renew: "Renew white-label access", expiry: "Manage white-label expiry", disable: "Disable white-label access" };
const labels = { enable: "Enable access", renew: "Renew access", expiry: "Save expiry", disable: "Disable access" };

export default function WhiteLabelAccessDialog({ open, onClose, account, onSuccess, intent }) {
  const client = useQueryClient();
  const current = account.whiteLabel || {};
  const currentState = whiteLabelAccessState(current);
  const action = intent || (currentState === "disabled" ? "enable" : currentState === "expired" ? "renew" : "expiry");
  const [duration, setDuration] = useState(action === "expiry" ? "keep" : action === "renew" ? "" : "never");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const mutation = useMutation({
    mutationFn: payload => updateWhiteLabelAccess(account._id || account.id, payload),
    onSuccess: async () => {
      await Promise.all(["admin", "adminUsers", "adminAccounts"].map(key => client.invalidateQueries({ queryKey: [key] })));
      toast.add({ title: action === "disable" ? "White-label access disabled" : action === "expiry" ? "White-label expiry updated" : action === "renew" ? "White-label access renewed" : "White-label access enabled", type: "success" });
      onSuccess?.();
      onClose();
    },
    onSettled: () => { submitting.current = false; },
  });
  let preview;
  try { preview = whiteLabelAccessPayload({ intent: action, current, duration, date }); } catch { preview = null; }
  function changeDuration(value) { setDuration(value); setError(""); mutation.reset(); }
  function submit(event) {
    event.preventDefault();
    if (submitting.current || mutation.isPending) return;
    setError("");
    let payload;
    try { payload = whiteLabelAccessPayload({ intent: action, current, duration, date }); }
    catch (failure) {
      setError(failure.message);
      document.getElementById(duration === "custom" ? "custom-wl-expiry" : "white-label-duration")?.focus();
      return;
    }
    submitting.current = true;
    mutation.mutate(payload);
  }
  const options = [
    ...(action === "expiry" ? [{ value: "keep", label: current.expiresAt ? "Keep current expiry" : "Keep no expiry" }] : []),
    ...(action === "renew" ? [{ value: "", label: "Choose access duration" }] : []),
    { value: "30days", label: "30 days" }, { value: "90days", label: "90 days" },
    { value: "6months", label: "6 months" }, { value: "1year", label: "1 year" },
    { value: "never", label: "No expiry" }, { value: "custom", label: "Choose a date" },
  ];
  return <Dialog open={open} onOpenChange={next => { if (!next && !mutation.isPending) onClose(); }}>
    <DialogContent className="account-action-dialog white-label-access-dialog" showCloseButton={!mutation.isPending}>
      <DialogHeader><DialogTitle>{titles[action]}</DialogTitle><DialogDescription>{action === "disable" ? "Review the effect before disabling access." : "Set how long this reseller can use custom branding."}</DialogDescription></DialogHeader>
      <form className="access-action-form" onSubmit={submit} noValidate>
        <div className="access-action-body">
          <AccountAccessIdentity account={account} />
          <AccountAccessSummary current={<WhiteLabelStateBadge state={currentState} />} next={<WhiteLabelStateBadge state={action === "disable" ? "disabled" : "active"} />} />
          {action === "disable" ? <p className="access-action-notice">This reseller will return to the platform branding. Their saved logo, theme, and subdomain settings will be kept.</p> : <>
            {action === "renew" && <p className="access-action-notice">Access has expired. Choose a new duration to restore custom branding.</p>}
            <Field id="white-label-duration" label="Access duration">
              <FilterSelect id="white-label-duration" label="Access duration" value={duration} onChange={changeDuration} options={options} disabled={mutation.isPending} invalid={Boolean(error && duration !== "custom")} />
            </Field>
            {duration === "custom" && <Field id="custom-wl-expiry" label="Expiry date"><Input id="custom-wl-expiry" type="date" min={dateInputToday()} value={date} disabled={mutation.isPending} aria-invalid={Boolean(error)} onChange={event => { setDate(event.target.value); setError(""); mutation.reset(); }} /></Field>}
            <div className="access-expiry-preview" aria-live="polite"><span>{duration === "keep" ? "Current expiry" : "New expiry"}</span><strong>{preview ? preview.expiresAt ? dateTime(preview.expiresAt) : "No expiry" : "Choose a duration"}</strong></div>
            <p className="access-action-note">Custom branding stays available until access expires or is disabled.</p>
          </>}
          {current.subdomain && <div className="access-subdomain"><span>Configured subdomain</span><strong>{current.subdomain}</strong></div>}
          <FormError message={error || mutation.error?.message} />
        </div>
        <div className="access-action-footer">
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={action === "disable" ? "destructive" : "default"} disabled={mutation.isPending || action === "expiry" && duration === "keep"}>{mutation.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}{mutation.isPending ? "Saving…" : labels[action]}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
