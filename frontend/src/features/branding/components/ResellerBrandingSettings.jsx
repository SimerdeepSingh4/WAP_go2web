import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getResellerBranding,
  updateResellerBranding,
  uploadResellerLogo,
  removeResellerLogo,
} from "@/features/branding/services/branding.api.js";
import { useBranding } from "@/features/branding/context/BrandingContext";
import { applyBrandColors } from "@/features/branding/lib/themeHelper";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

export default function ResellerBrandingSettings() {
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
    primaryColor: "",
    secondaryColor: "",
    accentColor: "",
  });
  const [error, setError] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (!branding?.enabled || branding.isExpired) return;
    applyBrandColors(form);
    return () => applyBrandColors(branding);
  }, [form.primaryColor, form.secondaryColor, form.accentColor, branding]);

  useEffect(() => {
    if (branding) {
      setForm({
        subdomain: branding.subdomain || "",
        brandName: branding.brandName || "",
        primaryColor: branding.primaryColor || "",
        secondaryColor: branding.secondaryColor || "",
        accentColor: branding.accentColor || "",
      });
    }
  }, [branding]);

  const saveMutation = useMutation({
    mutationFn: updateResellerBranding,
    onSuccess: (data) => {
      queryClient.setQueryData(["resellerBranding"], data.branding);
      setCustomBranding(data.branding);
      toast.add({
        title: "Branding updated",
        description: "Your custom branding and theme have been saved.",
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
    } finally {
      setUploadingLogo(false);
      event.target.value = "";
    }
  }

  function handleSave(e) {
    e.preventDefault();
    setError("");

    if (form.subdomain && !/^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/i.test(form.subdomain)) {
      setError("Subdomain must be 3-30 lowercase characters, numbers or hyphens.");
      return;
    }

    saveMutation.mutate({
      subdomain: form.subdomain.trim().toLowerCase(),
      brandName: form.brandName.trim(),
      primaryColor: form.primaryColor.trim(),
      secondaryColor: form.secondaryColor.trim(),
      accentColor: form.accentColor.trim(),
    });
  }

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground text-sm gap-2">
        <Loader2 className="size-4 animate-spin" />
        Loading branding settings...
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

  // Keep draft previews local until the existing save action is submitted.
  const currentLogo = branding.logoUrl || "https://res.cloudinary.com/dyfjy8kmv/image/upload/v1793689940/Navy_Blue_Bird_Chat_Logo_n0udpf.webp";
  const previewName = form.brandName.trim() || "Your brand";
  const defaultTheme = !form.primaryColor && !form.secondaryColor && !form.accentColor;
  const previewColor = /^#[0-9a-f]{6}$/i.test(form.primaryColor) ? form.primaryColor : "#00875a";
  const previewSecondary = /^#[0-9a-f]{6}$/i.test(form.secondaryColor) ? form.secondaryColor : "#f5f5f5";
  const channels = previewColor.slice(1).match(/.{2}/g).map(value => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const previewButtonText = luminance > 0.179 ? "#111111" : "#ffffff";
  const previewAddress = `${form.subdomain || "yourbrand"}.yourdomain.com`;
  const logoBusy = uploadingLogo || logoMutation.isPending || removeLogoMutation.isPending;

  return (
    <div className="branding-editor">
      <div className="branding-access">
        <div><Sparkles aria-hidden="true" /><strong>White-label branding</strong><span className="branding-access-dot" aria-hidden="true" /><span>Active</span></div>
        <span>{branding.expiresAt ? `Access expires ${dateTime(branding.expiresAt)}` : "Lifetime access"}</span>
      </div>
      <form onSubmit={handleSave}>
        <div className="branding-grid">
          <div className="branding-fields">
            <section className="branding-section" aria-labelledby="branding-identity-heading">
              <div className="branding-section-header"><span className="branding-section-icon"><ImageIcon aria-hidden="true" /></span><div><h3 id="branding-identity-heading">Brand identity</h3><p>Give your workspace a familiar name and logo.</p></div></div>
              <div className="branding-section-body">
                <div className="branding-field">
                  <label htmlFor="reseller-brand-name">Website name</label>
                  <Input id="reseller-brand-name" placeholder="e.g. Acme Marketing" value={form.brandName} onChange={e => setForm({ ...form, brandName: e.target.value })} maxLength={100} aria-describedby="branding-name-help" />
                  <p id="branding-name-help" className="branding-help">Shown as your website name in the sidebar and browser tab.</p>
                </div>
                <div className="branding-field"><span>Company logo</span>
                  <div className="branding-logo-upload">
                    <div className="branding-logo-image"><img src={currentLogo} alt="Current company logo" /></div>
                    <div className="branding-logo-actions"><div>
                      <Button type="button" variant="outline" size="sm" disabled={logoBusy} onClick={() => document.getElementById("logo-file-input")?.click()}>{logoBusy ? <Loader2 className="animate-spin" /> : <Upload />}{uploadingLogo ? "Uploading…" : "Upload logo"}</Button>
                      {branding.logoUrl && <Button type="button" variant="ghost" size="sm" disabled={logoBusy} onClick={() => removeLogoMutation.mutate()}><Trash2 />Remove</Button>}
                    </div><p className="branding-help">PNG, JPG or WebP, up to 5 MB.<br />Logo uploads and removal take effect immediately.</p></div>
                    <input id="logo-file-input" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Upload company logo" disabled={logoBusy} onChange={handleFileChange} />
                  </div>
                </div>
              </div>
            </section>
            <section className="branding-section" aria-labelledby="branding-address-heading">
              <div className="branding-section-header"><span className="branding-section-icon"><Globe aria-hidden="true" /></span><div><h3 id="branding-address-heading">Workspace address</h3><p>Choose the subdomain your clients will recognize.</p></div></div>
              <div className="branding-section-body"><div className="branding-field">
                <label htmlFor="reseller-subdomain">Subdomain</label>
                <div className="branding-address"><span>https://</span><Input id="reseller-subdomain" placeholder="yourbrand" value={form.subdomain} onChange={e => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} maxLength={30} className="font-mono text-sm focus-visible:ring-0 focus-visible:outline-none" aria-describedby="branding-address-help" /><span>.yourdomain.com</span></div>
                <p id="branding-address-help" className="branding-help">Use 3–30 lowercase letters, numbers or hyphens. The domain shown here is an example.</p>
              </div></div>
            </section>
            <section className="branding-section" aria-labelledby="branding-colors-heading">
              <div className="branding-section-header"><span className="branding-section-icon"><Paintbrush aria-hidden="true" /></span><div><h3 id="branding-colors-heading">Brand colors</h3><p>Add your brand color to buttons and accents.</p></div></div>
              <div className="branding-section-body">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-3">
                  <div><p className="text-xs font-medium">Original theme</p><p className="branding-help">Keep the platform’s default light and dark colors.</p></div>
                  <Button type="button" size="sm" variant="outline" aria-pressed={defaultTheme} disabled={saveMutation.isPending} onClick={() => setForm(previous => ({ ...previous, primaryColor: "", secondaryColor: "", accentColor: "" }))}>{defaultTheme ? <Check /> : <RotateCcw />}{defaultTheme ? "Default theme selected" : "Use default theme"}</Button>
                </div>
                <div className="branding-field"><span id="branding-palette-label">Choose a palette</span><div className="branding-presets" role="group" aria-labelledby="branding-palette-label">
                  {COLOR_PRESETS.map(preset => {
                    const selected = form.primaryColor.toLowerCase() === preset.primary.toLowerCase() && form.secondaryColor.toLowerCase() === preset.secondary.toLowerCase();
                    return <button key={preset.name} type="button" className="branding-preset" aria-pressed={selected} onClick={() => setForm({ ...form, primaryColor: preset.primary, secondaryColor: preset.secondary, accentColor: "" })}><span className="branding-swatch" style={{ background: preset.primary }} /><span>{preset.name}</span>{selected && <Check aria-hidden="true" />}</button>;
                  })}
                </div></div>
                <div className="branding-field"><label htmlFor="reseller-custom-hex">Custom primary color</label><div className="branding-color-input"><input id="reseller-custom-color" type="color" aria-label="Choose primary color" value={previewColor} onChange={e => setForm({ ...form, primaryColor: e.target.value })} /><Input id="reseller-custom-hex" placeholder="#245e59" value={form.primaryColor} onChange={e => setForm({ ...form, primaryColor: e.target.value })} className="font-mono" maxLength={7} /></div><p className="branding-help">Pick a color or enter its hex code.</p></div>
              </div>
            </section>
          </div>
          <aside className="branding-preview" aria-label="Branding preview" style={{ "--preview-primary": previewColor, "--preview-secondary": previewSecondary, "--preview-button-text": previewButtonText }}>
            <div className="branding-preview-heading">Workspace preview<span><span className="branding-access-dot" />Live</span></div>
            <div className="branding-preview-content"><div className="branding-preview-window">
              <div className="branding-preview-browser" aria-hidden="true"><i /><i /><i /><span>{previewAddress}</span><Lock className="size-3 text-muted-foreground" /></div>
              <div className="branding-preview-brand"><img src={currentLogo} alt="" /><strong>{previewName}</strong></div>
              <div className="branding-preview-workspace"><div className="branding-preview-nav"><LayoutDashboard aria-hidden="true" />Overview</div><h4>Your workspace</h4><p className="branding-help">A look at your brand in the dashboard.</p><div className="branding-preview-stat"><span>Available credits</span><strong>12,500</strong><p className="branding-help">Example balance</p></div><div className="branding-preview-action">Create campaign<ArrowRight aria-hidden="true" /></div></div>
            </div></div>
            <p className="branding-help branding-preview-note">Colors preview across your dashboard as you choose. Save changes to keep them.</p>
          </aside>
        </div>
        <div className="mt-5"><FormError message={error} /></div>
        <div className="branding-savebar"><div><strong>Make it your own</strong><p className="branding-help">Save your website name, subdomain and brand colors.</p></div><Button type="submit" disabled={saveMutation.isPending || logoBusy}>{saveMutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}{saveMutation.isPending ? "Saving…" : "Save changes"}</Button></div>
      </form>
    </div>
  );
}
