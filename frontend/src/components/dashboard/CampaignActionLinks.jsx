import { Copy, ExternalLink, Phone } from "lucide-react";
import { toast } from "@/components/ui/toast";

export default function CampaignActionLinks({ link, phone }) {
  if (!link && !phone) return null;

  async function copyValue(label, value) {
    try {
      await navigator.clipboard.writeText(value);
      toast.add({ title: `${label} copied`, description: value, type: "success" });
    } catch {
      toast.add({ title: "Unable to copy", description: value, type: "error" });
    }
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {link && <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2.5">
        <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 break-all text-xs font-medium text-foreground underline underline-offset-2"
        >
          {link}
        </a>
        <button
          type="button"
          onClick={() => copyValue("Campaign link", link)}
          aria-label="Copy campaign link"
          title="Copy campaign link"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Copy aria-hidden="true" className="size-3.5" />
        </button>
      </div>}
      {phone && <div className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-card px-3 py-2.5">
        <Phone aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <a
          href={`tel:${phone}`}
          className="min-w-0 flex-1 break-all text-xs font-medium text-foreground underline underline-offset-2"
        >
          {phone}
        </a>
        <button
          type="button"
          onClick={() => copyValue("Campaign number", phone)}
          aria-label="Copy campaign number"
          title="Copy campaign number"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Copy aria-hidden="true" className="size-3.5" />
        </button>
      </div>}
    </div>
  );
}
