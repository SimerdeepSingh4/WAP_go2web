import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import AnimatedMetricValue from "./AnimatedMetricValue";
import "./overview-metrics.css";

export function OverviewMetricCard({ label, value, caption, icon: Icon, path, accent = false, tone, loading, valueSize, signDisplay, valueSuffix, className = "" }) {
  // Navigation gets an arrow; informational cards retain their metric icon.
  const Indicator = path ? ArrowUpRight : Icon;
  const content = <>
    <div className="overview-metric-heading">
      <span>{label}</span>
      {Indicator && <span className="overview-metric-icon"><Indicator aria-hidden="true" /></span>}
    </div>
    <p className="overview-metric-value" data-size={valueSize} aria-busy={loading || undefined}>
      {loading ? <span role="status" className="overview-metric-skeleton"><span className="sr-only">Loading {label}</span></span> : value == null || (typeof value === "number" && !Number.isFinite(value)) ? "—" : typeof value === "number" ? <AnimatedMetricValue value={value} signDisplay={signDisplay} /> : value}
      {!loading && value != null && valueSuffix && <span className="overview-metric-value-suffix"> {valueSuffix}</span>}
    </p>
    {caption && <div className="overview-metric-footer">{caption}</div>}
  </>;

  return <article className={`overview-metric-card ${className}`} data-featured={accent || undefined} data-tone={tone}>
    {path ? <Link className="overview-metric-content" to={path}>{content}</Link> : <div className="overview-metric-content">{content}</div>}
  </article>;
}

export default function OverviewMetricCards({ items, label = "Dashboard summary", columns = 4, className = "" }) {
  return <section className={`overview-metrics ${className}`} aria-label={label} style={{ "--overview-columns": columns }}>
    {items.map(item => <OverviewMetricCard key={item.label} {...item} />)}
  </section>;
}
