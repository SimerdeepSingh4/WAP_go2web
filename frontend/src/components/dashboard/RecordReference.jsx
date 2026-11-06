import { Copy } from "lucide-react";
import { toast } from "@/components/ui/toast";

export default function RecordReference({ id, label, prefix, compact = false }) {
  if (!id) return <span className="text-muted-foreground">Unavailable</span>;

  // Extract raw identifier without prefix (e.g. CMP-6AED5E2D12530EC8860F914B -> 6AED5E2D12530EC8860F914B)
  const rawHash = prefix && id.toUpperCase().startsWith(`${prefix.toUpperCase()}-`)
    ? id.slice(prefix.length + 1)
    : id;

  // Short ID uses 6 uppercase characters (e.g. CMP-0F914B)
  const shortSegment = rawHash.length > 6 ? rawHash.slice(-6).toUpperCase() : rawHash.toUpperCase();
  const display = compact ? (prefix ? `${prefix}-${shortSegment}` : shortSegment) : id;

  async function copy() {
    try {
      await navigator.clipboard.writeText(id);
      toast.add({ title: `${label} copied`, description: id, type: "success" });
    } catch {
      toast.add({ title: "Unable to copy", description: id, type: "error" });
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <span title={`Full ${label}: ${id}`} className="break-all font-mono text-xs select-all">
        {display}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()} ${id}`}
        title={`Copy full ${label.toLowerCase()} (${id})`}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Copy className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
