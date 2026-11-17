import { CheckCircle2, RotateCcw, Coins } from "lucide-react";
import { number } from "@/lib/format";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";

export default function CampaignReportMetrics({ metrics }) {
  const reach = metrics.totalAudience > 0
    ? Math.round((metrics.deduct / metrics.totalAudience) * 100)
    : 0;

  return <OverviewMetricCards label="Report summary" items={[
    { label: "Delivered (billed)", value: metrics.deduct, caption: `${reach}% confirmed reach`, icon: CheckCircle2, accent: true },
    { label: "Failed (refunded)", value: metrics.refund, caption: `${number(metrics.targetRefund)} credits back`, icon: RotateCcw },
    { label: "Initially charged", value: metrics.initialCharged, caption: "Upfront deduction", icon: Coins },
    { label: "Net credits used", value: metrics.net, caption: "After refunds", icon: Coins },
  ]} />;
}

