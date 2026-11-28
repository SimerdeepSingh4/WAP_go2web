import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import AnimatedMetricValue from "./AnimatedMetricValue";
import "./overview-metrics.css";

export function OverviewMetricCard({ label, value, caption, icon: Icon, path, accent = false, tone, loading, valueSize, signDisplay, valueSuffix, className = "", metrics, brandSlot }) {
  // Navigation gets an arrow; informational cards retain their metric icon.
  const Indicator = path ? ArrowUpRight : Icon;
  const numericChars = !valueSuffix && typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, signDisplay }).format(value).length
    : null;
  const content = <>
    <div className="overview-metric-heading">
      <span>{label}</span>
      {Indicator && <span className="overview-metric-icon"><Indicator aria-hidden="true" /></span>}
    </div>
    {metrics && Array.isArray(metrics) ? (
      <div className="overview-metric-split">
        {metrics.map((m, idx) => (
          <div key={idx} className="overview-metric-sub">
            <span className="overview-metric-sub-label">{m.label}</span>
            <div className="overview-metric-sub-value" aria-busy={m.loading || loading || undefined}>
              {loading || m.loading ? (
                <span role="status" className="overview-metric-skeleton"><span className="sr-only">Loading {m.label}</span></span>
              ) : m.value == null || (typeof m.value === "number" && !Number.isFinite(m.value)) ? (
                "—"
              ) : typeof m.value === "number" ? (
                <AnimatedMetricValue value={m.value} signDisplay={m.signDisplay} />
              ) : (
                m.value
              )}
              {!loading && !m.loading && m.value != null && m.valueSuffix && (
                <span className="overview-metric-value-suffix"> {m.valueSuffix}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <p
        className="overview-metric-value"
        data-size={valueSize}
        data-numeric={numericChars ? "true" : undefined}
        style={numericChars ? { "--metric-chars": numericChars } : undefined}
        aria-busy={loading || undefined}
      >
        {loading ? <span role="status" className="overview-metric-skeleton"><span className="sr-only">Loading {label}</span></span> : value == null || (typeof value === "number" && !Number.isFinite(value)) ? "—" : typeof value === "number" ? <AnimatedMetricValue value={value} signDisplay={signDisplay} /> : value}
        {!loading && value != null && valueSuffix && <span className="overview-metric-value-suffix"> {valueSuffix}</span>}
      </p>
    )}
    {caption && <div className="overview-metric-footer">{caption}</div>}
  </>;

  return <article className={`overview-metric-card ${className}`} data-featured={accent || undefined} data-tone={tone} data-brand-slot={brandSlot}>
    {path ? <Link className="overview-metric-content" to={path}>{content}</Link> : <div className="overview-metric-content">{content}</div>}
  </article>;
}

export default function OverviewMetricCards({ items, label = "Dashboard summary", columns = 4, className = "" }) {
  return <section className={`overview-metrics ${className}`} aria-label={label} style={{ "--overview-columns": columns }}>
    {items.map(item => <OverviewMetricCard key={item.label} {...item} />)}
  </section>;
}
