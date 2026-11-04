import { AlertTriangle, CheckCircle2, Copy, Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { number } from "@/features/admin/lib/format";

export default function FilterRecipientsDialog({ open, onOpenChange, preview, onApply }) {
  const excluded = preview ? preview.wrongCount + preview.duplicateCount + preview.nonWhatsAppCount : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[420px]">
        <DialogHeader className="px-5 pt-5 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Filter className="size-4 text-primary" /> Clean up recipients
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Keep the first valid number and separate wrong numbers and repeat entries.
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-3 rounded-xl border border-primary/10 bg-primary/5 p-4">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-background text-primary">
                <CheckCircle2 className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">{number(preview.cleanCount)} <span className="text-sm font-medium">clean numbers</span></p>
                <p className="mt-0.5 text-xs text-muted-foreground">of {number(preview.updatedEntries.length)} entries checked</p>
              </div>
            </div>
            <div className="divide-y divide-border rounded-xl border border-border px-3.5">
              {[
                { label: "Wrong numbers", detail: "Invalid format or already marked wrong", count: preview.wrongCount, icon: AlertTriangle },
                { label: "Duplicates", detail: "Extra occurrences of the same number", count: preview.duplicateCount, icon: Copy },
                ...(preview.nonWhatsAppCount > 0 ? [{ label: "Non-WhatsApp", detail: "Confirmed by delivery records", count: preview.nonWhatsAppCount, icon: Filter }] : []),
              ].map(({ label, detail, count, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3 py-3">
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground">{label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{detail}</p>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums ${count ? "text-destructive" : "text-muted-foreground"}`}>{number(count)}</span>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {excluded ? `${number(excluded)} entries will be excluded from the clean list and kept in their own categories for the report.` : "No wrong or duplicate numbers found. Your list is already clean."}
            </p>
            {preview.netCreditDelta !== 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs">
                <RotateCcw className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <p className="leading-relaxed text-muted-foreground">
                  On save: <strong className="font-medium text-foreground">{number(Math.abs(preview.netCreditDelta))} credits {preview.netCreditDelta > 0 ? "refunded" : "debited"}</strong>, including your pending changes.
                </p>
              </div>
            )}
          </div>
        )}
        <DialogFooter className="m-0 rounded-none bg-muted/30 px-5 py-4">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" size="sm" onClick={onApply} disabled={!preview?.updatedEntries.length}>
            {excluded ? "Apply filter" : "View clean numbers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
