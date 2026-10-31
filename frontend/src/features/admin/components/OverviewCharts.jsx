import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotionConfig, useReducedMotion } from "motion/react";
import { curveLinear } from "@visx/curve";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart } from "@/components/charts/area-chart";
import { Area } from "@/components/charts/area";
import { XAxis } from "@/components/charts/x-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip/chart-tooltip";
import { BarChart } from "@/components/charts/bar-chart";
import { Bar } from "@/components/charts/bar";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { PieChart } from "@/components/charts/pie-chart";
import { PieSlice } from "@/components/charts/pie-slice";
import { PieCenter } from "@/components/charts/pie-center";
import { FilterSelect } from "./shared";
import { campaignTrend, campaignDistribution, deliveryMetrics } from "../lib/analytics";
import { number } from "../lib/format";

const dayLabel = (date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(date);

function ChartData({ rows, label, valueLabel }) {
  return <details className="mt-3 text-xs"><summary className="w-fit cursor-pointer rounded-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">View chart data</summary><div className="mt-3 max-h-48 overflow-auto"><table className="w-full text-left tabular-nums"><caption className="sr-only">{label}</caption><thead><tr className="border-b"><th scope="col" className="pb-2 font-medium">{label}</th><th scope="col" className="pb-2 text-right font-medium">{valueLabel}</th></tr></thead><tbody>{rows.map(([name, value]) => <tr key={name} className="border-b last:border-0"><th scope="row" className="py-2 font-normal">{name}</th><td className="py-2 text-right">{number(value)}</td></tr>)}</tbody></table></div></details>;
}

export function CampaignCharts({ campaigns }) {
  const [days, setDays] = useState("14");
  const [hovered, setHovered] = useState(null);
  const reducedMotion = useReducedMotion();
  const trend = useMemo(() => campaignTrend(campaigns, Number(days)), [campaigns, days]);
  const distribution = useMemo(() => campaignDistribution(campaigns), [campaigns]);
  const total = trend.reduce((sum, row) => sum + row.Campaigns, 0);
  const labels = trend.map((row) => dayLabel(row.date));

  return <MotionConfig reducedMotion="user"><div className="admin-charts grid min-w-0 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <Card className="min-w-0 gap-4 rounded-lg shadow-none">
      <CardHeader className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Campaign activity</CardTitle><p className="mt-1 text-xs text-muted-foreground">{number(total)} campaigns created · excludes drafts</p></div><FilterSelect label="Chart date range" value={days} onChange={setDays} options={[7, 14, 30].map((days) => ({ value: String(days), label: `Last ${days} days` }))} /></CardHeader>
      <CardContent className="min-w-0">
        {total ? <div role="img" aria-label={`${number(total)} campaigns created in the last ${days} days. Exact daily counts are available below.`}>
          <AreaChart data={trend} xDataKey="date" className="h-56 w-full" aspectRatio="auto" animationDuration={reducedMotion ? 0 : 500} margin={{ top: 16, right: 12, bottom: 28, left: 12 }}>
            <Grid numTicksRows={3} />
            <Area dataKey="Campaigns" curve={curveLinear} fill="#ea580c" stroke="#ea580c" fillOpacity={0.15} gradientToOpacity={0.05} fadeEdges={false} animate={!reducedMotion} />
            <XAxis labels={labels} numTicks={4} />
            <ChartTooltip showDots={false} showDatePill={false} content={({ point }) => <div className="p-3 text-xs"><p className="text-muted-foreground">{dayLabel(point.date)}</p><p className="mt-1 font-medium">{number(point.Campaigns)} campaigns</p></div>} />
          </AreaChart>
        </div> : <div className="flex h-56 items-center justify-center rounded-md bg-muted/40 px-4 text-center text-sm text-muted-foreground">No campaigns created during this period.</div>}
        <ChartData rows={trend.map((row) => [dayLabel(row.date), row.Campaigns])} label="Date" valueLabel="Campaigns" />
      </CardContent>
    </Card>
    <Card className="min-w-0 gap-4 rounded-lg shadow-none"><CardHeader><CardTitle>Campaign status</CardTitle><p className="mt-1 text-xs text-muted-foreground">Current recorded status · all time</p></CardHeader><CardContent>
      {distribution.length ? <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
        <div role="img" aria-label={`Status distribution for ${number(campaigns.length)} campaigns. Counts are listed alongside.`}>
          <PieChart data={distribution} size={208} innerRadius={70} padAngle={0.025} cornerRadius={3} hoveredIndex={hovered} onHoverChange={setHovered} hoverOffset={3}>
            {distribution.map((item, index) => <PieSlice key={item.status} index={index} animate={!reducedMotion} showGlow={false} />)}
            <PieCenter defaultLabel="Campaigns">{({ value, label }) => <div className="text-center"><p className="text-2xl font-semibold tabular-nums">{number(value)}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>}</PieCenter>
          </PieChart>
        </div>
        <ul className="space-y-1.5 text-xs">{distribution.map((item) => <li key={item.status} className="flex items-center gap-2"><span className="size-2.5 rounded-xs shrink-0" style={{ backgroundColor: item.color }} aria-hidden="true" /><span className="text-muted-foreground">{item.status}:</span><strong className="tabular-nums font-semibold">{number(item.value)}</strong></li>)}</ul>
      </div> : <div className="flex h-52 items-center justify-center rounded-md bg-muted/40 px-4 text-center text-sm text-muted-foreground">No campaigns available to summarize.</div>}
      <ChartData rows={distribution.map((item) => [item.status, item.value])} label="Status" valueLabel="Campaigns" />
    </CardContent></Card>
  </div></MotionConfig>;
}

export function DeliveryChart({ campaigns }) {
  const reducedMotion = useReducedMotion();
  const { rows, reportCount } = useMemo(() => deliveryMetrics(campaigns), [campaigns]);
  return <MotionConfig reducedMotion="user"><Card className="admin-charts min-w-0 gap-4 rounded-lg shadow-none"><CardHeader className="flex flex-row items-start justify-between gap-3"><div><CardTitle>Published results</CardTitle><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{number(reportCount)} of {number(campaigns.length)} campaigns reported</p></div><Button variant="ghost" size="sm" render={<Link to="/admin/reports?status=published" />}>Reports<ArrowRight /></Button></CardHeader><CardContent>
    {reportCount > 0 && <dl className="mb-4 grid grid-cols-4 divide-x rounded-md border bg-muted/40 py-3">{rows.map((row) => <div key={row.name} className="min-w-0 px-2 text-center"><dt className="text-xs text-muted-foreground">{row.name}</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums tracking-tight">{number(row.Messages)}</dd></div>)}</dl>}
    {reportCount ? <><div role="img" aria-label="Message totals from published reports. Sent, delivered, and read are overlapping stages, not separate audiences. Exact counts are available below.">
      <BarChart data={rows} xDataKey="name" className="h-40 w-full" aspectRatio="auto" barGap={0.5} animationDuration={reducedMotion ? 0 : 500} margin={{ top: 8, right: 4, bottom: 26, left: 4 }}>
        <Grid numTicksRows={3} strokeDasharray="3,4" fadeHorizontal={false} />
        <Bar dataKey="Messages" fill="#ea580c" lineCap={4} animate={!reducedMotion} />
        <BarXAxis />
        <ChartTooltip showDots={false} showDatePill={false} content={({ point }) => <div className="p-3 text-xs"><p className="text-muted-foreground">{point.name}</p><p className="mt-1 font-medium">{number(point.Messages)} messages</p></div>} />
      </BarChart>
    </div></> : <div className="rounded-md bg-muted/40 p-5 text-sm leading-relaxed text-muted-foreground">No published results yet. Publish a campaign report to see delivery totals.</div>}
  </CardContent></Card></MotionConfig>;
}
