import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getSessions, logoutSession, changePassword } from "@/features/auth/services/auth.api";
import { QueryState, FormError } from "@/features/admin/components/shared";
import { Card } from "@/components/ui/card";
import { UserRound, LockKeyhole, MonitorSmartphone, Laptop, Smartphone, Tablet, RefreshCw, LogOut, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { dateTime } from "@/features/admin/lib/format";
import { toast } from "@/components/ui/toast";
import "./account-settings.css";

function SettingsCard({ title, description, icon: Icon, action, children }) {
  return <Card className="portal-card portal-settings-card account-settings-card">
    <div className="portal-card-heading">
      <span className="portal-settings-card-icon"><Icon aria-hidden="true" /></span>
      <div><h2>{title}</h2><p>{description}</p></div>
      {action}
    </div>
    <div className="portal-settings-card-body">{children}</div>
  </Card>;
}

function deviceDetails(userAgent = "") {
  const ua = userAgent.toLowerCase();
  const browser = /edg(e|a|ios)?\//.test(ua) ? "Microsoft Edge" : /opr\/|opera/.test(ua) ? "Opera" : /firefox|fxios/.test(ua) ? "Firefox" : /chrome|crios/.test(ua) ? "Google Chrome" : /safari/.test(ua) ? "Safari" : "Web browser";
  const os = /ipad/.test(ua) ? "iPad" : /iphone|ipod/.test(ua) ? "iPhone" : /android/.test(ua) ? "Android" : /windows/.test(ua) ? "Windows" : /macintosh|mac os/.test(ua) ? "macOS" : /linux/.test(ua) ? "Linux" : null;
  const Icon = /ipad|android(?!.*mobile)/.test(ua) ? Tablet : /iphone|ipod|mobile/.test(ua) ? Smartphone : Laptop;
  return { label: os ? `${browser} on ${os}` : browser, Icon };
}

export default function AccountSettings() {
  const { user } = useAuth();
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [disconnect, setDisconnect] = useState(null);
  const sessions = useQuery({ queryKey: ["accountSessions", user?.id || user?._id], queryFn: getSessions, enabled: !user?.isPreview });
  const password = useMutation({ mutationFn: changePassword, onSuccess: () => { setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" }); toast.add({ title: "Password changed", type: "success" }); } });
  const revoke = useMutation({
    mutationFn: async target => {
      const targets = target === "all" ? (sessions.data?.sessions || []).filter(s => !(s.isCurrent || s.isCurrentDevice)).map(s => s.id || s._id) : [target];
      const results = await Promise.allSettled(targets.map(logoutSession));
      await sessions.refetch();
      const failed = results.filter(r => r.status === "rejected").length;
      if (failed) throw new Error(`${targets.length - failed} devices signed out; ${failed} could not be signed out. Retry the remaining devices.`);
    },
    onSuccess: () => { setDisconnect(null); toast.add({ title: "Devices signed out", type: "success" }); },
  });
  function submit(event) {
    event.preventDefault();
    if (password.isPending || user?.isPreview) return;
    setError("");
    if (passwords.newPassword !== passwords.confirmPassword) { setError("The new passwords do not match."); return; }
    password.mutate({ currentPassword: passwords.currentPassword, newPassword: passwords.newPassword });
  }
  const rows = sessions.data?.sessions || [];
  const otherDevices = rows.filter(session => !(session.isCurrent || session.isCurrentDevice));
  const initials = (user?.username || "Account").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  return <div className="account-settings portal-settings">
    <header className="portal-page-heading">
      <div className="portal-heading-copy"><h1>Settings</h1><p>Manage your account and keep your workspace secure.</p></div>
      <span className="account-settings-role"><UserRound aria-hidden="true" />{user?.role || "Account"} account</span>
    </header>
    <div className="account-settings-grid">
      <div className="account-settings-stack">
        <SettingsCard title="Account profile" description="Your personal details and account information." icon={UserRound}>
          <div className="account-settings-identity">
            <span className="account-settings-avatar" aria-hidden="true">{initials}</span>
            <div><h3>{user?.username || "Your account"}</h3><span>{user?.role || "Account"}</span></div>
          </div>
          <dl className="account-settings-details">{[["Email address", user?.email], ["Account name", user?.username]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Unavailable"}</dd></div>)}</dl>
          <p className="account-settings-note"><Info aria-hidden="true" /><span>Contact your {user?.role === "User" ? "account manager" : "administrator"} to update these details.</span></p>
        </SettingsCard>
        <SettingsCard title="Change password" description="Choose a strong password to protect your account." icon={LockKeyhole}>
          {user?.isPreview ? <p className="account-settings-note"><Info aria-hidden="true" /><span>Exit account preview to manage your password.</span></p> : <form onSubmit={submit} className="account-settings-password">
            <div className="account-settings-password-fields">
              {[["currentPassword", "Current password"], ["newPassword", "New password"], ["confirmPassword", "Confirm new password"]].map(([key, label]) => <div key={key} className={`portal-field ${key === "currentPassword" ? "account-settings-current-password" : ""}`}>
                <label htmlFor={key}>{label}</label>
                <Input id={key} type="password" autoComplete={key === "currentPassword" ? "current-password" : "new-password"} minLength={key === "currentPassword" ? undefined : 8} required disabled={password.isPending} aria-describedby={key === "newPassword" ? "new-password-hint" : undefined} value={passwords[key]} onChange={e => { setPasswords(old => ({ ...old, [key]: e.target.value })); setError(""); password.reset(); }} />
                {key === "newPassword" && <p id="new-password-hint" className="portal-field-hint">Use at least 8 characters.</p>}
              </div>)}
            </div>
            <FormError message={error || password.error?.message} />
            <div className="account-settings-form-footer"><span><ShieldCheck aria-hidden="true" />Keep your password private.</span><Button type="submit" disabled={password.isPending}>{password.isPending ? "Saving…" : "Save password"}</Button></div>
          </form>}
        </SettingsCard>
      </div>
      <SettingsCard title="Signed-in devices" description="Review and manage access to your account." icon={MonitorSmartphone} action={!user?.isPreview && <Button variant="ghost" size="icon-sm" aria-label="Refresh devices" title="Refresh devices" onClick={() => sessions.refetch()} disabled={sessions.isFetching}><RefreshCw aria-hidden="true" className={sessions.isFetching ? "animate-spin motion-reduce:animate-none" : ""} /></Button>}>
        {user?.isPreview ? <p className="account-settings-note"><Info aria-hidden="true" /><span>Exit account preview to manage your devices.</span></p> : <QueryState query={sessions} empty={!rows.length} emptyTitle="No devices found" emptyDescription="Refresh to check your current sessions.">
          <div className="account-settings-session-summary"><span>{rows.length} signed-in {rows.length === 1 ? "device" : "devices"}</span><span>Sessions</span></div>
          <ul className="account-settings-devices">{rows.map(session => {
            const current = session.isCurrent || session.isCurrentDevice;
            const { label, Icon } = deviceDetails(session.userAgent);
            return <li key={session.id || session._id}>
              <span className="account-settings-device-icon"><Icon aria-hidden="true" /></span>
              <div className="account-settings-device-copy"><h3>{label}</h3><p>{session.ipAddress || session.ip || "IP unavailable"}</p><p>Signed in {dateTime(session.createdAt)}</p>
                {current ? <span className="account-settings-current-device"><span aria-hidden="true" />This device</span> : <Button size="sm" variant="outline" onClick={() => { revoke.reset(); setDisconnect(session.id || session._id); }}><LogOut aria-hidden="true" />Sign out device</Button>}
              </div>
            </li>;
          })}</ul>
          {otherDevices.length > 0 && <div className="account-settings-devices-footer"><p>Your current device will stay signed in.</p><Button variant="outline" onClick={() => { revoke.reset(); setDisconnect("all"); }}><LogOut aria-hidden="true" />Sign out other devices</Button></div>}
        </QueryState>}
      </SettingsCard>
    </div>
    {disconnect && <Dialog open onOpenChange={open => { if (!open && !revoke.isPending) setDisconnect(null); }}><DialogContent><DialogHeader><DialogTitle>Sign out {disconnect === "all" ? "other devices" : "this device"}?</DialogTitle><DialogDescription>The affected devices will need to sign in again. Your current session stays signed in.</DialogDescription></DialogHeader><FormError message={revoke.error?.message} /><div className="flex justify-end gap-2"><Button variant="outline" disabled={revoke.isPending} onClick={() => setDisconnect(null)}>Cancel</Button><Button variant="destructive" disabled={revoke.isPending} onClick={() => revoke.mutate(disconnect)}>{revoke.isPending ? "Signing out…" : "Sign out devices"}</Button></div></DialogContent></Dialog>}
  </div>;
}
