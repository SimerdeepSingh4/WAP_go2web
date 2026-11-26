import { useState } from "react";
import { Check, Copy, Eye, EyeOff, KeyRound, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useBranding } from "@/features/branding/context/branding-context";
import { buildCredentialsShareText, buildWhatsAppShareUrl } from "../lib/accountCredentials";

export default function AccountCredentialsShareDialog({ credentials, onClose }) {
  const { branding } = useBranding();
  const [showPassword, setShowPassword] = useState(true);
  const [copied, setCopied] = useState(false);

  const brandName = branding?.brandName || "Promotion";
  const loginUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "/login";
  const shareText = buildCredentialsShareText({
    brandName,
    loginUrl,
    username: credentials.username,
    email: credentials.email,
    password: credentials.password,
    isReset: credentials.isReset,
  });
  const whatsappUrl = buildWhatsAppShareUrl(credentials.phone, shareText);

  async function copyCredentials() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      toast.add({ title: "Login details copied", type: "success" });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.add({ title: "Could not copy automatically", description: "Select and copy the details manually.", type: "error" });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose?.(); }}>
      <DialogContent className="action-dialog max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4 text-primary" aria-hidden="true" />
            {credentials.isReset ? "Share updated password" : "Share login credentials"}
          </DialogTitle>
          <DialogDescription>
            Copy or send these login details to the user now. For security, the password cannot be viewed again once you close this window.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <dl className="rounded-xl border border-border bg-muted/40 p-3.5 text-xs space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground shrink-0">Login URL</dt>
              <dd className="font-mono text-foreground truncate">{loginUrl}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground shrink-0">Username</dt>
              <dd className="font-medium text-foreground truncate">{credentials.username}</dd>
            </div>
            {credentials.email && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground shrink-0">Email</dt>
                <dd className="text-foreground truncate">{credentials.email}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/70">
              <dt className="text-muted-foreground shrink-0">Password</dt>
              <dd className="flex items-center gap-1.5 min-w-0">
                <span className="font-mono font-semibold text-foreground select-all truncate">
                  {showPassword ? credentials.password : "••••••••••••"}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-3.5" aria-hidden="true" /> : <Eye className="size-3.5" aria-hidden="true" />}
                </button>
              </dd>
            </div>
          </dl>

          {!whatsappUrl && (
            <p className="text-[11px] text-muted-foreground">
              Add a phone number (with country code) to this account to share directly via WhatsApp.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={copyCredentials}>
              {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
              {copied ? "Copied" : "Copy details"}
            </Button>
            {whatsappUrl && (
              <Button
                type="button"
                variant="outline"
                nativeButton={false}
                render={<a href={whatsappUrl} target="_blank" rel="noopener noreferrer" />}
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                Send on WhatsApp
              </Button>
            )}
            <Button type="button" onClick={() => onClose?.()}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
