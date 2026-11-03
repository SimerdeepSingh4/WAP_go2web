import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getSessions, logoutSession, changePassword } from "@/features/auth/services/auth.api";
import { PageHeading, QueryState, Field, FormError } from "@/features/admin/components/shared";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { dateTime } from "@/features/admin/lib/format";
import { toast } from "@/components/ui/toast";

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
  return <>
    <PageHeading title="Settings" description="Your account, password and signed-in devices." />
    <div className="dashboard-two-column">
      <div className="dashboard-section">
        <Card><CardHeader><CardTitle>Account</CardTitle></CardHeader><CardContent><dl className="dashboard-details">{[["Name", user?.username], ["Email", user?.email], ["Role", user?.role]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Unavailable"}</dd></div>)}</dl><p className="mt-4 text-sm text-muted-foreground">Contact your administrator to change account details.</p></CardContent></Card>
        <Card><CardHeader><CardTitle>Change password</CardTitle></CardHeader><CardContent>
          {user?.isPreview ? <p className="dashboard-note">Exit account preview to manage your password.</p> : <form onSubmit={submit} className="space-y-4">
            {[["currentPassword", "Current password"], ["newPassword", "New password"], ["confirmPassword", "Confirm new password"]].map(([key, label]) => <Field key={key} id={key} label={label} hint={key === "newPassword" ? "Use at least 8 characters." : undefined}><Input id={key} type="password" autoComplete={key === "currentPassword" ? "current-password" : "new-password"} minLength={key === "currentPassword" ? undefined : 8} required value={passwords[key]} onChange={e => { setPasswords(old => ({ ...old, [key]: e.target.value })); setError(""); password.reset(); }} /></Field>)}
            <FormError message={error || password.error?.message} /><Button type="submit" disabled={password.isPending}>{password.isPending ? "Saving…" : "Save password"}</Button>
          </form>}
        </CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Signed-in devices</CardTitle></CardHeader><CardContent className="space-y-4">
        {user?.isPreview ? <p className="dashboard-note">Exit account preview to manage your devices.</p> : <QueryState query={sessions} empty={!rows.length} emptyTitle="No devices found" emptyDescription="Refresh to check your current sessions.">
          <ul className="space-y-4">{rows.map(session => {
            const current = session.isCurrent || session.isCurrentDevice;
            return <li key={session.id || session._id} className="border-b pb-4 space-y-2"><p className="text-sm break-words">{session.userAgent || "Unknown device"}</p><p className="text-xs text-muted-foreground break-words">{session.ipAddress || session.ip || "IP unavailable"} · {dateTime(session.createdAt)}</p>{current ? <span className="text-sm font-medium text-primary">This device</span> : <Button size="sm" variant="outline" onClick={() => { revoke.reset(); setDisconnect(session.id || session._id); }}>Sign out device</Button>}</li>;
          })}</ul>
          {rows.some(s => !(s.isCurrent || s.isCurrentDevice)) && <Button variant="outline" onClick={() => { revoke.reset(); setDisconnect("all"); }}>Sign out other devices</Button>}
        </QueryState>}
        {!user?.isPreview && <Button variant="ghost" onClick={() => sessions.refetch()} disabled={sessions.isFetching}>Refresh devices</Button>}
      </CardContent></Card>
    </div>
    {disconnect && <Dialog open onOpenChange={open => { if (!open && !revoke.isPending) setDisconnect(null); }}><DialogContent><DialogHeader><DialogTitle>Sign out {disconnect === "all" ? "other devices" : "this device"}?</DialogTitle><DialogDescription>The affected devices will need to sign in again. Your current session stays signed in.</DialogDescription></DialogHeader><FormError message={revoke.error?.message} /><div className="flex justify-end gap-2"><Button variant="outline" disabled={revoke.isPending} onClick={() => setDisconnect(null)}>Cancel</Button><Button variant="destructive" disabled={revoke.isPending} onClick={() => revoke.mutate(disconnect)}>{revoke.isPending ? "Signing out…" : "Sign out devices"}</Button></div></DialogContent></Dialog>}
  </>;
}
