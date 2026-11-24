import { Copy } from "lucide-react";
import { Link } from "react-router";
import { toast } from "@/components/ui/toast";

export default function RecordReference({ id, label, prefix, compact = false, to, length = 6, noWrap = false }) {
  if (!id) return <span className="text-muted-foreground">Unavailable</span>;

  // Extract raw identifier without prefix (e.g. CMP-6AED5E2D12530EC8860F914B -> 6AED5E2D12530EC8860F914B)
  const rawHash = prefix && id.toUpperCase().startsWith(`${prefix.toUpperCase()}-`)
    ? id.slice(prefix.length + 1)
    : id;

  // Short ID uses uppercase characters (e.g. CMP-0F914B)
  const shortSegment = rawHash.length > length ? rawHash.slice(-length).toUpperCase() : rawHash.toUpperCase();
  const display = compact ? (prefix ? `${prefix}-${shortSegment}` : shortSegment) : id;
  const wrapClass = noWrap ? "whitespace-nowrap" : "break-all";

  async function copy(event) {
    event?.preventDefault();
    event?.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      toast.add({ title: `${label} copied`, description: id, type: "success" });
    } catch {
      toast.add({ title: "Unable to copy", description: id, type: "error" });
    }
  }

  const content = (
    <span title={`Full ${label}: ${id}`} className={`${wrapClass} font-mono text-xs select-all`}>
      {display}
    </span>
  );

  return (
    <div className="flex min-w-0 items-center gap-1">
      {to ? (
        <Link
          to={to}
          title={`Open ${label.toLowerCase()} ${id}`}
          className={`${wrapClass} font-mono text-xs font-medium hover:underline text-foreground`}
        >
          {display}
        </Link>
      ) : (
        content
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${label.toLowerCase()} ${id}`}
        title={`Copy full ${label.toLowerCase()} (${id})`}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Copy className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
