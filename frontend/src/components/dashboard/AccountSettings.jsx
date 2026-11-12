import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getSessions, logoutSession, changePassword, uploadProfileImage, removeProfileImage } from "@/features/auth/services/auth.api";
import { getResellerBranding } from "@/features/branding/branding.api";
import { QueryState, FormError } from "@/features/admin/components/shared";
import { Card } from "@/components/ui/card";
import { UserRound, LockKeyhole, MonitorSmartphone, Laptop, Smartphone, Tablet, RefreshCw, LogOut, Info, ShieldCheck, Eye, EyeOff, Loader2, Trash2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import UserAvatar from "@/components/dashboard/UserAvatar";
import ProfilePhotoUpload from "./ProfilePhotoUpload";
import ResellerBrandingSettings from "@/features/reseller/components/ResellerBrandingSettings";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { dateTime } from "@/features/admin/lib/format";
import { toast } from "@/components/ui/toast";
import "./account-settings.css";
import SupportHelpButton from "@/features/support/components/SupportHelpButton";

function SettingsCard({ title, description, icon: Icon, action, children, section, active }) {
  if (!active) return null;
  return <Card id={`account-${section}`} role="tabpanel" aria-labelledby={`account-tab-${section}`} tabIndex={0} className={`portal-card portal-settings-card account-settings-card account-settings-card-${section}`}>
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
  const queryClient = useQueryClient();
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [disconnect, setDisconnect] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [activeTab, setActiveTab] = useState("profile");
  const [photoUploadVersion, setPhotoUploadVersion] = useState(0);

  const isReseller = user?.role === "Reseller";
  const canManageProfilePhoto = true;
  const resellerBrandingQuery = useQuery({
    queryKey: ["resellerBranding"],
    queryFn: getResellerBranding,
    enabled: isReseller,
  });

  const isWhiteLabelActive = Boolean(
    isReseller &&
      (resellerBrandingQuery.data?.isActive ??
        (user?.whiteLabel?.isActive ||
          (user?.whiteLabel?.enabled &&
            (!user?.whiteLabel?.expiresAt || new Date(user?.whiteLabel?.expiresAt) > new Date()))))
  );

  const visibleTab = activeTab === "branding" && !isWhiteLabelActive ? "profile" : activeTab;

  const sessions = useQuery({ queryKey: ["accountSessions", user?.id || user?._id], queryFn: getSessions, enabled: !user?.isPreview });
  const password = useMutation({ mutationFn: changePassword, onSuccess: () => { setPasswords({ currentPassword: "", newPassword: "", confirmPassword: "" }); toast.add({ title: "Password changed", type: "success" }); } });
  const profileImage = useMutation({
    mutationFn: ({ file, helpers }) => uploadProfileImage(file, helpers),
    onSuccess: (data) => {
      queryClient.setQueryData(["authUser"], (current) => ({ ...current, ...data.user }));
      toast.add({ title: "Profile image updated", type: "success" });
    },
    onError: (uploadError) => {
      if (uploadError.code === "ERR_CANCELED") {
        queryClient.invalidateQueries({ queryKey: ["authUser"] });
        return;
      }
      toast.add({ title: "Profile image upload failed", description: uploadError.message, type: "error" });
    },
  });
  const removePhoto = useMutation({
    mutationFn: removeProfileImage,
    onSuccess: (data) => {
      queryClient.setQueryData(["authUser"], (current) => ({ ...current, ...data.user }));
      setPhotoUploadVersion((version) => version + 1);
      toast.add({ title: "Profile photo removed", type: "success" });
    },
    onError: (removeError) => toast.add({ title: "Couldn't remove photo", description: removeError.message, type: "error" }),
  });
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
  return <div className="account-settings portal-settings">
    <header className="portal-page-heading account-settings-heading">
      <div className="portal-heading-copy"><h1>Settings</h1><p>Manage your account and keep your workspace secure.</p></div>
      <div className="flex flex-wrap items-center gap-2"><SupportHelpButton area={`my ${activeTab} settings`} /><span className="account-settings-role"><UserRound aria-hidden="true" />{user?.role || "Account"} account</span></div>
    </header>
    <div className="account-settings-nav" role="tablist" aria-label="Account settings sections">{[
      ["profile", "Profile", UserRound],
      ["password", "Password", LockKeyhole],
      ["devices", "Devices", MonitorSmartphone],
      ...(isWhiteLabelActive ? [["branding", "Branding", Palette]] : []),
    ].map(([section, label, Icon], index, tabs) => <button key={section} id={`account-tab-${section}`} type="button" role="tab" aria-selected={visibleTab === section} aria-controls={`account-${section}`} tabIndex={visibleTab === section ? 0 : -1} onClick={() => setActiveTab(section)} onKeyDown={event => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      setActiveTab(tabs[next][0]);
      document.getElementById(`account-tab-${tabs[next][0]}`)?.focus();
    }}><Icon aria-hidden="true" />{label}</button>)}</div>
    <div className="account-settings-grid">
      <div className="account-settings-stack">
        <SettingsCard section="profile" active={visibleTab === "profile"} title="Your profile" description="Your photo and account details." icon={UserRound}>
          <div className="account-settings-profile-main">
          <div className="account-settings-identity">
            <UserAvatar user={user} className="size-16 rounded-2xl" />
            <div className="min-w-0 flex-1"><h3>{user?.username || "Your account"}</h3><span>{user?.role || "Account"}</span></div>
          </div>
          {canManageProfilePhoto && <div className="account-settings-profile-image">
            <ProfilePhotoUpload
              key={String(user?.id || user?._id) + ":" + Boolean(user?.isPreview) + ":" + photoUploadVersion}
              disabled={Boolean(user?.isPreview) || removePhoto.isPending}
              onUpload={(file, helpers) => profileImage.mutateAsync({ file, helpers })}
              className="max-w-none"
            />
            {user?.dp_img && <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-destructive hover:text-destructive"
              disabled={user?.isPreview || profileImage.isPending || removePhoto.isPending}
              onClick={() => removePhoto.mutate()}
            >
              {removePhoto.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="size-3.5" aria-hidden="true" />}
              {removePhoto.isPending ? "Removing..." : "Remove photo"}
            </Button>}
            {user?.role === "User" ? (
              <p className="account-settings-note mt-2 text-xs flex items-center gap-1.5">
                {user?.featureAccess?.campaignDp ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                    ✓ Profile DP sharing in campaigns is enabled by admin
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    Profile DP sharing in campaigns: Disabled by admin
                  </span>
                )}
              </p>
            ) : (
              <p className="account-settings-note mt-2 text-xs text-muted-foreground">
                ✓ Profile DP can be shared across campaigns
              </p>
            )}
            {user?.isPreview && <p className="account-settings-note mt-2">Exit account preview to change the profile photo.</p>}
          </div>}
          </div>
          <div className="account-settings-profile-fields">
          <dl className="account-settings-details">{[["Email address", user?.email], ["Account name", user?.username]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "Unavailable"}</dd></div>)}</dl>
          <p className="account-settings-note"><Info aria-hidden="true" /><span>Contact your {user?.role === "User" ? "account manager" : "administrator"} to update these details.</span></p>
          </div>
        </SettingsCard>
        <SettingsCard section="password" active={visibleTab === "password"} title="Change password" description="Keep your account protected with a strong password." icon={LockKeyhole}>
          {user?.isPreview ? <p className="account-settings-note"><Info aria-hidden="true" /><span>Exit account preview to manage your password.</span></p> : <form onSubmit={submit} className="account-settings-password">
            <div className="account-settings-password-fields">
              {[["currentPassword", "Current password"], ["newPassword", "New password"], ["confirmPassword", "Confirm new password"]].map(([key, label]) => <div key={key} className={`portal-field ${key === "currentPassword" ? "account-settings-current-password" : ""}`}>
                <label htmlFor={key}>{label}</label>
                <div className="account-settings-password-input"><Input id={key} type={visiblePasswords[key] ? "text" : "password"} autoComplete={key === "currentPassword" ? "current-password" : "new-password"} minLength={key === "currentPassword" ? undefined : 8} required disabled={password.isPending} aria-describedby={key === "newPassword" ? "new-password-hint" : undefined} value={passwords[key]} onChange={e => { setPasswords(old => ({ ...old, [key]: e.target.value })); setError(""); password.reset(); }} /><button type="button" disabled={password.isPending} aria-label={`${visiblePasswords[key] ? "Hide" : "Show"} ${label.toLowerCase()}`} aria-pressed={Boolean(visiblePasswords[key])} onClick={() => setVisiblePasswords((current) => ({ ...current, [key]: !current[key] }))}>{visiblePasswords[key] ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div>
                {key === "newPassword" && <p id="new-password-hint" className="portal-field-hint">Use at least 8 characters.</p>}
              </div>)}
            </div>
            <FormError message={error || password.error?.message} />
            <div className="account-settings-form-footer"><span><ShieldCheck aria-hidden="true" />Keep your password private.</span><Button type="submit" disabled={password.isPending}>{password.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}{password.isPending ? "Saving…" : "Save password"}</Button></div>
          </form>}
        </SettingsCard>
      </div>
      <SettingsCard section="devices" active={visibleTab === "devices"} title="Signed-in devices" description="See where your account is signed in and manage access." icon={MonitorSmartphone} action={!user?.isPreview && <Button variant="ghost" size="icon-sm" aria-label="Refresh devices" title="Refresh devices" onClick={() => sessions.refetch()} disabled={sessions.isFetching}><RefreshCw aria-hidden="true" className={sessions.isFetching ? "animate-spin motion-reduce:animate-none" : ""} /></Button>}>
        {user?.isPreview ? <p className="account-settings-note"><Info aria-hidden="true" /><span>Exit account preview to manage your devices.</span></p> : <QueryState query={sessions} empty={!rows.length} emptyTitle="No devices found" emptyDescription="Refresh to check your current sessions.">
          <div className="account-settings-session-summary"><span>{rows.length} signed-in {rows.length === 1 ? "device" : "devices"}</span><span>{otherDevices.length ? `${otherDevices.length} other ${otherDevices.length === 1 ? "device" : "devices"}` : "No other devices"}</span></div>
          <ul className="account-settings-devices">{rows.map(session => {
            const current = session.isCurrent || session.isCurrentDevice;
            const { label, Icon } = deviceDetails(session.userAgent);
            return <li key={session.id || session._id} data-current={Boolean(current)}>
              <span className="account-settings-device-icon"><Icon aria-hidden="true" /></span>
              <div className="account-settings-device-copy"><h3>{label}</h3><p>{session.ipAddress || session.ip || "IP unavailable"}</p><p>Signed in {dateTime(session.createdAt)}</p>
                {current ? <span className="account-settings-current-device"><span aria-hidden="true" />This device</span> : <Button size="sm" variant="outline" onClick={() => { revoke.reset(); setDisconnect(session.id || session._id); }}><LogOut aria-hidden="true" />Sign out device</Button>}
              </div>
            </li>;
          })}</ul>
          {otherDevices.length > 0 && <div className="account-settings-devices-footer"><p>Your current device will stay signed in.</p><Button variant="outline" onClick={() => { revoke.reset(); setDisconnect("all"); }}><LogOut aria-hidden="true" />Sign out other devices</Button></div>}
        </QueryState>}
      </SettingsCard>
      {isWhiteLabelActive && (
        <SettingsCard
          section="branding"
          active={visibleTab === "branding"}
          title="Branding & White-Label"
          description="Customize your subdomain, company logo, and theme colors."
          icon={Palette}
        >
          <ResellerBrandingSettings />
        </SettingsCard>
      )}
    </div>
    {disconnect && <Dialog open onOpenChange={open => { if (!open && !revoke.isPending) setDisconnect(null); }}><DialogContent><DialogHeader><DialogTitle>Sign out {disconnect === "all" ? "other devices" : "this device"}?</DialogTitle><DialogDescription>The affected devices will need to sign in again. Your current session stays signed in.</DialogDescription></DialogHeader><FormError message={revoke.error?.message} /><div className="flex justify-end gap-2"><Button variant="outline" disabled={revoke.isPending} onClick={() => setDisconnect(null)}>Cancel</Button><Button variant="destructive" disabled={revoke.isPending} onClick={() => revoke.mutate(disconnect)}>{revoke.isPending ? "Signing out…" : "Sign out devices"}</Button></div></DialogContent></Dialog>}
  </div>;
}
