import { AreaChart, Area, XAxis, Grid, ReferenceArea, ChartTooltip } from "@/components/charts";
import { curveNatural } from "d3-shape";

// Sample time-series data matching the visual style in the preview
const DEFAULT_CHART_DATA = [
  { date: new Date("2026-10-01"), revenue: 11200, costs: 7800, desktop: 112, mobile: 78 },
  { date: new Date("2026-10-03"), revenue: 12800, costs: 8200, desktop: 128, mobile: 82 },
  { date: new Date("2026-10-05"), revenue: 9500, costs: 6900, desktop: 95, mobile: 69 },
  { date: new Date("2026-10-07"), revenue: 14100, costs: 9400, desktop: 141, mobile: 94 },
  { date: new Date("2026-10-09"), revenue: 13200, costs: 8900, desktop: 132, mobile: 89 },
  { date: new Date("2026-10-11"), revenue: 15600, costs: 10200, desktop: 156, mobile: 102 },
  { date: new Date("2026-10-13"), revenue: 14800, costs: 9800, desktop: 148, mobile: 98 },
  { date: new Date("2026-10-15"), revenue: 17200, costs: 11500, desktop: 172, mobile: 115 },
  { date: new Date("2026-10-16"), revenue: 17200, costs: 12100, desktop: 172, mobile: 121 },
  { date: new Date("2026-10-18"), revenue: 16500, costs: 11200, desktop: 165, mobile: 112 },
  { date: new Date("2026-10-20"), revenue: 18400, costs: 12600, desktop: 184, mobile: 126 },
  { date: new Date("2026-10-22"), revenue: 17900, costs: 11900, desktop: 179, mobile: 119 },
  { date: new Date("2026-10-24"), revenue: 19800, costs: 13400, desktop: 198, mobile: 134 },
  { date: new Date("2026-10-26"), revenue: 19200, costs: 12800, desktop: 192, mobile: 128 },
  { date: new Date("2026-10-28"), revenue: 21500, costs: 14200, desktop: 215, mobile: 142 },
  { date: new Date("2026-10-31"), revenue: 22800, costs: 15100, desktop: 228, mobile: 151 },
];

export default function CampaignPerformanceChart({
  title = "Analytics & Performance",
  data = DEFAULT_CHART_DATA,
  primaryKey = "revenue",
  primaryLabel = "Revenue",
  secondaryKey = "costs",
  secondaryLabel = "Costs",
  y1 = 14000,
  y2 = 19000,
}) {
  return (
    <div className="w-full rounded-2xl bg-card p-6 text-foreground border border-border shadow-sm space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2">
        <div>
          <h3 className="text-base font-bold tracking-tight text-foreground">
            {title}
          </h3>
          <p className="text-xs text-muted-foreground">
            Real-time delivery & dispatch trends
          </p>
        </div>

        {/* Action pills */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-accent border border-border text-xs text-accent-foreground">
            <span className="size-2 rounded-full bg-[var(--chart-1)] animate-pulse" />
            <span>{primaryLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-secondary border border-border text-xs text-secondary-foreground">
            <span className="size-2 rounded-full bg-[var(--chart-2)]" />
            <span>{secondaryLabel}</span>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="relative w-full h-[320px]">
        <AreaChart
          data={data}
          animationDuration={1100}
          animationEasing="cubic-bezier(0.85, 0, 0.15, 1)"
          className="h-full"
        >
          {/* Subtle Horizontal Grid */}
          <Grid horizontal stroke="var(--chart-grid)" strokeDasharray="3 3" />

          {/* Reference Target Range Band */}
          <ReferenceArea
            y1={y1}
            y2={y2}
            fill="color-mix(in oklch, var(--chart-foreground-muted) 15%, transparent)"
            fillOpacity={1}
            pattern="none"
            patternColor="var(--chart-foreground-muted)"
            stroke="var(--chart-grid)"
            strokeStyle="dashed"
            strokeDasharray="4,4"
            fadeEdges={true}
            fadeEdgesLength={10}
            axisLabelColor="var(--chart-1)"
            showMarkers={true}
            markerColor="var(--chart-1)"
            yAxisId="left"
          />

          {/* Primary Curve (Purple / Blue neon) */}
          <Area
            dataKey={primaryKey}
            curve={curveNatural}
            fill="var(--chart-1)"
            fillOpacity={0.25}
            stroke="var(--chart-1)"
            strokeWidth={2.5}
            fadeEdges={true}
            gradientToOpacity={0}
            showLine={true}
            showHighlight={true}
          />

          {/* Secondary Curve (Gold / Yellow amber) */}
          <Area
            dataKey={secondaryKey}
            fill="var(--chart-2)"
            curve={curveNatural}
            fillOpacity={0.25}
            stroke="var(--chart-2)"
            strokeWidth={2.5}
            fadeEdges={true}
            gradientToOpacity={0}
            showLine={true}
            showHighlight={true}
          />

          {/* Minimal Dates X-Axis */}
          <XAxis />

          {/* Floating Dark Interactive Tooltip */}
          <ChartTooltip />
        </AreaChart>
      </div>
    </div>
  );
}

