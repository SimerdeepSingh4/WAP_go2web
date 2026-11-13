import { CheckCircle2, RotateCcw, Coins } from "lucide-react";
import { number } from "@/lib/format";

function Metric({ icon: Icon, label, hint, tone, children }) {
  return (
    <div className="portal-card p-4 flex gap-3.5">
      <div className={`size-10 shrink-0 rounded-lg flex items-center justify-center ${tone}`}>
        <Icon className="size-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-0.5 text-xl font-semibold tracking-tight text-foreground tabular-nums">{children}</p>
        <p className="mt-0.5 text-xs text-muted-foreground truncate">{hint}</p>
      </div>
    </div>
  );
}

export default function CampaignReportMetrics({ metrics }) {
  const reach =
    metrics.totalAudience > 0
      ? Math.round((metrics.deduct / metrics.totalAudience) * 100)
      : 0;

  return (
    <section className="portal-metrics" aria-label="Report summary">
      <Metric
        icon={CheckCircle2}
        tone="bg-emerald-50 text-emerald-700"
        label="Delivered (billed)"
        hint={`${reach}% confirmed reach`}
      >
        {number(metrics.deduct)}
      </Metric>
      <Metric
        icon={RotateCcw}
        tone="bg-rose-50 text-rose-700"
        label="Failed (refunded)"
        hint={`${number(metrics.targetRefund)} credits back`}
      >
        {number(metrics.refund)}
      </Metric>
      <Metric
        icon={Coins}
        tone="bg-amber-50 text-amber-700"
        label="Initially charged"
        hint="Upfront deduction"
      >
        {number(metrics.initialCharged)}
      </Metric>
      <Metric
        icon={Coins}
        tone="bg-blue-50 text-blue-700"
        label="Net credits used"
        hint="After refunds"
      >
        {number(metrics.net)}
      </Metric>
    </section>
  );
}

