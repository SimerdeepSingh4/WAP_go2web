import { ChevronDown } from "lucide-react";
import { number } from "@/lib/format";

export default function OriginalUploadPreview({ numbers = "", count, actions }) {
  return (
    <details className="group overflow-hidden rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-foreground">Original upload</span>
          <span className="text-muted-foreground">{number(count)} {count === 1 ? "number" : "numbers"}</span>
          <span className="hidden text-[10px] text-muted-foreground sm:inline">Read only</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 border-t border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">Original upload order</p>
          {actions}
        </div>
        <textarea
          aria-label="Original uploaded numbers"
          readOnly
          rows={4}
          value={numbers ?? ""}
          spellCheck={false}
          className="block h-28 max-h-48 min-h-20 w-full resize-y overflow-y-auto rounded-lg border border-input bg-muted/20 px-3 py-2 font-mono text-xs leading-6 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          placeholder="No numbers submitted"
        />
      </div>
    </details>
  );
}
