import { Sliders, Search, Plus, Trash2, X, CheckCircle2, RotateCcw, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { number } from "@/lib/format";
import { BUCKET_COLORS } from "./CampaignReportDistribution";

export const CHIP_LIMIT = 48;

function BillingPill({ isRefund, onClick }) {
  const cls = isRefund
    ? "bg-rose-50 text-rose-700 border-rose-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";
  const body = isRefund ? (
    <>
      <RotateCcw className="size-3" /> Refund credit
    </>
  ) : (
    <>
      <CheckCircle2 className="size-3" /> Deduct credit
    </>
  );
  if (!onClick) {
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cls}`}>
        {isRefund ? "Refunded" : "Deducted"}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title="Switch between deduct and refund"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${cls}`}
    >
      {body}
      <ChevronDown className="size-3 opacity-60" />
    </button>
  );
}

export default function CampaignReportBuckets({
  categories,
  isAdmin,
  search,
  onSearchChange,
  onOpenAddModal,
  q,
  rate,
  confirmRemove,
  onSetConfirmRemove,
  onRemoveCategory,
  onToggleBilling,
  expanded,
  onToggleExpanded,
  onRemoveNumber,
  drafts,
  onDraftChange,
  onAddNumbers,
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Sliders className="size-4 text-muted-foreground" />
            Status buckets
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAdmin
              ? "Each bucket decides whether its numbers are billed or refunded."
              : "How each recipient number was billed."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="size-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              type="search"
              inputMode="numeric"
              placeholder="Find a number"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8 h-8 w-44 text-xs"
            />
          </div>
          {isAdmin && (
            <Button size="sm" onClick={onOpenAddModal} className="gap-1.5 text-xs">
              <Plus className="size-3.5" />
              Add category
            </Button>
          )}
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="portal-card py-12 text-center text-sm text-muted-foreground">
          No buckets yet.{isAdmin && " Add a category to start classifying numbers."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {categories.map((cat, ci) => {
            const isRefund = cat.billingAction === "refund";
            const count = cat.numbers.length;
            const matches = q ? cat.numbers.filter((n) => String(n).includes(q)) : cat.numbers;
            const isOpen = !!expanded[cat.id];
            const shown = isOpen ? matches : matches.slice(0, CHIP_LIMIT);
            const dimmed = q && matches.length === 0;

            return (
              <article
                key={cat.id}
                className={`portal-card overflow-hidden flex flex-col transition-opacity ${
                  dimmed ? "opacity-45" : ""
                }`}
              >
                <div className={`h-1 ${BUCKET_COLORS[ci % BUCKET_COLORS.length]}`} />
                <div className="p-4 space-y-3 border-b border-border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate" title={cat.name}>
                        {cat.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                        {number(count)} number{count === 1 ? "" : "s"}
                        {q && ` · ${matches.length} match`}
                      </p>
                    </div>
                    {isAdmin &&
                      (confirmRemove === cat.id ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => onRemoveCategory(cat.id)}
                          >
                            Remove{count ? ` (${count} unassigned)` : ""}
                          </Button>
                          <button
                            type="button"
                            onClick={() => onSetConfirmRemove(null)}
                            className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                            aria-label="Cancel"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            count ? onSetConfirmRemove(cat.id) : onRemoveCategory(cat.id)
                          }
                          className="p-1 rounded text-muted-foreground hover:text-red-600 transition-colors cursor-pointer"
                          title="Remove bucket"
                          aria-label={`Remove ${cat.name}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      ))}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <BillingPill
                      isRefund={isRefund}
                      onClick={isAdmin ? () => onToggleBilling(cat.id) : undefined}
                    />
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        isRefund ? "text-rose-600" : "text-emerald-700"
                      }`}
                    >
                      {isRefund ? "+" : "−"}
                      {number(count * rate)} cr
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-muted/20 flex-1 space-y-3">
                  {matches.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-5 text-center">
                      {q ? "No match in this bucket" : "No numbers in this bucket"}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
                      {shown.map((num) => (
                        <span
                          key={num}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background pl-2 pr-1 py-0.5 font-mono text-[11px] text-foreground"
                        >
                          +{num}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => onRemoveNumber(cat.id, num)}
                              className="rounded p-0.5 text-muted-foreground hover:text-red-600 hover:bg-muted cursor-pointer"
                              aria-label={`Remove +${num}`}
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  {matches.length > CHIP_LIMIT && (
                    <button
                      type="button"
                      onClick={() => onToggleExpanded(cat.id)}
                      className="text-xs text-primary hover:underline cursor-pointer"
                    >
                      {isOpen ? "Show fewer" : `Show all ${number(matches.length)}`}
                    </button>
                  )}

                  {isAdmin && (
                    <div className="flex gap-1.5 pt-3 border-t border-border">
                      <Input
                        type="text"
                        placeholder="Paste numbers to add"
                        value={drafts[cat.id] || ""}
                        onChange={(e) => onDraftChange(cat.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            onAddNumbers(cat.id, drafts[cat.id] || "");
                          }
                        }}
                        className="h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onAddNumbers(cat.id, drafts[cat.id] || "")}
                        disabled={!(drafts[cat.id] || "").trim()}
                        className="h-8 text-xs px-3"
                      >
                        Add
                      </Button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

