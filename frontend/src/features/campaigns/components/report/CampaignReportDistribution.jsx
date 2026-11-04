import { Info } from "lucide-react";
import { number, ownerName } from "@/features/admin/lib/format";

export const BUCKET_COLORS = [
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-sky-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-stone-400",
];

export default function CampaignReportDistribution({
  metrics,
  categories,
  isAdmin,
  rate,
  campaign,
  deltaLabel,
}) {
  if (metrics.totalAudience <= 0) return null;

  const barSegments = categories.filter((c) => c.numbers.length > 0);

  return (
    <section className="portal-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          How {number(metrics.totalAudience)} numbers were classified
        </h2>
        {isAdmin && (
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full border ${
              metrics.delta > 0
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : metrics.delta < 0
                ? "bg-rose-50 text-rose-800 border-rose-200"
                : "bg-muted text-muted-foreground border-transparent"
            }`}
          >
            {deltaLabel}
          </span>
        )}
      </div>

      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={barSegments.map((c) => `${c.name}: ${c.numbers.length}`).join(", ")}
      >
        {barSegments.map((c) => (
          <div
            key={c.id}
            className={`${BUCKET_COLORS[categories.indexOf(c) % BUCKET_COLORS.length]} h-full`}
            style={{ width: `${(c.numbers.length / metrics.totalAudience) * 100}%` }}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {barSegments.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5">
            <span
              className={`size-2 rounded-full ${
                BUCKET_COLORS[categories.indexOf(c) % BUCKET_COLORS.length]
              }`}
            />
            {c.name}
            <span className="tabular-nums font-medium text-foreground">
              {number(c.numbers.length)}
            </span>
          </span>
        ))}
      </div>

      {isAdmin && (
        <div className="rounded-lg bg-muted/40 px-4 py-3 text-xs text-muted-foreground leading-relaxed flex gap-2.5">
          <Info className="size-4 shrink-0 mt-px text-muted-foreground/70" />
          <p>
            {number(metrics.refund)} refundable × {rate} credits ={" "}
            <strong className="text-foreground">{number(metrics.uncapped)}</strong>
            {metrics.capped && (
              <> (capped at the {number(metrics.initialCharged)} originally charged)</>
            )}
            . Already refunded: {number(metrics.previousRefund)}. Saving credits{" "}
            <strong className="text-foreground">{ownerName(campaign.userId)}</strong>’s wallet
            with the difference.
          </p>
        </div>
      )}
    </section>
  );
}

