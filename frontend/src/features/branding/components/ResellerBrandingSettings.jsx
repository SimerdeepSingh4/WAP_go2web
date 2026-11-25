import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
  getResellerBranding,
  updateResellerBranding,
  uploadResellerLogo,
  removeResellerLogo,
} from "@/features/branding/services/branding.api.js";
import { useBranding } from "@/features/branding/context/BrandingContext";
import { BRAND_COLOR_FIELDS, BRAND_COLOR_PATTERN, brandColors } from "../../../../../shared/brandingColors.js";
import { applyBrandColors, pickerColor } from "@/features/branding/lib/themeHelper";
import OverviewMetricCards, { OverviewMetricCard } from "@/features/dashboard/components/OverviewMetricCards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { FormError, QueryState } from "@/features/dashboard/components/shared";
import { dateTime } from "@/lib/format";
import {
  Sparkles,
  Globe,
  Upload,
  Trash2,
  Check,
  AlertTriangle,
  Lock,
  LayoutDashboard,
  Paintbrush,
  Image as ImageIcon,
  Loader2,
  ArrowRight,
  RotateCcw,
  ChevronDown,
  ChartNoAxesColumn,
  PanelsTopLeft,
  Megaphone,
  Building2,
  Users,
  Wallet,
  Coins,
} from "lucide-react";

import "./reseller-branding.css";

const COLOR_PRESETS = [
  { name: "Morning Dew", primary: "#245e59", secondary: "#e4f6e6" },
  { name: "Ocean Navy", primary: "#000080", secondary: "#e2eff6" },
  { name: "Indigo Modern", primary: "#4f46e5", secondary: "#eef2ff" },
  { name: "Emerald Pro", primary: "#059669", secondary: "#ecfdf5" },
  { name: "Royal Purple", primary: "#7c3aed", secondary: "#f5f3ff" },
  { name: "Sunset Crimson", primary: "#e11d48", secondary: "#fff1f2" },
  { name: "Amber Slate", primary: "#d97706", secondary: "#fffbeb" },
  { name: "Charcoal Tech", primary: "#1f2937", secondary: "#f3f4f6" },
];

const KPI_CARDS = [
  { key: "kpiCampaignsColor", brandSlot: "campaigns", adminLabel: "Total campaigns", resellerLabel: "Campaigns", icon: Megaphone, value: 42 },
  { key: "kpiNetworkColor", brandSlot: "network", adminLabel: "Active resellers", resellerLabel: "Purchase rates", icon: Building2, resellerIcon: Coins, value: 4, resellerSample: "25 paise/credit" },
  { key: "kpiUsersColor", brandSlot: "users", adminLabel: "User accounts", resellerLabel: "User accounts", icon: Users, value: 62 },
  { key: "kpiCreditsColor", brandSlot: "credits", adminLabel: "Credits in circulation", resellerLabel: "Available credits", icon: Wallet, value: 1000 },
];

function editableColors(branding) {
  const palette = brandColors(branding);
  for (const { key } of KPI_CARDS) palette[key] ||= palette.kpiColor;
  palette.kpiColor = "";
  return palette;
}

const COLOR_GROUPS = [
  { label: "Buttons & highlights", keys: ["primaryColor", "primaryTextColor", "secondaryColor", "secondaryTextColor", "accentColor", "accentTextColor", "focusColor"] },
  { label: "Backgrounds & cards", keys: ["backgroundColor", "cardColor", "cardTextColor", "popoverColor", "popoverTextColor", "mutedColor", "borderColor"] },
  { label: "KPI cards", keys: ["kpiCampaignsColor", "kpiCampaignsTextColor", "kpiNetworkColor", "kpiNetworkTextColor", "kpiUsersColor", "kpiUsersTextColor", "kpiCreditsColor", "kpiCreditsTextColor"] },
  { label: "Navigation", keys: ["sidebarColor", "sidebarTextColor", "headerColor", "headerTextColor"] },
  { label: "Text", keys: ["textColor", "mutedTextColor"] },
  { label: "Status & charts", keys: ["successColor", "warningColor", "dangerColor", "infoColor", "chartColor"] },
];

