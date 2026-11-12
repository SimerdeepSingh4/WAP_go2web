import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { number } from "@/features/admin/lib/format";
import "./overview-metrics.css";

export default function OverviewMetricCards({ items, label = "Workspace overview", columns = 4 }) {
  return <section className="overview-metrics" aria-label={label} style={{ "--overview-columns": columns }}>
    {items.map(({ label: title, value, caption, icon: Icon, path, accent, loading }) => {
      const content = <>
        <div className="overview-metric-heading"><span>{title}</span><span className="overview-metric-icon"><Icon aria-hidden="true" /></span></div>
        <p className="overview-metric-value" aria-busy={loading || undefined}>{loading ? <span className="overview-metric-skeleton" aria-label={`Loading ${title}`} /> : value == null ? "—" : typeof value === "number" ? number(value) : value}</p>
        <div className="overview-metric-footer"><span>{caption}</span>{path && <ArrowRight aria-hidden="true" />}</div>
      </>;
      return <article key={title} className="overview-metric-card" data-featured={accent || undefined}>
        {path ? <Link className="overview-metric-content" to={path}>{content}</Link> : <div className="overview-metric-content">{content}</div>}
      </article>;
    })}
  </section>;
}
