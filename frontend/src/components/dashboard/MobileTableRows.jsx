import { ChevronDown } from "lucide-react";

// Keep the full column definitions as the source of truth for both layouts.
// Pages can override the defaults when a different field is more useful.
export function mobileTableLayout(columns, mobile = {}) {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const first = (keys) => keys.map((key) => byKey.get(key)).find(Boolean);
  const actions = columns.filter((column) => ["actions", "details"].includes(column.key));
  const avatar = byKey.get("dp_img");
  const primary = byKey.get(mobile.primary) || (byKey.has("amount") ? first(["account", "to", "name", "title", "type"]) : null)
    || first(["title", "name", "account", "phone", "phoneNumber", "actor", "action", "type"])
    || columns.find((column) => !actions.includes(column));
  const secondary = byKey.get(mobile.secondary) || first(["date", "time", "created", "createdAt"]);
  const preferred = mobile.featured || (byKey.has("amount") ? ["amount", "type"] : ["status", "balance", "wallet", "recipients", "audience", "rate", "action", "phone"]);
  const featured = preferred.map((key) => byKey.get(key)).filter((column) => column && column !== primary && column !== secondary && !actions.includes(column)).slice(0, 2);
  const visible = new Set([primary, secondary, avatar, ...featured, ...actions]);
  return { primary, avatar, secondary: secondary === primary ? null : secondary, featured, actions, details: columns.filter((column) => !visible.has(column)) };
}

export default function MobileTableRows({ rows, columns, caption, mobile }) {
  const layout = mobileTableLayout(columns, mobile);
  if (!layout.primary) return null;
  return <ul className="mobile-record-list" aria-label={caption || "Records"}>
    {rows.map((row, index) => <li key={row._id || row.id || row.rowNumber || index} className="mobile-record">
      <div className="mobile-record-heading">
      {layout.avatar && <div className="mobile-record-avatar">{layout.avatar.render(row)}</div>}
      <div className="mobile-record-title">
        <span className="mobile-record-label">{layout.primary.label}</span>
        <div className="mobile-record-value">{layout.primary.render(row)}</div>
      </div>
      </div>
      {layout.secondary && <div className="mobile-record-secondary"><span className="sr-only">{layout.secondary.label}: </span>{layout.secondary.render(row)}</div>}
      {layout.featured.length > 0 && <dl className="mobile-record-highlights">{layout.featured.map((column) => <div key={column.key}><dt>{column.label}</dt><dd>{column.render(row)}</dd></div>)}</dl>}
      {layout.details.length > 0 && <details className="mobile-record-details">
        <summary><span>More details</span><ChevronDown aria-hidden="true" /></summary>
        <dl>{layout.details.map((column) => <div key={column.key}><dt>{column.label}</dt><dd>{column.render(row)}</dd></div>)}</dl>
      </details>}
      {layout.actions.length > 0 && <div className="mobile-record-actions">{layout.actions.map((column) => <div key={column.key}>{column.render(row)}</div>)}</div>}
    </li>)}
  </ul>;
}