const PREVIEW_VIEWS = [
  { label: "Workspace", icon: LayoutDashboard },
  { label: "KPI cards", icon: ChartNoAxesColumn },
  { label: "Components", icon: PanelsTopLeft },
  { label: "Status & charts", icon: AlertTriangle },
];
const COMPONENT_COLORS = ["cardColor", "cardTextColor", "secondaryColor", "secondaryTextColor", "accentColor", "accentTextColor", "popoverColor", "popoverTextColor", "mutedColor", "borderColor", "focusColor"];
const STATUS_EXAMPLES = [
  ["success", "Campaign sent"],
  ["warning", "Credits are running low"],
  ["danger", "Payment failed"],
  ["info", "Report is ready"],
];

function normalizeHex(input) {
  const value = input.trim();
  return value && !value.startsWith("#") ? "#" + value : value;
}

export default function ResellerBrandingSettings() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "Super Admin";
  const previewLabel = isSuperAdmin ? "Platform preview" : "Client workspace preview";
  const queryClient = useQueryClient();
  const { setCustomBranding } = useBranding();

  const query = useQuery({
    queryKey: ["resellerBranding"],
    queryFn: getResellerBranding,
  });

  const branding = query.data;

  const [form, setForm] = useState({
    subdomain: "",
    brandName: "",
    colors: brandColors(),
  });
  const [error, setError] = useState("");
  const [invalidColor, setInvalidColor] = useState(null);
  const [previewView, setPreviewView] = useState("Workspace");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [formBranding, setFormBranding] = useState(null);
  const { colors } = form;
  const previewRef = useRef(null);

  useEffect(() => {
    if (!previewRef.current) return;
    const palette = Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, normalizeHex(value)]));
    applyBrandColors(palette, previewRef.current);
  }, [colors, branding]);

  if (branding && branding !== formBranding) {
    setFormBranding(branding);
    const savedColors = editableColors(branding);
    const previousColors = editableColors(formBranding);
    if (
      !formBranding ||
      branding.brandName !== formBranding.brandName ||
      branding.subdomain !== formBranding.subdomain ||
      Object.keys(savedColors).some(key => savedColors[key] !== previousColors[key])
    ) {
      setForm({
        subdomain: branding.subdomain || "",
        brandName: branding.brandName || "",
        colors: savedColors,
      });
    }
  }

  const saveMutation = useMutation({
    mutationFn: updateResellerBranding,
    onSuccess: (data) => {
      queryClient.setQueryData(["resellerBranding"], data.branding);
      setCustomBranding(data.branding);
      toast.add({
        title: isSuperAdmin ? "Platform branding saved" : "White-label branding saved",
        type: "success",
      });
      setError("");
    },
    onError: (err) => {
      setError(err.message || "Failed to update branding.");
    },
  });

  const logoMutation = useMutation({
    mutationFn: uploadResellerLogo,
    onSuccess: (data) => {
      queryClient.setQueryData(["resellerBranding"], (old) => ({
        ...old,
        logoUrl: data.logoUrl,
      }));
      setCustomBranding({ logoUrl: data.logoUrl });
      toast.add({
        title: "Logo uploaded",
        description: "Your custom brand logo is now live.",
        type: "success",
      });
    },
    onError: (err) => {
      toast.add({
        title: "Logo upload failed",
        description: err.message,
        type: "error",
      });
    },
  });

  const removeLogoMutation = useMutation({
    mutationFn: removeResellerLogo,
    onSuccess: () => {
      queryClient.setQueryData(["resellerBranding"], (old) => ({
        ...old,
        logoUrl: "",
      }));
      setCustomBranding({ logoUrl: "" });
      toast.add({
        title: "Logo removed",
        description: "Reverted to default platform logo.",
        type: "success",
      });
    },
    onError: (err) => {
      toast.add({
        title: "Could not remove logo",
        description: err.message,
        type: "error",
      });
    },
  });

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.add({
        title: "File too large",
        description: "Upload a logo image up to 5 MB.",
        type: "error",
      });
      event.target.value = "";
      return;
    }

    try {
      setUploadingLogo(true);
      await logoMutation.mutateAsync(file);
    } catch {
      // Handled by logoMutation.onError toast
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  }

  function handleSave(e) {
    e.preventDefault();
    setError("");
    setInvalidColor(null);

    if (form.brandName && form.brandName.trim().length > 30) {
      setError("Website name cannot exceed 30 characters.");
      return;
    }

    if (!isSuperAdmin && form.subdomain && !/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/i.test(form.subdomain)) {
      setError("Subdomain must be 3-30 lowercase characters, numbers or hyphens.");
      return;
    }

    const palette = {};
    for (const key of Object.keys(BRAND_COLOR_FIELDS)) {
      const value = normalizeHex(colors[key]);
      if (value && !BRAND_COLOR_PATTERN.test(value)) {
        setInvalidColor(key);
        const input = document.getElementById("branding-" + key);
        const group = input?.closest("details");
        if (group) group.open = true;
        input?.focus();
        return;
      }
      palette[key] = value;
    }

    saveMutation.mutate({
      ...(!isSuperAdmin ? { subdomain: form.subdomain.trim().toLowerCase() } : {}),
      brandName: form.brandName.trim(),
      ...palette,
    });
  }

  if (query.isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto p-4" role="status" aria-label="Loading branding settings">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (query.isError) return <QueryState query={query} />;

  // 1. Not Enabled
  if (!branding?.enabled) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center space-y-4 max-w-xl mx-auto my-6">
        <div className="size-12 rounded-2xl bg-muted grid place-items-center mx-auto text-muted-foreground">
          <Lock className="size-6" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-lg font-semibold text-foreground">White-Label Access Not Enabled</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
            White-label branding allows you to connect your own subdomain, upload your company logo, and customize the entire website's theme and colors for you and your clients.
          </p>
        </div>
        <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs text-muted-foreground max-w-md mx-auto">
          Please contact your <strong>Super Admin</strong> to grant white-label access for your reseller account.
        </div>
      </div>
    );
  }

  // 2. Expired View
  if (branding?.isExpired) {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="rounded-xl border border-red-300 bg-red-50/80 dark:bg-red-950/30 dark:border-red-900 p-4 flex items-start gap-3 text-red-900 dark:text-red-200 text-xs">
          <AlertTriangle className="size-5 shrink-0 text-red-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-sm">White-Label Access Expired</p>
            <p>
              Your white-label subscription expired on{" "}
              <strong>{dateTime(branding.expiresAt)}</strong>.
            </p>
            <p className="text-red-800/80 dark:text-red-300/80">
              Your custom subdomain and site theme have automatically reverted to the default platform branding. Contact Super Admin to renew your white-label access.
            </p>
          </div>
        </div>

        {/* Read-Only Summary */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4 opacity-75">
          <h4 className="text-sm font-semibold">Previous Branding Configuration</h4>
          <dl className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <dt className="text-muted-foreground">Subdomain</dt>
              <dd className="font-mono font-medium mt-0.5">{branding.subdomain || "None"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Brand Name</dt>
              <dd className="font-medium mt-0.5">{branding.brandName || "Default"}</dd>
            </div>
          </dl>
        </div>
      </div>
    );
  }

  const currentLogo = branding.logoUrl || "https://res.cloudinary.com/dyfjy8kmv/image/upload/v1793689940/Navy_Blue_Bird_Chat_Logo_n0udpf.webp";
  const previewName = form.brandName.trim() || "Your brand";
  const customizedColors = Object.values(colors).filter(Boolean).length;
  const savedColors = editableColors(branding);
  const hasChanges = form.brandName.trim() !== (branding.brandName || "") ||
    (!isSuperAdmin && form.subdomain !== (branding.subdomain || "")) ||
    Object.keys(colors).some(key => normalizeHex(colors[key]).toLowerCase() !== savedColors[key].toLowerCase());

  function updateColor(key, value) {
    if (KPI_CARDS.some(card => card.key === key) || key.startsWith("kpi")) setPreviewView("KPI cards");
    else if (COMPONENT_COLORS.includes(key)) setPreviewView("Components");
    else if (COLOR_GROUPS.at(-1).keys.includes(key)) setPreviewView("Status & charts");
    else setPreviewView("Workspace");
    if (invalidColor === key) setInvalidColor(null);
    setForm(previous => ({ ...previous, colors: { ...previous.colors, [key]: value } }));
  }

  const previewAddress = isSuperAdmin ? "wap-go2web-2.onrender.com" : `${form.subdomain || "yourbrand"}.wap-go2web-2.onrender.com`;
  const logoBusy = uploadingLogo || logoMutation.isPending || removeLogoMutation.isPending;

  return (
    <div className="branding-editor">
      {!isSuperAdmin && (
        <div className="branding-access">
          <div><Sparkles aria-hidden="true" /><strong>White-label access</strong><span className="branding-access-dot" aria-hidden="true" /><span>Active</span></div>
          <span>{branding.expiresAt ? `Access expires ${dateTime(branding.expiresAt)}` : "Lifetime access"}</span>
        </div>
      )}
      <form onSubmit={handleSave}>
        <div className="branding-grid">
          <div className="branding-fields">
            <section className="branding-section branding-identity" aria-labelledby="branding-identity-heading">
              <div className="branding-section-header"><span className="branding-section-icon"><ImageIcon aria-hidden="true" /></span><div><h3 id="branding-identity-heading">Brand identity</h3></div></div>
              <div className="branding-section-body">
                <div className="branding-field">
                  <div className="flex items-center justify-between">
                    <label htmlFor="reseller-brand-name">Website name</label>
                    <span className="text-[11px] text-muted-foreground font-mono">{form.brandName.length}/30</span>
                  </div>
                  <Input id="reseller-brand-name" placeholder="e.g. Acme Marketing" value={form.brandName} onChange={e => setForm({ ...form, brandName: e.target.value.slice(0, 30) })} maxLength={30} aria-describedby="branding-name-help" />
                  <p id="branding-name-help" className="branding-help">Appears in the sidebar and browser tab.</p>
                </div>
                <div className="branding-field"><span>Company logo</span>
                  <div className="branding-logo-upload">
                    <div className="branding-logo-image"><img src={currentLogo} alt="Current company logo" /></div>
                    <p className="branding-help branding-logo-help">PNG, JPG or WebP, up to 5 MB.<br />Logo changes apply immediately.</p>
                    <div className="branding-logo-actions">
                      <Button type="button" variant="outline" size="sm" disabled={logoBusy} onClick={() => document.getElementById("logo-file-input")?.click()}>{logoBusy ? <Loader2 className="animate-spin" /> : <Upload />}{uploadingLogo ? "Uploading…" : "Upload logo"}</Button>
                      {branding.logoUrl && <Button type="button" variant="ghost" size="sm" disabled={logoBusy} onClick={() => removeLogoMutation.mutate()}><Trash2 />Remove</Button>}
                    </div>
                    <input id="logo-file-input" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload company logo" disabled={logoBusy} onChange={handleFileChange} />
                  </div>
                </div>
              </div>
            </section>
            {!isSuperAdmin && (
              <section className="branding-section" aria-labelledby="branding-address-heading">
                <div className="branding-section-header"><span className="branding-section-icon"><Globe aria-hidden="true" /></span><div><h3 id="branding-address-heading">Workspace address</h3><p>Choose the subdomain your clients will recognize.</p></div></div>
                <div className="branding-section-body"><div className="branding-field">
                  <label htmlFor="reseller-subdomain">Subdomain</label>
                  <div className="branding-address"><span>https://</span><Input id="reseller-subdomain" placeholder="yourbrand" value={form.subdomain} onChange={e => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} maxLength={30} className="font-mono text-sm focus-visible:ring-0 focus-visible:outline-none" aria-describedby="branding-address-help" /><span>.wap-go2web-2.onrender.com</span></div>
                  <p id="branding-address-help" className="branding-help">Use 3–30 lowercase letters, numbers or hyphens. The domain shown here is an example.</p>
                </div></div>
              </section>
            )}
            <section className="branding-section branding-colors" aria-labelledby="branding-colors-heading">
              <div className="branding-section-header branding-colors-header">
                <span className="branding-section-icon"><Paintbrush aria-hidden="true" /></span>
                <div>
                  <h3 id="branding-colors-heading">Brand colors</h3>
                  <p>Pick a swatch or enter a hex code. Your palette applies to both light and dark mode.</p>
                </div>
                <Button type="button" size="sm" variant="outline" disabled={!customizedColors || saveMutation.isPending} onClick={() => {
                  setForm(previous => ({ ...previous, colors: brandColors() }));
                  setInvalidColor(null);
                }}><RotateCcw />Reset all colors</Button>
                <Button className="branding-preview-jump" type="button" size="sm" variant="outline" onClick={() => previewRef.current?.scrollIntoView({ block: "center" })}>View preview</Button>
              </div>
              <div className="branding-section-body branding-colors-body">
                <details className="branding-color-group branding-palette-group">
                  <summary><span>Button palettes</span><ChevronDown aria-hidden="true" /></summary>
                  <div className="branding-presets">
                    {COLOR_PRESETS.map(preset => {
                      const selected = normalizeHex(colors.primaryColor).toLowerCase() === preset.primary &&
                        normalizeHex(colors.secondaryColor).toLowerCase() === preset.secondary;
                      return (
                        <button key={preset.name} type="button" className="branding-preset" aria-pressed={selected} disabled={saveMutation.isPending} onClick={() => {
                          setForm(previous => ({ ...previous, colors: { ...previous.colors, primaryColor: preset.primary, secondaryColor: preset.secondary } }));
                          setPreviewView("Workspace");
                          if (invalidColor === "primaryColor" || invalidColor === "secondaryColor") setInvalidColor(null);
                        }}>
                          <span className="branding-preset-swatches" aria-hidden="true">
                            <span className="branding-swatch" style={{ background: preset.primary }} />
                            <span className="branding-swatch" style={{ background: preset.secondary }} />
                          </span>
                          <span>{preset.name}</span>
                          {selected && <Check aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </details>
                {COLOR_GROUPS.map(({ label, keys }, index) => (
                  <details key={label} className="branding-color-group" open={index === 0 || undefined}>
                    <summary><span>{label}</span><ChevronDown aria-hidden="true" /></summary>
                    <div className="branding-color-list">
                      {keys.map(key => {
                        const [fieldLabel, token, fallback] = BRAND_COLOR_FIELDS[key];
                        const kpi = KPI_CARDS.find(card => card.key === key);
                        const name = kpi ? (isSuperAdmin ? kpi.adminLabel : kpi.resellerLabel) : fieldLabel;
                        const invalid = invalidColor === key;
                        const value = pickerColor(normalizeHex(colors[key]));
                        return (
                          <div key={key} className="branding-color-row">
                            <label htmlFor={"branding-" + key}>{name}{!colors[key].trim() && <span className="branding-color-default">Default</span>}</label>
                            <div className="branding-color-input">
                              <span className="branding-color-picker" style={{ backgroundColor: value || "var(--" + token + ", " + fallback + ")" }}>
                                <input
                                  type="color"
                                  aria-label={"Pick a color for " + name.toLowerCase()}
                                  value={value || fallback}
                                  onChange={event => updateColor(key, event.target.value)}
                                  disabled={saveMutation.isPending}
                                />
                              </span>
                              <Input
                                id={"branding-" + key}
                                placeholder={fallback}
                                value={colors[key]}
                                onChange={event => updateColor(key, event.target.value)}
                                onBlur={() => {
                                  const hex = normalizeHex(colors[key]);
                                  if (hex && BRAND_COLOR_PATTERN.test(hex) && hex !== colors[key]) updateColor(key, hex);
                                }}
                                aria-invalid={invalid || undefined}
                                aria-describedby={invalid ? "branding-error-" + key : undefined}
                                autoComplete="off"
                                spellCheck={false}
                                disabled={saveMutation.isPending}
                              />
                              <Button type="button" variant="ghost" size="sm" disabled={!colors[key] || saveMutation.isPending} aria-label={"Reset " + name.toLowerCase()} onClick={() => updateColor(key, "")}>
                                <RotateCcw />Reset
                              </Button>
                            </div>
                            {invalid && <p id={"branding-error-" + key} role="alert">Enter a hex color such as #4285f4.</p>}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))}
              </div>
            </section>
          </div>
          <aside ref={previewRef} className="branding-preview" aria-label={previewLabel}>
            <div className="branding-preview-heading">{previewLabel}<span><span className="branding-access-dot" />Live</span></div>
            <div className="branding-preview-views" role="group" aria-label="Preview example">
              {PREVIEW_VIEWS.map(({ label, icon: Icon }) => (
                <button key={label} type="button" aria-pressed={previewView === label} onClick={() => setPreviewView(label)}>
                  <Icon aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <div className="branding-preview-content">
              {previewView === "Workspace" && (
                <div className="branding-preview-window">
                  <div className="branding-preview-browser" aria-hidden="true"><i /><i /><i /><span>{previewAddress}</span><Lock className="size-3 text-muted-foreground" /></div>
                  <div className="branding-preview-brand"><img src={currentLogo} alt="" /><strong>{previewName}</strong></div>
                  <div className="branding-preview-workspace">
                    <div className="branding-preview-nav"><LayoutDashboard aria-hidden="true" />Overview</div>
                    <h4>Your workspace</h4>
                    <p className="branding-help">Campaign activity</p>
                    <div className="branding-preview-stat"><OverviewMetricCard label="Available credits" value={12500} caption="Example balance" icon={ArrowRight} accent brandSlot="credits" /></div>
                    <div className="branding-preview-action">Create campaign<ArrowRight aria-hidden="true" /></div>
                  </div>
                </div>
              )}
              {previewView === "KPI cards" && (
                <OverviewMetricCards
                  columns={2}
                  label="KPI card preview"
                  className="branding-kpi-preview"
                  items={(isSuperAdmin ? KPI_CARDS : [KPI_CARDS[3], KPI_CARDS[0], KPI_CARDS[2], KPI_CARDS[1]]).map(card => ({
                    label: isSuperAdmin ? card.adminLabel : card.resellerLabel,
                    value: isSuperAdmin ? card.value : card.resellerSample ?? card.value,
                    brandSlot: card.brandSlot,
                    valueSize: !isSuperAdmin && card.resellerSample ? "text" : undefined,
                    icon: isSuperAdmin ? card.icon : card.resellerIcon ?? card.icon,
                  }))}
                />
              )}
              {previewView === "Components" && (
                <div className="branding-preview-components">
                  <div className="branding-preview-secondary">Secondary button</div>
                  <div className="branding-preview-menu">
                    <strong>Menu</strong>
                    <span>Selected item</span>
                  </div>
                  <div className="branding-preview-muted">Muted surface</div>
                  <div className="branding-preview-focus">Focused input</div>
                </div>
              )}
              {previewView === "Status & charts" && (
                <div className="branding-preview-components">
                  {STATUS_EXAMPLES.map(([tone, message]) => (
                    <div className="branding-preview-status" key={tone} style={{
                      "--example-status-bg": "var(--status-" + tone + "-bg)",
                      "--example-status-text": "var(--status-" + tone + "-text)",
                      "--example-status-border": "var(--status-" + tone + "-border)",
                    }}>
                      <strong>{tone === "danger" ? "Error" : tone}</strong>
                      <span>{message}</span>
                    </div>
                  ))}
                  <div className="branding-preview-chart">
                    <strong>Campaign chart</strong>
                    <div className="branding-preview-bars" aria-hidden="true"><i /><i /><i /><i /><i /></div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
        <div className="mt-5"><FormError message={error} /></div>
        <div className="branding-savebar">
          <span role="status">{hasChanges ? "Unsaved changes" : "All changes saved"}</span>
          <Button type="submit" disabled={!hasChanges || saveMutation.isPending || logoBusy}>
            {saveMutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            {saveMutation.isPending ? "Saving..." : isSuperAdmin ? "Save platform branding" : "Save white-label branding"}
          </Button>
        </div>
      </form>
    </div>
  );
}
