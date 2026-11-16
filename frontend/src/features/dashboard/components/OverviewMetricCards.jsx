import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { number } from "@/lib/format";
import "./overview-metrics.css";

function MetricArtwork() {
  return <svg aria-hidden="true" viewBox="0 0 160 160" focusable="false" className="overview-metric-art pointer-events-none absolute bottom-0 right-0 w-[36%]">
    <circle cx="166" cy="164" r="146" fill="currentColor" opacity=".07" />
    <circle cx="166" cy="164" r="112" fill="currentColor" opacity=".04" />
    <circle cx="166" cy="164" r="112" fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="1" vectorEffect="non-scaling-stroke" />
  </svg>;
}

export default function OverviewMetricCards({ items, label = "Dashboard summary", columns = 4 }) {
  return <section className="overview-metrics" aria-label={label} style={{ "--overview-columns": columns }}>
    {items.map(({ label: title, value, caption, icon: Icon, path, accent, tone, loading }) => {
      const content = <>
        <div className="overview-metric-heading"><span>{title}</span><span className="overview-metric-icon"><Icon aria-hidden="true" /></span></div>
        <p className="overview-metric-value" aria-busy={loading || undefined}>{loading ? <span className="overview-metric-skeleton" aria-label={`Loading ${title}`} /> : value == null ? "—" : typeof value === "number" ? number(value) : value}</p>
        <div className="overview-metric-footer"><span>{caption}</span>{path && <ArrowRight aria-hidden="true" />}</div>
      </>;
      return <article key={title} className="overview-metric-card" data-featured={accent || undefined} data-tone={accent ? undefined : tone}>
        <MetricArtwork />
        {path ? <Link className="overview-metric-content" to={path}>{content}</Link> : <div className="overview-metric-content">{content}</div>}
      </article>;
    })}
  </section>;
}
