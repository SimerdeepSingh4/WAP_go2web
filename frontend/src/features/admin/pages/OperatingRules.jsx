import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Laptop,
  Smartphone,
  Tablet,
  Clock,
  Sliders,
  RotateCcw,
  Save,
  Coins,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  ShieldAlert,
  RefreshCw,
  MonitorSmartphone,
  Globe,
  ShieldCheck
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { PageHeading } from "../components/shared";
import OperatingTimePicker from "../components/OperatingTimePicker";
import { validateOperatingWindow } from "../lib/operatingTime";
import { getSessions, logoutSession, logoutAll } from "@/features/auth/services/auth.api";
import { dateTime } from "../lib/format";

function parseDeviceDetails(userAgent = "") {
  const ua = userAgent.toLowerCase();
  let browser = "Web Browser";
  let os = "Desktop";
  let type = "desktop";

  // Browser detection
  if (ua.includes("edg/")) browser = "Microsoft Edge";
  else if (ua.includes("chrome") && !ua.includes("edg/")) browser = "Google Chrome";
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Apple Safari";
  else if (ua.includes("firefox")) browser = "Mozilla Firefox";
  else if (ua.includes("opera") || ua.includes("opr/")) browser = "Opera";

  // Operating System & Device category
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

const DEFAULT_SETTINGS = {
  // Campaign & Hours
  dailyCampaignLimit: 10,
  maxRecipientsPerCampaign: 50000,
  startTime: "09:00",
  endTime: "19:00",
  outOfWindowBehavior: "queue", // 'queue' | 'reject'

  // Device Management
  maxAllowedDevices: 3,
  deviceEvictionStrategy: "fifo", // 'fifo' (log out oldest) | 'block' (block new login)

  // Credits & Rates
  defaultRatePerMsg: 1.0,
  lowBalanceThreshold: 500,
  creditExpiryYears: "2",
  autoRefundEnabled: true,
  strictOverdraftProtection: true,
};

export default function OperatingRules() {
  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("admin_platform_settings");
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [activeTab, setActiveTab] = useState("campaigns");
  const [resetKey, setResetKey] = useState(0);

  // Live Active Sessions Query
  const sessionsQuery = useQuery({
    queryKey: ["activeSessions"],
    queryFn: getSessions,
    refetchInterval: 5000,
  });

  const disconnectMutation = useMutation({
    mutationFn: logoutSession,
    onSuccess: () => {
      sessionsQuery.refetch();
      toast.add({
        title: "Device Disconnected",
        description: "The selected device session has been terminated.",
        type: "success",
      });
    },
    onError: (err) => {
      toast.add({
        title: "Failed to Disconnect Device",
        description: err.response?.data?.message || err.message,
        type: "error",
      });
    },
  });

  const logoutAllMutation = useMutation({
    mutationFn: logoutAll,
    onSuccess: () => {
      sessionsQuery.refetch();
      toast.add({
        title: "All Devices Logged Out",
        description: "All remote sessions have been terminated.",
        type: "success",
      });
    },
    onError: (err) => {
      toast.add({
        title: "Failed to Log Out Devices",
        description: err.response?.data?.message || err.message,
        type: "error",
      });
    },
  });

  const activeSessions = sessionsQuery.data?.sessions || [];
  const activeCount = sessionsQuery.data?.activeCount || activeSessions.length;

  const error = validateOperatingWindow(settings.startTime, settings.endTime);

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (error) {
      toast.add({
        title: "Check Sending Hours",
        description: error,
        type: "error",
      });
      return;
    }
    localStorage.setItem("admin_platform_settings", JSON.stringify(settings));
    toast.add({
      title: "Settings Saved",
      description: "Platform limits and preferences have been updated.",
      type: "success",
    });
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setResetKey((prev) => prev + 1);
    localStorage.removeItem("admin_platform_settings");
    toast.add({
      title: "Settings Reset to Defaults",
      type: "info",
    });
  };

  const tabs = [
    { id: "campaigns", label: "Campaigns & Hours", icon: Clock },
    { id: "devices", label: "Device Logins", icon: Smartphone },
    { id: "billing", label: "Credits & Rates", icon: Coins },
  ];

  return (
    <>
      <PageHeading
        title="Settings"
        description="Set daily campaign allowances, working hours, allowed devices, and default credit rates."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 text-xs">
              <RotateCcw className="size-3.5" />
              Reset Defaults
            </Button>
            <Button size="sm" onClick={handleSave} className="gap-1.5 text-xs">
              <Save className="size-3.5" />
              Save Settings
            </Button>
          </div>
        }
      />

      {/* Navigation Tabs Bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b pb-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: CAMPAIGN LIMITS & WORKING HOURS */}
      {activeTab === "campaigns" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Sliders className="size-4.5 text-primary" />
                <CardTitle className="text-base">Campaign Limits</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Control campaign volume to protect messaging numbers and manage server capacity.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="space-y-2">
                <Label htmlFor="daily-limit" className="text-xs font-semibold">
                  Daily Campaigns per Account
                </Label>
                <Input
                  id="daily-limit"
                  type="number"
                  min="1"
                  max="500"
                  value={settings.dailyCampaignLimit}
                  onChange={(e) => updateSetting("dailyCampaignLimit", Number(e.target.value) || 1)}
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Maximum campaigns a single user or reseller can create per calendar day.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-recipients" className="text-xs font-semibold">
                  Maximum Contacts per Campaign
                </Label>
                <Input
                  id="max-recipients"
                  type="number"
                  step="1000"
                  min="100"
                  value={settings.maxRecipientsPerCampaign}
                  onChange={(e) => updateSetting("maxRecipientsPerCampaign", Number(e.target.value) || 1000)}
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Maximum phone numbers allowed in one uploaded contact list.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3.5 space-y-1">
                <p className="text-xs font-semibold text-foreground">Rule Summary</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Accounts are capped at <strong>{settings.dailyCampaignLimit} campaigns/day</strong> with up to{" "}
                  <strong>{Number(settings.maxRecipientsPerCampaign).toLocaleString()} recipients</strong> each.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Clock className="size-4.5 text-primary" />
                <CardTitle className="text-base">Sending Window (Working Hours)</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose the hours of the day when campaigns can be sent out to recipients.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div key={resetKey} className="grid gap-4 sm:grid-cols-2">
                <OperatingTimePicker
                  id="start-time"
                  label="Start Time"
                  value={settings.startTime}
                  onChange={(value) => updateSetting("startTime", value)}
                  invalid={Boolean(error)}
                />
                <OperatingTimePicker
                  id="end-time"
                  label="End Time"
                  value={settings.endTime}
                  onChange={(value) => updateSetting("endTime", value)}
                  invalid={Boolean(error)}
                />
              </div>

              {error && (
                <p role="alert" className="text-xs font-medium text-destructive">
                  {error}
                </p>
              )}

              <div className="border-t pt-4 space-y-3">
                <Label className="text-xs font-semibold">What to do outside working hours?</Label>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updateSetting("outOfWindowBehavior", "queue")}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                      settings.outOfWindowBehavior === "queue"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <CheckCircle2
                      className={`size-4 mt-0.5 shrink-0 ${
                        settings.outOfWindowBehavior === "queue" ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <div>
                      <p className="text-xs font-semibold text-foreground">Hold in Pending (Recommended)</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Campaign is saved and held until the next morning window opens.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSetting("outOfWindowBehavior", "reject")}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer ${
                      settings.outOfWindowBehavior === "reject"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <AlertTriangle
                      className={`size-4 mt-0.5 shrink-0 ${
                        settings.outOfWindowBehavior === "reject" ? "text-amber-600" : "text-muted-foreground"
                      }`}
                    />
                    <div>
                      <p className="text-xs font-semibold text-foreground">Do Not Allow</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Show a message asking users to submit during working hours.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: DEVICE HANDLING */}
      {activeTab === "devices" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Laptop className="size-4.5 text-primary" />
                <CardTitle className="text-base">Allowed Devices per Account</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Limit how many phones or computers can be signed into the same account at the same time.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="device-limit" className="text-xs font-semibold">
                    Maximum Devices Allowed
                  </Label>
                  <span className="text-xs font-bold text-primary tabular-nums">
                    {settings.maxAllowedDevices} {settings.maxAllowedDevices === 1 ? "Device" : "Devices"}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {[1, 2, 3, 4, 5].map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => updateSetting("maxAllowedDevices", count)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition-all ${
                        settings.maxAllowedDevices === count
                          ? "border-primary bg-primary text-primary-foreground shadow-xs"
                          : "border-border bg-card text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {count} {count === 1 ? "Device" : "Devices"}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Standard setting is 2 or 3 devices (for example: work computer and personal phone).
                </p>
              </div>

              <div className="border-t pt-4 space-y-3">
                <Label className="text-xs font-semibold">When device limit is reached:</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updateSetting("deviceEvictionStrategy", "fifo")}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      settings.deviceEvictionStrategy === "fifo"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <CheckCircle2
                      className={`size-4 mt-0.5 shrink-0 ${
                        settings.deviceEvictionStrategy === "fifo" ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <div>
                      <p className="text-xs font-semibold text-foreground">Log out oldest device (Recommended)</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        New device logs in smoothly and the oldest device is signed out.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSetting("deviceEvictionStrategy", "block")}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      settings.deviceEvictionStrategy === "block"
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <AlertTriangle
                      className={`size-4 mt-0.5 shrink-0 ${
                        settings.deviceEvictionStrategy === "block" ? "text-amber-600" : "text-muted-foreground"
                      }`}
                    />
                    <div>
                      <p className="text-xs font-semibold text-foreground">Block new login</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Ask the user to first log out from an existing device before signing in.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="border-t pt-4 space-y-2">
                <Label className="text-xs font-semibold">Security Action</Label>
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border bg-muted/20">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">Log Out All Accounts</p>
                    <p className="text-[11px] text-muted-foreground">
                      Force all other devices and accounts to sign in again with their password.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={logoutAllMutation.isPending}
                    className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30 gap-1.5"
                    onClick={() => logoutAllMutation.mutate()}
                  >
                    <LogOut className="size-3.5" />
                    {logoutAllMutation.isPending ? "Logging out..." : "Log Out Everyone"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Currently Logged-in Devices Card */}
          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MonitorSmartphone className="size-4.5 text-primary" />
                  <CardTitle className="text-base">
                    Currently Logged-in Devices ({activeCount})
                  </CardTitle>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => sessionsQuery.refetch()}
                  disabled={sessionsQuery.isFetching}
                  className="gap-1.5 text-xs h-8"
                >
                  <RefreshCw className={`size-3.5 ${sessionsQuery.isFetching ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Review all computers, phones, and browsers currently signed in.
              </p>
            </CardHeader>
            <CardContent className="pt-5 space-y-3">
              {sessionsQuery.isLoading ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <RefreshCw className="size-4 animate-spin mx-auto mb-2 text-primary" />
                  Loading active devices...
                </div>
              ) : activeSessions.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No active device sessions found.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {activeSessions.map((session, index) => {
                    const parsed = parseDeviceDetails(session.userAgent);
                    const DeviceIcon =
                      parsed.type === "mobile"
                        ? Smartphone
                        : parsed.type === "tablet"
                        ? Tablet
                        : Laptop;

                    return (
                      <div
                        key={session.id || index}
                        className={`flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg border transition-all ${
                          session.isCurrentDevice
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-card hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`grid size-9 shrink-0 place-items-center rounded-lg border ${
                              session.isCurrentDevice
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : "border-border bg-muted/50 text-muted-foreground"
                            }`}
                          >
                            <DeviceIcon className="size-4.5" />
                          </div>

                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-foreground truncate">
                                {parsed.label}
                              </span>
                              {session.isCurrentDevice && (
                                <span className="rounded-full bg-primary px-2 py-0.2 text-[10px] font-semibold text-primary-foreground">
                                  This Device
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                Active
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              <span>
                                IP: <strong className="text-foreground/80 font-mono">{session.ip || "127.0.0.1"}</strong>
                              </span>
                              <span>•</span>
                              <span>Signed in: {dateTime(session.createdAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-auto">
                          {session.isCurrentDevice ? (
                            <span className="text-[11px] font-medium text-muted-foreground px-2 py-1 rounded bg-muted/50">
                              Current Session
                            </span>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={disconnectMutation.isPending}
                              onClick={() => disconnectMutation.mutate(session.id)}
                              className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200 h-8"
                            >
                              Disconnect
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: CREDITS & RATES */}
      {activeTab === "billing" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Coins className="size-4.5 text-primary" />
                <CardTitle className="text-base">Default Rates & Balance Limits</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set standard pricing and balance thresholds for all accounts.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="space-y-2">
                <Label htmlFor="default-rate" className="text-xs font-semibold">
                  Default Rate (Credits per Message)
                </Label>
                <Input
                  id="default-rate"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={settings.defaultRatePerMsg}
                  onChange={(e) => updateSetting("defaultRatePerMsg", Number(e.target.value) || 1)}
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  New accounts will automatically be set to this rate (you can still customize rates per account in Accounts).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="low-balance" className="text-xs font-semibold">
                  Low Balance Warning Level
                </Label>
                <Input
                  id="low-balance"
                  type="number"
                  min="0"
                  value={settings.lowBalanceThreshold}
                  onChange={(e) => updateSetting("lowBalanceThreshold", Number(e.target.value) || 0)}
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Show a visual warning when an account has fewer than this many credits left.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="credit-expiry" className="text-xs font-semibold">
                  Default Credit Expiry Period
                </Label>
                <select
                  id="credit-expiry"
                  value={settings.creditExpiryYears}
                  onChange={(e) => updateSetting("creditExpiryYears", e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs font-medium shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="2">2 Years (Standard default)</option>
                  <option value="1">1 Year</option>
                  <option value="3">3 Years</option>
                  <option value="5">5 Years</option>
                  <option value="0.5">6 Months</option>
                  <option value="0">Never (No Expiry)</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  Credits bought or allocated expire after this time. After expiry, balance remains visible but turns red and locked from being used.
                </p>
              </div>

              <div className="rounded-lg border bg-muted/20 p-3.5 space-y-1">
                <p className="text-xs font-semibold text-foreground">Pricing Example</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  At <strong>{settings.defaultRatePerMsg} credits/msg</strong>, an audience of{" "}
                  <strong>10,000 recipients</strong> will cost{" "}
                  <strong>{(10000 * (Number(settings.defaultRatePerMsg) || 1)).toLocaleString()} credits</strong>.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4.5 text-primary" />
                <CardTitle className="text-base">Safety & Automation Rules</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Protect balances and prevent unexpected credit overdrafts.
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              <div className="flex items-start justify-between gap-4 p-3.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">Auto-Refund Failed Messages</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Automatically return credits back to the user or reseller if a phone number is invalid or delivery fails.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoRefundEnabled}
                  onChange={(e) => updateSetting("autoRefundEnabled", e.target.checked)}
                  className="size-4.5 accent-primary rounded cursor-pointer mt-0.5 shrink-0"
                />
              </div>

              <div className="flex items-start justify-between gap-4 p-3.5 rounded-lg border bg-card hover:bg-muted/30 transition-colors">
                <div className="space-y-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground">Stop Sending on Zero Balance</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Do not allow launching or processing new campaigns if the account does not have sufficient credit balance.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.strictOverdraftProtection}
                  onChange={(e) => updateSetting("strictOverdraftProtection", e.target.checked)}
                  className="size-4.5 accent-primary rounded cursor-pointer mt-0.5 shrink-0"
                />
              </div>

              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <CheckCircle2 className="size-3.5" />
                  <span>Active Balance Protection</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {settings.strictOverdraftProtection
                    ? "Negative balances are strictly prevented across all users and resellers."
                    : "Overdraft is allowed in grace mode; accounts can run campaigns even if balance drops to zero."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
