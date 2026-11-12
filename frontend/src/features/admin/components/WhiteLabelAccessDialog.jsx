import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateWhiteLabelAccess } from "@/features/branding/branding.api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { FormError } from "@/features/admin/components/shared";
import { Sparkles, Calendar, Check, Globe, AlertCircle, Clock } from "lucide-react";
import { dateTime } from "@/features/admin/lib/format";

export default function WhiteLabelAccessDialog({ open, onClose, account, onSuccess }) {
  const queryClient = useQueryClient();
  const currentWl = account?.whiteLabel || {};

  const [enabled, setEnabled] = useState(Boolean(currentWl.enabled));
  const [expiryPreset, setExpiryPreset] = useState(() => {
    if (!currentWl.enabled || !currentWl.expiresAt) return "never";
    return "custom";
  });
  const [customDate, setCustomDate] = useState(() => {
    if (currentWl.expiresAt) {
      try {
        return new Date(currentWl.expiresAt).toISOString().slice(0, 10);
      } catch {
        return "";
      }
    }
    return "";
  });
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: (payload) => updateWhiteLabelAccess(account._id, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["adminAccounts"] });
      toast.add({
        title: enabled ? "White-label access granted" : "White-label access revoked",
        description: data.message,
        type: "success",
      });
      onSuccess?.();
      onClose();
    },
    onError: (err) => {
      setError(err.message || "Failed to update white-label access.");
    },
  });

  function calculateExpiryDate() {
    if (!enabled) return null;
    const now = new Date();
    if (expiryPreset === "never") return null;
    if (expiryPreset === "30days") {
      const d = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      return d.toISOString();
    }
    if (expiryPreset === "90days") {
      const d = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      return d.toISOString();
    }
    if (expiryPreset === "6months") {
      const d = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000);
      return d.toISOString();
    }
    if (expiryPreset === "1year") {
      const d = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      return d.toISOString();
    }
    if (expiryPreset === "custom") {
      if (!customDate) return null;
      const d = new Date(customDate);
      d.setUTCHours(23, 59, 59, 999);
      return d.toISOString();
    }
    return null;
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (enabled && expiryPreset === "custom" && !customDate) {
      setError("Please select a custom expiry date or choose a preset.");
      return;
    }

    const expiresAt = calculateExpiryDate();
    mutation.mutate({ enabled, expiresAt });
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md gap-5">
        <DialogHeader className="pr-6">
          <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase mb-1">
            <Sparkles className="size-4" />
            White-Label Management
          </div>
          <DialogTitle>White-Label Access for {account?.username}</DialogTitle>
          <DialogDescription>
            Grant this reseller permission to configure their custom subdomain, logo, and brand theme.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Toggle Access Switch */}
          <div className="flex items-center justify-between rounded-xl border border-border p-3.5 bg-card">
            <div>
              <p className="text-sm font-medium text-foreground">White-Label Access</p>
              <p className="text-xs text-muted-foreground">
                {enabled ? "Reseller can customize their brand & subdomain." : "Custom branding is disabled."}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                enabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Expiry Selector (shown only when enabled) */}
          {enabled && (
            <div className="rounded-xl border border-border p-3.5 bg-card space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" />
                <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  White-Label Access Expiry
                </label>
              </div>

              {/* Preset Buttons */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "30days", label: "30 Days" },
                  { id: "90days", label: "90 Days" },
                  { id: "6months", label: "6 Months" },
                  { id: "1year", label: "1 Year" },
                  { id: "never", label: "No Expiry" },
                  { id: "custom", label: "Custom Date" },
                ].map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant={expiryPreset === preset.id ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-xs font-medium"
                    onClick={() => {
                      setExpiryPreset(preset.id);
                      setError("");
                    }}
                  >
                    {expiryPreset === preset.id && <Check className="size-3 mr-1" />}
                    {preset.label}
                  </Button>
                ))}
              </div>

              {/* Custom Date Input */}
              {expiryPreset === "custom" && (
                <div className="space-y-1.5 pt-1">
                  <label htmlFor="custom-wl-expiry" className="text-xs text-muted-foreground">
                    Select Expiry Date:
                  </label>
                  <Input
                    id="custom-wl-expiry"
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={customDate}
                    onChange={(e) => {
                      setCustomDate(e.target.value);
                      setError("");
                    }}
                    className="h-9 text-xs"
                    required
                  />
                </div>
              )}

              {/* Status Note */}
              <div className="text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/50">
                {expiryPreset === "never" ? (
                  <span>Access will remain active until manually revoked.</span>
                ) : (
                  <span>
                    When this expires, the reseller's custom branding will automatically revert to default platform theme until renewed.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Subdomain Preview info if already set */}
          {currentWl.subdomain && (
            <div className="rounded-xl border border-border/70 p-3 bg-muted/20 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Globe className="size-3.5" />
                Configured Subdomain:
              </span>
              <span className="font-mono font-semibold text-foreground">
                {currentWl.subdomain}
              </span>
            </div>
          )}

          <FormError message={error} />

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : "Save White-Label Access"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

