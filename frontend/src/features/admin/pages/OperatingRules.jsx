import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Laptop, Smartphone, Tablet, Clock, SlidersHorizontal, RotateCcw,
  Save, Coins, CheckCircle2, LogOut, RefreshCw,
  MonitorSmartphone, ShieldCheck, Info, CircleDot,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import OperatingTimePicker from "../components/OperatingTimePicker";
import { validateOperatingWindow } from "../lib/operatingTime";
import { getSessions, logoutSession, logoutAll } from "@/features/auth/services/auth.api";
import { dateTime, number } from "../lib/format";

const STORAGE_KEY = "admin_platform_settings";
const DEFAULT_SETTINGS = {
  dailyCampaignLimit: 10,
  startTime: "09:00", endTime: "19:00", outOfWindowBehavior: "queue",
  maxAllowedDevices: 3, deviceEvictionStrategy: "fifo",
  defaultRatePerMsg: 1, lowBalanceThreshold: 500,
  creditExpiryValue: 2, creditExpiryUnit: "years", creditExpiryYears: "2",
  autoRefundEnabled: true, strictOverdraftProtection: true,
};
const TABS = [
  { id: "campaigns", short: "Campaigns", long: " & hours", icon: Clock, description: "Set campaign allowances and the daily sending window." },
  { id: "devices", short: "Devices", long: " & sessions", icon: MonitorSmartphone, description: "Choose device limits and review your signed-in sessions." },
  { id: "billing", short: "Credits", long: " & rates", icon: Coins, description: "Set default pricing, expiry, and balance preferences." },
];
const FIELD_META = {
  dailyCampaignLimit: ["campaigns", "daily-limit"],
  sendingWindow: ["campaigns", "start-time"],
  maxAllowedDevices: ["devices", "device-limit"],
  defaultRatePerMsg: ["billing", "default-rate"],
  lowBalanceThreshold: ["billing", "low-balance"],
  creditExpiryValue: ["billing", "credit-expiry-value"],
};

function readSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...DEFAULT_SETTINGS };
    const savedSettings = { ...parsed };
    delete savedSettings.maxRecipientsPerCampaign;
    return { ...DEFAULT_SETTINGS, ...savedSettings };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

