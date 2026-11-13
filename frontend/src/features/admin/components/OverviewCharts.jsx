import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowUpRight, BarChart3, CircleDot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MotionConfig, useReducedMotion } from "motion/react";
import { curveLinear } from "@visx/curve";
import { Card } from "@/components/ui/card";
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
import { campaignTrend, campaignDistribution, deliveryMetrics } from "../lib/analytics";
import { number } from "../../../lib/format";

const dayLabel = (date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(date);

function ChartData({ rows, label, valueLabel }) {
  return (
    <details className="portal-chart-data">
      <summary>View chart data</summary>
      <div className="portal-chart-table-wrap">
        <table><caption className="sr-only">{label} and {valueLabel}</caption><thead><tr><th scope="col">{label}</th><th scope="col">{valueLabel}</th></tr></thead>
          <tbody>{rows.map(([name, value]) => <tr key={name}><th scope="row">{name}</th><td>{number(value)}</td></tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

function EmptyChart({ children, icon: Icon = BarChart3 }) {
  return <div className="portal-chart-empty"><Icon aria-hidden="true" /><p>{children}</p></div>;
}

export function CampaignCharts({ campaigns = [] }) {
  const [days, setDays] = useState("14");
  const [hovered, setHovered] = useState(null);
  const reducedMotion = useReducedMotion();
  const trend = useMemo(() => campaignTrend(campaigns, Number(days)), [campaigns, days]);
  const distribution = useMemo(() => campaignDistribution(campaigns), [campaigns]);
  const total = trend.reduce((sum, row) => sum + (Number(row.Campaigns) || 0), 0);
  const labels = trend.map((row) => dayLabel(row.date));

  return (
    <MotionConfig reducedMotion="user">
      <div className="admin-charts portal-analytics-grid">
        <Card className="portal-card portal-chart-card">
          <div className="portal-card-heading">
            <div><h3>Campaign activity</h3><p>Created campaigns · drafts excluded</p></div>
            <select aria-label="Chart date range" value={days} onChange={(event) => setDays(event.target.value)} className="portal-range-select">
              {[7, 14, 30].map((range) => <option key={range} value={range}>Last {range} days</option>)}
            </select>
          </div>
          <div className="portal-chart-content">
            <div className="portal-chart-total"><strong>{number(total)}</strong><span>created in the last {days} days</span></div>
            {total > 0 ? (
              <div className="portal-chart-canvas" role="img" aria-label={`${number(total)} campaigns created in the last ${days} days. Exact daily counts are available below.`}>
                <AreaChart data={trend} xDataKey="date" className="h-56 w-full sm:h-64" aspectRatio="auto" animationDuration={reducedMotion ? 0 : 400} margin={{ top: 16, right: 12, bottom: 28, left: 12 }}>
                  <Grid numTicksRows={3} />
                  <Area dataKey="Campaigns" curve={curveLinear} fill="var(--chart-1)" stroke="var(--chart-1)" fillOpacity={0.15} gradientToOpacity={0.02} fadeEdges={false} animate={!reducedMotion} />
                  <XAxis labels={labels} numTicks={4} />
                  <ChartTooltip showDots={false} showDatePill={false} content={({ point }) => <div className="p-3 text-xs"><p className="text-muted-foreground">{dayLabel(point.date)}</p><p className="mt-1 font-semibold">{number(point.Campaigns)} campaigns</p></div>} />
                </AreaChart>
              </div>
            ) : <EmptyChart>No campaigns created during this period.</EmptyChart>}
            <ChartData rows={trend.map((row) => [dayLabel(row.date), row.Campaigns])} label="Date" valueLabel="Campaigns" />
          </div>
        </Card>

        <Card className="portal-card portal-chart-card">
          <div className="portal-card-heading"><div><h3>Campaign status</h3><p>Current recorded status · all time</p></div><CircleDot className="portal-heading-icon" aria-hidden="true" /></div>
          <div className="portal-chart-content">
            {distribution.length ? (
              <div className="portal-distribution">
                <div className="portal-donut" role="img" aria-label={`Status distribution for ${number(campaigns.length)} campaigns. Counts are listed below.`}>
                  <PieChart data={distribution} size={200} innerRadius={72} padAngle={0.025} cornerRadius={3} hoveredIndex={hovered} onHoverChange={setHovered} hoverOffset={3}>
                    {distribution.map((item, index) => <PieSlice key={item.status} index={index} animate={!reducedMotion} showGlow={false} />)}
                    <PieCenter defaultLabel="Campaigns">{({ value, label }) => <div className="text-center"><p className="text-2xl font-semibold tabular-nums">{number(value)}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>}</PieCenter>
                  </PieChart>
                </div>
                <ul className="portal-chart-legend">
                  {distribution.map((item) => <li key={item.status}><span className="portal-legend-dot" style={{ backgroundColor: item.color }} aria-hidden="true" /><span>{item.status}</span><strong>{number(item.value)}</strong></li>)}
                </ul>
              </div>
            ) : <EmptyChart icon={CircleDot}>No campaigns available to summarize.</EmptyChart>}
            <ChartData rows={distribution.map((item) => [item.status, item.value])} label="Status" valueLabel="Campaigns" />
          </div>
        </Card>
      </div>
    </MotionConfig>
  );
}

export function DeliveryChart({ campaigns = [] }) {
  const reducedMotion = useReducedMotion();
  const { rows, reportCount } = useMemo(() => deliveryMetrics(campaigns), [campaigns]);
  return (
    <MotionConfig reducedMotion="user">
      <Card className="admin-charts portal-card portal-chart-card">
        <div className="portal-card-heading">
          <div><h3>Published results</h3><p>{number(reportCount)} of {number(campaigns.length)} campaigns reported</p></div>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/admin/reports?status=published" />}>Reports<ArrowUpRight aria-hidden="true" /></Button>
        </div>
        <div className="portal-chart-content">
          {reportCount > 0 ? (
            <>
              <dl className="portal-delivery-metrics">{rows.map((row) => <div key={row.name}><dt>{row.name}</dt><dd>{number(row.Messages)}</dd></div>)}</dl>
              <div className="portal-chart-canvas" role="img" aria-label="Message totals from published reports. Exact counts are available below.">
                <BarChart data={rows} xDataKey="name" className="h-44 w-full" aspectRatio="auto" barGap={0.5} animationDuration={reducedMotion ? 0 : 400} margin={{ top: 12, right: 4, bottom: 26, left: 4 }}>
                  <Grid numTicksRows={3} strokeDasharray="3,4" fadeHorizontal={false} />
                  <Bar dataKey="Messages" fill="var(--chart-1)" lineCap={4} animate={!reducedMotion} />
                  <BarXAxis />
                  <ChartTooltip showDots={false} showDatePill={false} content={({ point }) => <div className="p-3 text-xs"><p className="text-muted-foreground">{point.name}</p><p className="mt-1 font-semibold">{number(point.Messages)} messages</p></div>} />
                </BarChart>
              </div>
              <p className="portal-chart-note">Sent, delivered, and read are overlapping stages.</p>
              <ChartData rows={rows.map((row) => [row.name, row.Messages])} label="Stage" valueLabel="Messages" />
            </>
          ) : <EmptyChart>Publish a campaign report to see delivery totals.</EmptyChart>}
        </div>
      </Card>
    </MotionConfig>
  );
}
