import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { AlertCircle, Headset, Info, Loader2, ShieldBan } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAuth } from "../hooks/useAuth";
import { supportApi } from "@/features/support/services/support.api.js";
import { accountAccessMessage, accountRestriction } from "../../../../../shared/accountAccess.js";
import "./account-access.css";

export default function AccountAccessBanner() {
  const { user } = useAuth();
  const restriction = accountRestriction(user);
  // Remount when the status changes so messages always match the situation.
  return restriction ? <AccessNotice key={restriction} user={user} restriction={restriction} /> : null;
}

function AccessNotice({ user, restriction }) {
  const [dialog, setDialog] = useState(null);
  const message = accountAccessMessage(user);
  const navigate = useNavigate();
  const client = useQueryClient();
  const blocked = restriction === "blocked";
  const opening = useMutation({
    mutationFn: () => supportApi.getOrCreateConversation(blocked ? "Account blocked" : "Account expired", { accountAccess: true }),
    onSuccess: response => {
      void client.invalidateQueries({ queryKey: ["support", user.id || user._id] });
      setDialog(null);
      const base = user.role === "Super Admin" ? "/admin" : user.role === "Reseller" ? "/reseller" : "/user";
      navigate(`${base}/support?${new URLSearchParams({ conversation: response.data._id })}`, {
        state: { supportDraft: { text: message.trim(), references: [] } },
      });
    },
    onError: error => toast.add({ title: "Could not open support", description: error.message, type: "error" }),
  });
  const expiry = user.expiresAt ? new Date(user.expiresAt) : null;
  const expiryLabel = expiry && Number.isFinite(expiry.getTime())
    ? expiry.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : null;
  const reason = user.accessReason?.trim() || (blocked
    ? "Your administrator has blocked this account. No additional reason was provided. Contact your administrator to request a review."
    : expiryLabel ? `Your account access expired on ${expiryLabel}. Contact your administrator to renew access.`
      : "Your administrator has marked this account as expired. Contact them to renew access.");
  const contactButton = <Button onClick={() => opening.mutate()} disabled={opening.isPending}>{opening.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Headset aria-hidden="true" />}{opening.isPending ? "Opening support…" : "Contact your admin"}</Button>;

  return <>
    <section className="account-access-banner" role="status" aria-label="Account access notice">
      <span className="account-access-banner-icon">{blocked ? <ShieldBan aria-hidden="true" /> : <AlertCircle aria-hidden="true" />}</span>
      <div className="account-access-banner-copy"><strong>Your account is {restriction}</strong><p>You can view your dashboard. Account actions are disabled until your administrator restores access.</p></div>
      <div className="account-access-banner-actions">
        <Button variant="outline" onClick={() => setDialog("reason")}><Info aria-hidden="true" />View reason</Button>
        {contactButton}
      </div>
    </section>
    <Dialog open={Boolean(dialog)} onOpenChange={open => { if (!open && !opening.isPending) setDialog(null); }}>
      <DialogContent className="account-access-dialog sm:max-w-lg" showCloseButton={!opening.isPending}>
        <DialogHeader>
          <span className="account-access-dialog-icon"><Info aria-hidden="true" /></span>
          <DialogTitle>Why your account is {restriction}</DialogTitle>
          <DialogDescription>Your dashboard stays available in read-only mode.</DialogDescription>
        </DialogHeader>
          <div className="account-access-reason">{reason}</div>
          {blocked && expiryLabel && <p className="text-xs text-muted-foreground">Account expiry: {expiryLabel}</p>}
          {contactButton}
      </DialogContent>
    </Dialog>
  </>;
}