function parseDeviceDetails(userAgent = "") {
  const ua = String(userAgent || "").toLowerCase();
  let browser = "Web browser";
  if (/edg(e|a|ios)?\//.test(ua)) browser = "Microsoft Edge";
  else if (/opr\/|opera|opios\//.test(ua)) browser = "Opera";
  else if (ua.includes("samsungbrowser")) browser = "Samsung Internet";
  else if (/firefox|fxios/.test(ua)) browser = "Mozilla Firefox";
  else if (/chrome|crios/.test(ua)) browser = "Google Chrome";
  else if (ua.includes("safari")) browser = "Apple Safari";

  let os = "Unknown device";
  let type = "desktop";
  if (ua.includes("ipad")) { os = "iPad"; type = "tablet"; }
  else if (ua.includes("iphone") || ua.includes("ipod")) { os = "iPhone"; type = "mobile"; }
  else if (ua.includes("android")) { type = ua.includes("mobile") ? "mobile" : "tablet"; os = type === "tablet" ? "Android tablet" : "Android"; }
  else if (ua.includes("windows")) os = "Windows";
  else if (/macintosh|mac os/.test(ua)) os = "macOS";
  else if (ua.includes("linux")) os = "Linux";
  return { type, label: `${browser} on ${os}` };
}

function SettingsCard({ title, description, icon: Icon, children, action }) {
  return (
    <Card className="portal-card portal-settings-card">
      <div className="portal-card-heading">
        <span className="portal-settings-card-icon"><Icon aria-hidden="true" /></span>
        <div><h3>{title}</h3><p>{description}</p></div>{action}
      </div>
      <div className="portal-settings-card-body">{children}</div>
    </Card>
  );
}

function NumberField({ id, label, hint, error, value, onChange, ...props }) {
  return <div className="portal-field">
    <label htmlFor={id}>{label}</label>
    <Input id={id} type="number" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`} {...props} />
    <p id={`${id}-hint`} className="portal-field-hint">{hint}</p>
    {error && <p id={`${id}-error`} className="portal-field-error" role="alert">{error}</p>}
  </div>;
}

function ChoiceGroup({ legend, name, value, onChange, choices }) {
  return <fieldset className="portal-choice-group"><legend>{legend}</legend>
    {choices.map((choice) => <label key={choice.value} className="portal-choice">
      <input type="radio" name={name} value={choice.value} checked={value === choice.value} onChange={() => onChange(choice.value)} />
      <span><strong>{choice.label}</strong><small>{choice.description}</small></span>
    </label>)}
  </fieldset>;
}

function ToggleRule({ id, label, description, checked, onChange }) {
  return <label htmlFor={id} className="portal-toggle-row"><span><strong>{label}</strong><small id={`${id}-description`}>{description}</small></span>
    <input id={id} type="checkbox" role="switch" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} aria-describedby={`${id}-description`} className="portal-toggle" />
  </label>;
}

function validateSettings(settings) {
  const errors = {};
  const integer = (value, min, max = Infinity) => value !== "" && Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max;
  if (!integer(settings.dailyCampaignLimit, 1, 500)) errors.dailyCampaignLimit = "Enter a whole number from 1 to 500.";
  if (!/^\d{2}:\d{2}$/.test(settings.startTime) || !/^\d{2}:\d{2}$/.test(settings.endTime)) errors.sendingWindow = "Choose a valid start and end time.";
  else {
    const windowError = validateOperatingWindow(settings.startTime, settings.endTime);
    if (windowError) errors.sendingWindow = windowError;
  }
  if (!integer(settings.maxAllowedDevices, 1, 5)) errors.maxAllowedDevices = "Choose between 1 and 5 devices.";
  if (settings.defaultRatePerMsg === "" || !Number.isFinite(Number(settings.defaultRatePerMsg)) || Number(settings.defaultRatePerMsg) < 0.01) errors.defaultRatePerMsg = "Enter a rate of at least 0.01 credits.";
  if (!integer(settings.lowBalanceThreshold, 0)) errors.lowBalanceThreshold = "Enter a whole number of 0 or more.";
  if (settings.creditExpiryUnit !== "never" && (settings.creditExpiryValue === "" || !Number.isFinite(Number(settings.creditExpiryValue)) || Number(settings.creditExpiryValue) < 0)) errors.creditExpiryValue = "Enter a valid expiry of 0 or more, or choose Never.";
  return errors;
}

export default function OperatingRules() {
  const [initialSettings] = useState(readSettings);
  const [settings, setSettings] = useState(initialSettings);
  const [savedSettings, setSavedSettings] = useState(initialSettings);
  const [activeTab, setActiveTab] = useState("campaigns");
  const [resetKey, setResetKey] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [focusField, setFocusField] = useState(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");
  const dirty = JSON.stringify(settings) !== JSON.stringify(savedSettings);
  const validation = validateSettings(settings);
  const errors = showErrors ? validation : {};
  const sendingError = validation.sendingWindow;
  const updateSetting = (key, value) => { setSettings((previous) => ({ ...previous, [key]: value })); setSaveNotice(""); };

  useEffect(() => {
    if (!focusField) return;
    const frame = requestAnimationFrame(() => {
      (document.getElementById(focusField) || document.getElementById(`operating-panel-${activeTab}`))?.focus();
      setFocusField(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab, focusField]);

  const sessionsQuery = useQuery({
    queryKey: ["activeSessions"], queryFn: getSessions,
    enabled: activeTab === "devices", refetchInterval: activeTab === "devices" ? 5000 : false,
  });
  const disconnectMutation = useMutation({
    mutationFn: logoutSession,
    onSuccess: () => { sessionsQuery.refetch(); toast.add({ title: "Device disconnected", type: "success" }); },
    onError: (error) => toast.add({ title: "Could not disconnect device", description: error?.response?.data?.message || error?.message, type: "error" }),
  });
  const logoutAllMutation = useMutation({
    mutationFn: logoutAll,
    onSuccess: () => { sessionStorage.removeItem("authToken"); sessionStorage.removeItem("impersonationToken"); localStorage.removeItem("token"); window.dispatchEvent(new CustomEvent("auth:unauthorized")); },
    onError: (error) => toast.add({ title: "Could not sign out devices", description: error?.response?.data?.message || error?.message, type: "error" }),
  });
  const activeSessions = sessionsQuery.data?.sessions || [];
  const activeCount = sessionsQuery.data?.activeCount ?? activeSessions.length;

  function handleSave(event) {
    event.preventDefault();
    const firstError = Object.keys(validation)[0];
    if (firstError) {
      setShowErrors(true);
      setActiveTab(FIELD_META[firstError][0]);
      setFocusField(FIELD_META[firstError][1]);
      setSaveNotice("Check the highlighted fields before saving.");
      return;
    }
    const normalized = { ...settings };
    ["dailyCampaignLimit", "maxAllowedDevices", "defaultRatePerMsg", "lowBalanceThreshold", "creditExpiryValue"].forEach((key) => { normalized[key] = Number(settings[key]); });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      setSettings(normalized); setSavedSettings(normalized); setShowErrors(false);
      setSaveNotice("Changes saved in this browser.");
      toast.add({ title: "Preferences saved", description: "Saved in this browser. Server rules are unchanged.", type: "success" });
    } catch {
      setSaveNotice("Could not save. Browser storage may be unavailable.");
      toast.add({ title: "Could not save preferences", description: "Check that browser storage is available and try again.", type: "error" });
    }
  }

  function handleReset() {
    setSettings({ ...DEFAULT_SETTINGS }); setResetKey((key) => key + 1); setShowErrors(false);
    setSaveNotice(JSON.stringify(DEFAULT_SETTINGS) === JSON.stringify(savedSettings) ? "Default preferences restored." : "Defaults restored. Save changes to keep them.");
  }

  function changeExpiry(value, unit) {
    const factor = unit === "months" ? 1 / 12 : unit === "days" ? 1 / 365.25 : 1;
    setSettings((previous) => ({ ...previous, creditExpiryValue: value, creditExpiryUnit: unit, creditExpiryYears: unit === "never" ? "0" : String((Number(value) || 0) * factor) }));
    setSaveNotice("");
  }

  function onTabKeyDown(event, index) {
    let next = index;
    if (["ArrowRight", "ArrowDown"].includes(event.key)) next = (index + 1) % TABS.length;
    else if (["ArrowLeft", "ArrowUp"].includes(event.key)) next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = TABS.length - 1;
    else return;
    event.preventDefault(); setActiveTab(TABS[next].id);
    document.getElementById(`operating-tab-${TABS[next].id}`)?.focus();
  }

  return (
    <form className="portal-settings" noValidate onSubmit={handleSave}>
      <header className="portal-page-heading">
        <div className="portal-heading-copy"><p className="portal-eyebrow">Workspace preferences</p><h1>Operating rules</h1><p>Manage campaign limits, device access, and default credit settings.</p></div>
        <span className="portal-local-badge"><Laptop aria-hidden="true" />Browser preferences</span>
      </header>
      <div className="portal-settings-notice"><Info aria-hidden="true" /><span>These preferences are saved in this browser only and do not update server rules. Device sign-out actions apply immediately.</span></div>
      <dl className="portal-settings-summary">
        <div><dt>Daily campaign limit</dt><dd>{settings.dailyCampaignLimit === "" ? "—" : number(settings.dailyCampaignLimit)} / account</dd></div>
        <div><dt>Sending window</dt><dd>{settings.startTime || "—"}–{settings.endTime || "—"}</dd></div>
        <div><dt>Devices per account</dt><dd>{settings.maxAllowedDevices} devices</dd></div>
      </dl>
      <div role="tablist" aria-label="Operating rule categories" className="portal-settings-tabs">
        {TABS.map((tab, index) => <button key={tab.id} id={`operating-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`operating-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => onTabKeyDown(event, index)} className="portal-settings-tab"><tab.icon aria-hidden="true" /><span>{tab.short}<span className="portal-tab-long">{tab.long}</span></span></button>)}
      </div>
      {TABS.filter((tab) => tab.id !== activeTab).map((tab) => <div key={tab.id} id={`operating-panel-${tab.id}`} role="tabpanel" aria-labelledby={`operating-tab-${tab.id}`} hidden />)}

      <section id={`operating-panel-${activeTab}`} role="tabpanel" aria-labelledby={`operating-tab-${activeTab}`} tabIndex={0} className="portal-settings-panel">
        <div className="portal-settings-panel-intro"><h2>{TABS.find((tab) => tab.id === activeTab).short}{TABS.find((tab) => tab.id === activeTab).long}</h2><p>{TABS.find((tab) => tab.id === activeTab).description}</p></div>

        {activeTab === "campaigns" && <div className="portal-settings-columns">
          <SettingsCard title="Campaign allowances" description="Set the volume each account can submit." icon={SlidersHorizontal}>
            <NumberField id="daily-limit" label="Daily campaigns per account" hint="Maximum campaigns a user or reseller can create per calendar day." min={1} max={500} step={1} value={settings.dailyCampaignLimit} onChange={(value) => updateSetting("dailyCampaignLimit", value)} error={errors.dailyCampaignLimit} />
            <div className="portal-rule-summary"><strong>Campaign limits</strong><p>Up to <b>{settings.dailyCampaignLimit || "—"} campaigns</b> per day. There is <b>no contact limit per campaign</b>.</p></div>
          </SettingsCard>
          <SettingsCard title="Sending window" description="Choose daily hours for sending campaigns." icon={Clock}>
            <div key={resetKey} className="portal-time-grid">
              <OperatingTimePicker id="start-time" label="Start time" value={settings.startTime} onChange={(value) => updateSetting("startTime", value)} invalid={Boolean(sendingError)} />
              <OperatingTimePicker id="end-time" label="End time" value={settings.endTime} onChange={(value) => updateSetting("endTime", value)} invalid={Boolean(sendingError)} />
            </div>
            {sendingError && <p role="alert" className="portal-field-error">{sendingError}</p>}
            <ChoiceGroup legend="Outside sending hours" name="sending-behavior" value={settings.outOfWindowBehavior} onChange={(value) => updateSetting("outOfWindowBehavior", value)} choices={[
              { value: "queue", label: "Hold until the next window", description: "Keep the campaign pending until sending hours begin." },
              { value: "reject", label: "Ask users to try later", description: "Prevent submissions outside the sending window." },
            ]} />
          </SettingsCard>
        </div>}

        {activeTab === "devices" && <div className="portal-settings-columns">
          <SettingsCard title="Device limits" description="Choose how accounts handle concurrent logins." icon={ShieldCheck}>
            <div className="portal-field"><span id="device-limit-label" className="portal-field-label">Maximum signed-in devices</span>
              <div id="device-limit" tabIndex={-1} role="group" aria-labelledby="device-limit-label" className="portal-device-options">
                {[1, 2, 3, 4, 5].map((count) => <button key={count} type="button" aria-pressed={Number(settings.maxAllowedDevices) === count} onClick={() => updateSetting("maxAllowedDevices", count)} className="portal-device-option"><strong>{count}</strong><span>{count === 1 ? "device" : "devices"}</span></button>)}
              </div>
              <p className="portal-field-hint">Count each signed-in session, such as a work laptop or personal phone.</p>
              {errors.maxAllowedDevices && <p role="alert" className="portal-field-error">{errors.maxAllowedDevices}</p>}
            </div>
            <ChoiceGroup legend="When the limit is reached" name="device-strategy" value={settings.deviceEvictionStrategy} onChange={(value) => updateSetting("deviceEvictionStrategy", value)} choices={[
              { value: "fifo", label: "Sign out the oldest device", description: "Allow the new login and end the oldest session." },
              { value: "block", label: "Block the new login", description: "Ask the user to sign out from an existing device first." },
            ]} />
            <div className="portal-danger-zone"><h4>Session sign-out</h4><p>Signing out devices ends their access. Affected devices will need to sign in again.</p>
              {confirmLogout ? <div className="portal-confirm-action" role="alert"><p>Sign out all devices covered by your account? Your current session will also end.</p><div><Button type="button" variant="outline" onClick={() => setConfirmLogout(false)} disabled={logoutAllMutation.isPending}>Cancel</Button><Button type="button" variant="destructive" onClick={() => logoutAllMutation.mutate()} disabled={logoutAllMutation.isPending}><LogOut aria-hidden="true" />{logoutAllMutation.isPending ? "Signing out…" : "Confirm sign-out"}</Button></div></div>
                : <Button type="button" variant="outline" className="portal-danger-button" onClick={() => setConfirmLogout(true)}><LogOut aria-hidden="true" />Sign out all devices</Button>}
            </div>
          </SettingsCard>

          <SettingsCard title={`Signed-in devices${sessionsQuery.data ? ` (${activeCount})` : ""}`} description="Your account sessions · refreshes every 5 seconds." icon={MonitorSmartphone} action={<Button type="button" variant="ghost" size="sm" aria-label="Refresh signed-in devices" onClick={() => sessionsQuery.refetch()} disabled={sessionsQuery.isFetching}><RefreshCw aria-hidden="true" className={sessionsQuery.isFetching ? "animate-spin motion-reduce:animate-none" : ""} /></Button>}>
            {sessionsQuery.isError && <div role="alert" className="portal-field-error">Could not {sessionsQuery.data ? "refresh" : "load"} device sessions. Try refreshing again.</div>}
            {sessionsQuery.isPending ? <div className="portal-session-query-state" role="status"><RefreshCw className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading signed-in devices…</div>
              : !activeSessions.length && !sessionsQuery.isError ? <div className="portal-session-query-state"><MonitorSmartphone aria-hidden="true" />No signed-in devices found.</div>
              : <ul className="portal-session-list">{activeSessions.map((session, index) => {
                const parsed = parseDeviceDetails(session.userAgent);
                const DeviceIcon = parsed.type === "mobile" ? Smartphone : parsed.type === "tablet" ? Tablet : Laptop;
                const sessionId = session.id || session._id;
                return <li key={sessionId || index} className="portal-session" data-current={Boolean(session.isCurrentDevice)}>
                  <span className="portal-session-icon"><DeviceIcon aria-hidden="true" /></span>
                  <div className="portal-session-copy"><div className="portal-session-title"><strong>{parsed.label}</strong>{session.isCurrentDevice && <span>This device</span>}</div>
                    <div className="portal-session-details"><span>IP: <code>{session.ip || "Unavailable"}</code></span><span>Signed in: {session.createdAt ? dateTime(session.createdAt) : "Unavailable"}</span></div>
                  </div>
                  {!session.isCurrentDevice && <Button type="button" variant="outline" size="sm" disabled={!sessionId || disconnectMutation.isPending || logoutAllMutation.isPending} onClick={() => disconnectMutation.mutate(sessionId)} aria-label={`Disconnect ${parsed.label}`}>{disconnectMutation.isPending && disconnectMutation.variables === sessionId ? "Disconnecting…" : "Disconnect"}</Button>}
                </li>;
              })}</ul>}
          </SettingsCard>
        </div>}

        {activeTab === "billing" && <div className="portal-settings-columns">
          <SettingsCard title="Rates & credit expiry" description="Set defaults for new account balances." icon={Coins}>
            <NumberField id="default-rate" label="Credits per message" hint="Default rate for new accounts. Individual rates can be adjusted in Accounts." min={0.01} step={0.01} value={settings.defaultRatePerMsg} onChange={(value) => updateSetting("defaultRatePerMsg", value)} error={errors.defaultRatePerMsg} />
            <NumberField id="low-balance" label="Low balance warning" hint="Show a warning below this credit balance." min={0} step={1} value={settings.lowBalanceThreshold} onChange={(value) => updateSetting("lowBalanceThreshold", value)} error={errors.lowBalanceThreshold} />
            <div className="portal-field"><label htmlFor="credit-expiry-value">Default credit expiry</label>
              <div className="portal-expiry-fields"><Input id="credit-expiry-value" type="number" min={0} step="any" disabled={settings.creditExpiryUnit === "never"} value={settings.creditExpiryUnit === "never" ? "" : settings.creditExpiryValue ?? ""} onChange={(event) => changeExpiry(event.target.value === "" ? "" : Number(event.target.value), settings.creditExpiryUnit)} placeholder={settings.creditExpiryUnit === "never" ? "No expiry" : "Duration"} aria-invalid={Boolean(errors.creditExpiryValue)} aria-describedby="credit-expiry-hint" />
                <select aria-label="Credit expiry unit" value={settings.creditExpiryUnit} onChange={(event) => changeExpiry(settings.creditExpiryValue, event.target.value)}>{["years", "months", "days", "never"].map((unit) => <option key={unit} value={unit}>{unit[0].toUpperCase() + unit.slice(1)}</option>)}</select>
              </div>
              <div className="portal-expiry-presets">{[{ label: "6 months", value: 6, unit: "months" }, { label: "1 year", value: 1, unit: "years" }, { label: "2 years", value: 2, unit: "years" }, { label: "3 years", value: 3, unit: "years" }, { label: "Never", value: 0, unit: "never" }].map((preset) => <button key={preset.label} type="button" aria-pressed={settings.creditExpiryUnit === preset.unit && (preset.unit === "never" || Number(settings.creditExpiryValue) === preset.value)} onClick={() => changeExpiry(preset.value, preset.unit)}>{preset.label}</button>)}</div>
              <p id="credit-expiry-hint" className="portal-field-hint">Choose a duration, use a preset, or select Never. A value of 0 also means no expiry.</p>
              {errors.creditExpiryValue && <p role="alert" className="portal-field-error">{errors.creditExpiryValue}</p>}
            </div>
            <div className="portal-rule-summary"><strong>Pricing example</strong><p>10,000 recipients × {settings.defaultRatePerMsg || "—"} credits = <b>{number(10000 * Number(settings.defaultRatePerMsg || 0))} credits</b>.</p></div>
          </SettingsCard>
          <SettingsCard title="Balance preferences" description="Choose refund and overdraft behavior." icon={ShieldCheck}>
            <ToggleRule id="auto-refund" label="Refund failed messages" description="Return credits for invalid phone numbers or failed deliveries." checked={settings.autoRefundEnabled} onChange={(value) => updateSetting("autoRefundEnabled", value)} />
            <ToggleRule id="overdraft-protection" label="Prevent negative balances" description="Require sufficient credits before launching or processing campaigns." checked={settings.strictOverdraftProtection} onChange={(value) => updateSetting("strictOverdraftProtection", value)} />
            <div className="portal-rule-summary" data-tone={settings.strictOverdraftProtection ? "default" : "warning"}><strong>{settings.strictOverdraftProtection ? "Overdraft protection selected" : "Overdraft protection turned off"}</strong><p>{settings.strictOverdraftProtection ? "This preference requires enough credits to cover a campaign." : "This preference allows balances to drop below zero. Review it before saving."}</p></div>
          </SettingsCard>
        </div>}
      </section>

      <div className="portal-savebar">
        <div className="portal-savebar-status" data-dirty={dirty} role="status" aria-live="polite">{dirty ? <CircleDot aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}<span>{saveNotice || (dirty ? "You have unsaved changes" : "No unsaved changes")}</span></div>
        <div className="portal-savebar-actions"><Button type="button" variant="outline" onClick={handleReset}><RotateCcw aria-hidden="true" />Restore defaults</Button><Button type="submit" disabled={!dirty}><Save aria-hidden="true" />Save changes</Button></div>
      </div>
    </form>
  );
}
