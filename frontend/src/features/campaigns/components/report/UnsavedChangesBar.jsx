import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UnsavedChangesBar({
  isDirty,
  deltaLabel,
  onReset,
  onSave,
  isSaving,
}) {
  if (!isDirty) return null;

  return (
    <div className="sticky bottom-4 z-30">
      <div className="mx-auto max-w-3xl flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 backdrop-blur px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="size-2 rounded-full bg-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Unsaved changes</p>
            <p className="text-xs text-muted-foreground truncate">{deltaLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={isSaving}
            className="text-xs"
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving}
            className="gap-1.5 bg-[#000080] hover:bg-[#000080]/90 text-white font-medium text-xs"
          >
            <ShieldCheck className="size-4" />
            {isSaving ? "Saving…" : "Save & apply"}
          </Button>
        </div>
      </div>
    </div>
  );
}

