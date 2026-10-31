import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  KeyRound,
  User,
  Mail,
  Smartphone,
  Monitor,
  Tablet,
  Laptop,
  LogOut,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getSessions, logoutSession, logoutAll, changePassword } from "@/features/auth/services/auth.api";
import { dateTime } from "@/features/admin/lib/format";

function parseDeviceDetails(userAgent = "") {
  const ua = (userAgent || "").toLowerCase();
  let browser = "Web Browser";
  let os = "Desktop";
  let type = "desktop";

  if (ua.includes("edg/")) browser = "Microsoft Edge";
  else if (ua.includes("chrome") && !ua.includes("edg/")) browser = "Google Chrome";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Apple Safari";
  else if (ua.includes("firefox")) browser = "Mozilla Firefox";
  else if (ua.includes("opera") || ua.includes("opr/")) browser = "Opera";

  if (ua.includes("windows")) os = "Windows PC";
  else if (ua.includes("macintosh") || ua.includes("mac os")) os = "macOS";
  else if (ua.includes("android")) {
    os = "Android Device";
    type = "mobile";
  } else if (ua.includes("iphone")) {
    os = "Apple iPhone";
    type = "mobile";
  } else if (ua.includes("ipad")) {
    os = "Apple iPad";
    type = "tablet";
  } else if (ua.includes("linux")) os = "Linux PC";

  return { browser, os, type, label: `${browser} on ${os}` };
}

export default function ResellerSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // Live Active Sessions Query
  const sessionsQuery = useQuery({
    queryKey: ["resellerSessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  const disconnectMutation = useMutation({
    mutationFn: logoutSession,
    onSuccess: () => {
      sessionsQuery.refetch();
      toast.add({
        title: "Device Disconnected",
        description: "The selected session has been logged out.",
        type: "success",
      });
    },
    onError: (err) => {
      toast.add({
        title: "Disconnect Failed",
        description: err?.response?.data?.message || "Failed to disconnect session.",
        type: "error",
      });
    },
  });

  const disconnectAllMutation = useMutation({
    mutationFn: logoutAll,
    onSuccess: () => {
      sessionsQuery.refetch();
      toast.add({
        title: "Other Devices Disconnected",
        description: "All other sessions have been logged out.",
        type: "success",
      });
    },
    onError: (err) => {
      toast.add({
        title: "Action Failed",
        description: err?.response?.data?.message || "Failed to disconnect other sessions.",
        type: "error",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError("");
      toast.add({
        title: "Password Updated",
        description: "Your password has been changed successfully.",
        type: "success",
      });
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || "Failed to change password. Please verify current password.";
      setPasswordError(msg);
      toast.add({
        title: "Change Password Failed",
        description: msg,
        type: "error",
      });
    },
  });

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    setPasswordError("");

    if (!currentPassword) {
      setPasswordError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const sessions = sessionsQuery.data?.sessions || [];
  const otherSessionsCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          Account Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your account credentials, security password, and active logged-in devices.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Left Column: ID & Password Changing Section */}
        <div className="space-y-6">
          {/* Account Profile Card */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  <User className="size-4.5" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Account Details</CardTitle>
                  <CardDescription className="text-xs">
                    Your account identification information
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium">Username</span>
                  <p className="text-sm font-semibold text-foreground break-all">
                    {user?.name || user?.username || "Reseller Account"}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium">Role</span>
                  <div>
                    <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                      {user?.role || "Reseller"}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <span className="text-xs text-muted-foreground font-medium">Email Address</span>
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Mail className="size-3.5 text-muted-foreground" />
                  {user?.email || "—"}
                </p>
              </div>

              {user?.id && (
                <div className="space-y-1 pt-1">
                  <span className="text-xs text-muted-foreground font-medium">Account ID</span>
                  <p className="text-xs font-mono text-muted-foreground break-all bg-muted/40 p-2 rounded-md">
                    {user.id || user._id}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Change Password Card */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <KeyRound className="size-4.5" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Change Password</CardTitle>
                  <CardDescription className="text-xs">
                    Update your password to keep your reseller account secure
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                {passwordError && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20">
                    <AlertCircle className="size-4 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="current-password" className="text-xs font-semibold">
                    Current Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="current-password"
                      type={showCurrent ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="pr-10 text-sm"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-xs font-semibold">
                    New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min. 6 characters)"
                      className="pr-10 text-sm"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-xs font-semibold">
                    Confirm New Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirm-password"
                      type={showConfirm ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="pr-10 text-sm"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="submit"
                    disabled={changePasswordMutation.isPending}
                    className="font-semibold"
                  >
                    {changePasswordMutation.isPending && (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    )}
                    Update Password
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Device Logins Section */}
        <div>
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid size-9 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <Laptop className="size-4.5" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">Device Logins</CardTitle>
                    <CardDescription className="text-xs">
                      Devices currently logged in to this account
                    </CardDescription>
                  </div>
                </div>
                {otherSessionsCount > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => disconnectAllMutation.mutate()}
                    disabled={disconnectAllMutation.isPending}
                    className="h-8 text-xs text-destructive hover:bg-destructive/10"
                  >
                    Disconnect Others ({otherSessionsCount})
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-3">
              {sessionsQuery.isLoading ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <RefreshCw className="size-4 animate-spin" />
                  Loading active devices...
                </div>
              ) : sessions.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No active device sessions found.
                </div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((session, index) => {
                    const parsed = parseDeviceDetails(session.userAgent);
                    const DeviceIcon =
                      parsed.type === "mobile"
                        ? Smartphone
                        : parsed.type === "tablet"
                        ? Tablet
                        : Monitor;

                    return (
                      <div
                        key={session.id || session._id || index}
                        className={`flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors ${
                          session.isCurrent
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-card hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`grid size-9 shrink-0 place-items-center rounded-lg border ${
                              session.isCurrent
                                ? "border-primary/20 bg-primary/10 text-primary"
                                : "border-border bg-muted/50 text-muted-foreground"
                            }`}
                          >
                            <DeviceIcon className="size-4.5" />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {parsed.label}
                              </p>
                              {session.isCurrent ? (
                                <Badge className="h-5 px-1.5 text-[10px] bg-primary text-primary-foreground">
                                  Current Device
                                </Badge>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Active
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              IP: {session.ipAddress || "Unknown IP"}
                              {session.createdAt && ` • Logged in ${dateTime(session.createdAt)}`}
                            </p>
                          </div>
                        </div>

                        {!session.isCurrent && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => disconnectMutation.mutate(session.id || session._id)}
                            disabled={disconnectMutation.isPending}
                            className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 shrink-0"
                          >
                            <LogOut className="size-3.5 mr-1" />
                            Disconnect
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

