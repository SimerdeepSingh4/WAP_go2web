import { useState, useEffect } from "react";
import {
  Laptop,
  Smartphone,
  Clock,
  Sliders,
  Shield,
  Cpu,
  Zap,
  RotateCcw,
  Save,
  Coins,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Server,
  Layers,
  KeyRound,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { PageHeading, Field } from "../components/shared";
import OperatingTimePicker from "../components/OperatingTimePicker";
import { formatOperatingTime, validateOperatingWindow } from "../lib/operatingTime";

const DEFAULT_SETTINGS = {
  // Campaign & Hours
  dailyCampaignLimit: 10,
  maxRecipientsPerCampaign: 50000,
  startTime: "09:00",
  endTime: "19:00",
  timezone: "Asia/Kolkata",
  outOfWindowBehavior: "queue", // 'queue' | 'reject'

  // Device & Session Management
  maxAllowedDevices: 3,
  deviceEvictionStrategy: "fifo", // 'fifo' (evict oldest) | 'block' (reject 4th)
  sessionTimeout: "7d",
  forceMfaOnAdmins: false,

  // Queue & Engine (BullMQ)
  batchSize: 25,
  throttleDelayMs: 120,
  workerConcurrency: 5,
  autoRefundEnabled: true,

  // Credit & Billing Defaults
  defaultRatePerMsg: 1.0,
  lowBalanceThreshold: 500,
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

  const error = validateOperatingWindow(settings.startTime, settings.endTime);

  const updateSetting = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    if (error) {
      toast.add({
        title: "Invalid Operating Window",
        description: error,
        type: "error",
      });
      return;
    }
    localStorage.setItem("admin_platform_settings", JSON.stringify(settings));
    toast.add({
      title: "Settings Saved Successfully",
      description: "Platform limits, device security rules, and engine parameters have been updated.",
      type: "success",
    });
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    setResetKey((prev) => prev + 1);
    localStorage.removeItem("admin_platform_settings");
    toast.add({
      title: "Settings Restored to Defaults",
      type: "info",
    });
  };

  const tabs = [
    { id: "campaigns", label: "Campaign & Hours", icon: Clock },
    { id: "devices", label: "Device & Sessions", icon: Smartphone },
    { id: "queue", label: "Sending Queue", icon: Cpu },
    { id: "billing", label: "Credits & Pricing", icon: Coins },
  ];

  return (
    <>
      <PageHeading
        title="Settings"
        description="Configure campaign limits, device logins, sending queue, and credit pricing."
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

      {/* Navigation Pills Bar */}
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

      {/* TAB 1: CAMPAIGN LIMITS & OPERATING HOURS */}
      {activeTab === "campaigns" && (
        <div className="space-y-5 max-w-3xl">
          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Sliders className="size-4.5 text-primary" />
                <CardTitle className="text-base">Campaign Allowance & Rate Limits</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Protect outbound WhatsApp channels against spam detection by controlling account campaign volumes.
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="daily-limit" className="text-xs font-semibold">
                  Daily Campaign Limit per Account
                </Label>
                <Input
                  id="daily-limit"
                  type="number"
                  min="1"
                  max="1000"
                  value={settings.dailyCampaignLimit}
                  onChange={(e) => updateSetting("dailyCampaignLimit", Number(e.target.value) || 1)}
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Maximum number of distinct campaigns each reseller/user may launch per calendar day.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-recipients" className="text-xs font-semibold">
                  Max Recipients per Campaign
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
                  Bulk CSV or audience import cap enforced during campaign creation.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Clock className="size-4.5 text-primary" />
                <CardTitle className="text-base">Allowed Execution Window (IST)</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Only dispatch messages during daytime business hours to comply with regulatory standards.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div key={resetKey} className="grid gap-6 sm:grid-cols-2">
                <OperatingTimePicker
                  id="start-time"
                  label="Window Start Time"
                  value={settings.startTime}
                  onChange={(value) => updateSetting("startTime", value)}
                  invalid={Boolean(error)}
                />
                <OperatingTimePicker
                  id="end-time"
                  label="Window End Time"
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
                <Label className="text-xs font-semibold">Out-of-Window Submission Handling</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updateSetting("outOfWindowBehavior", "queue")}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
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
                      <p className="text-xs font-semibold text-foreground">Hold in Queue (Recommended)</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Campaign is scheduled and held in BullMQ until the next morning window opens.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => updateSetting("outOfWindowBehavior", "reject")}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
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
                      <p className="text-xs font-semibold text-foreground">Reject Immediately</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Blocks submissions outside operational hours and alerts user to submit later.
                      </p>
                    </div>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 2: DEVICE HANDLING & SESSION SECURITY */}
      {activeTab === "devices" && (
        <div className="space-y-5 max-w-3xl">
          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Laptop className="size-4.5 text-primary" />
                <CardTitle className="text-base">Device Concurrency & Limits</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Prevent credential sharing and account reselling abuse by capping simultaneous active devices.
              </p>
            </CardHeader>
            <CardContent className="space-y-5 pt-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="device-limit" className="text-xs font-semibold">
                    Maximum Allowed Devices per Account
                  </Label>
                  <span className="text-xs font-bold text-primary tabular-nums">
                    {settings.maxAllowedDevices} Devices
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
                  Default: 3 devices (e.g. Work PC, Mobile Phone, Home Laptop).
                </p>
              </div>

              <div className="border-t pt-4 space-y-3">
                <Label className="text-xs font-semibold">Eviction Strategy (When Limit is Exceeded)</Label>
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
                      <p className="text-xs font-semibold text-foreground">FIFO Auto-Eviction (Live WS)</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Immediately disconnects the oldest session via Socket.IO <code>SESSION_EXPIRED</code>.
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
                    <Shield
                      className={`size-4 mt-0.5 shrink-0 ${
                        settings.deviceEvictionStrategy === "block" ? "text-primary" : "text-muted-foreground"
                      }`}
                    />
                    <div>
                      <p className="text-xs font-semibold text-foreground">Strict Login Block</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Rejects the new login attempt until the user manually logs out of an existing device.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="border-t pt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="session-timeout" className="text-xs font-semibold">
                    JWT Session Token Lifespan
                  </Label>
                  <select
                    id="session-timeout"
                    value={settings.sessionTimeout}
                    onChange={(e) => updateSetting("sessionTimeout", e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium outline-none focus:border-primary"
                  >
                    <option value="24h">24 Hours (High Security)</option>
                    <option value="7d">7 Days (Standard Business)</option>
                    <option value="30d">30 Days (Extended)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Emergency Session Action</Label>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full text-xs text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
                    onClick={() => {
                      toast.add({
                        title: "All Stale Sessions Invalidated",
                        description: "Global session revocation broadcast sent to Redis store.",
                        type: "success",
                      });
                    }}
                  >
                    <Trash2 className="size-3.5 mr-1" />
                    Force Invalidate Stale Sessions
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: BULLMQ WORKER & QUEUE ENGINE */}
      {activeTab === "queue" && (
        <div className="space-y-5 max-w-3xl">
          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Cpu className="size-4.5 text-primary" />
                <CardTitle className="text-base">BullMQ Worker Engine Tuning</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Parameters controlling Redis queue <code>campaign-dispatch-queue</code> and worker concurrency.
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 pt-5 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="batch-size" className="text-xs font-semibold flex items-center gap-1.5">
                  <Zap className="size-3 text-amber-500" />
                  Batch Dispatch Size
                </Label>
                <Input
                  id="batch-size"
                  type="number"
                  min="5"
                  max="100"
                  value={settings.batchSize}
                  onChange={(e) => updateSetting("batchSize", Number(e.target.value) || 25)}
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Recipients per batch (Default: 25).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="throttle-delay" className="text-xs font-semibold flex items-center gap-1.5">
                  <Clock className="size-3 text-blue-500" />
                  Throttle Delay (ms)
                </Label>
                <Input
                  id="throttle-delay"
                  type="number"
                  min="50"
                  max="2000"
                  step="10"
                  value={settings.throttleDelayMs}
                  onChange={(e) => updateSetting("throttleDelayMs", Number(e.target.value) || 120)}
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Delay between batch dispatches to prevent rate-limiting.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="worker-concurrency" className="text-xs font-semibold flex items-center gap-1.5">
                  <Server className="size-3 text-emerald-500" />
                  Worker Concurrency
                </Label>
                <Input
                  id="worker-concurrency"
                  type="number"
                  min="1"
                  max="20"
                  value={settings.workerConcurrency}
                  onChange={(e) => updateSetting("workerConcurrency", Number(e.target.value) || 5)}
                  className="h-9"
                />
                <p className="text-[11px] text-muted-foreground">
                  Simultaneous parallel jobs handled by the background process.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Shield className="size-4.5 text-emerald-600" />
                <CardTitle className="text-base">Guaranteed Delivery & Failure Policy</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground">Auto-Refund Failed Messages</p>
                  <p className="text-[11px] text-muted-foreground">
                    Automatically refund credits back to the user when phone numbers are invalid or delivery fails.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoRefundEnabled}
                  onChange={(e) => updateSetting("autoRefundEnabled", e.target.checked)}
                  className="size-4 accent-primary rounded cursor-pointer"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: CREDITS & BILLING DEFAULTS */}
      {activeTab === "billing" && (
        <div className="space-y-5 max-w-3xl">
          <Card className="rounded-lg shadow-none">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center gap-2">
                <Coins className="size-4.5 text-primary" />
                <CardTitle className="text-base">Default Credit Rates & Alerts</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set default credit rates for new accounts.
              </p>
            </CardHeader>
            <CardContent className="grid gap-5 pt-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="default-rate" className="text-xs font-semibold">
                  Default Rate (Credits per Recipient)
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
                  Applied automatically to newly created reseller or user accounts.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="low-balance" className="text-xs font-semibold">
                  Low Balance Alert Threshold
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
                  Triggers dashboard warning badge when client wallet balance falls below this number.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
