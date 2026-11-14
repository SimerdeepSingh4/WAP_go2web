import { ChevronDown } from "lucide-react";

// Keep the full column definitions as the source of truth for both layouts.
// Pages can override the defaults when a different field is more useful.
export function mobileTableLayout(columns, mobile = {}) {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const first = (keys) => keys.map((key) => byKey.get(key)).find(Boolean);
  const actions = columns.filter((column) => ["actions", "details"].includes(column.key));
  const avatar = byKey.get(mobile.avatar || "dp_img");
  const primary = byKey.get(mobile.primary) || (byKey.has("amount") ? first(["account", "to", "name", "title", "type"]) : null)
    || first(["title", "name", "account", "phone", "phoneNumber", "actor", "action", "type"])
    || columns.find((column) => !actions.includes(column));
  const secondary = byKey.get(mobile.secondary) || first(["email", "date", "time", "created", "createdAt"]);
  const preferred = mobile.featured || (byKey.has("amount") ? ["amount", "type"] : ["status", "balance", "wallet", "recipients", "audience", "rate", "whiteLabel", "action", "phone"]);
  const maxFeatured = mobile.maxFeatured || (mobile.featured ? mobile.featured.length : 3);
  const featured = preferred.map((key) => byKey.get(key)).filter((column) => column && column !== primary && column !== secondary && !actions.includes(column)).slice(0, maxFeatured);
  const visible = new Set([primary, secondary, avatar, ...featured, ...actions]);
  const details = columns.filter((column) => !visible.has(column));
  return { primary, avatar, secondary: secondary === primary ? null : secondary, featured, actions, details };
}

export default function MobileTableRows({ rows, columns, caption, mobile }) {
  if (typeof mobile?.render === "function") {
    return (
      <ul className="mobile-record-list" aria-label={caption || "Records"}>
        {rows.map((row, index) => (
          <li key={row._id || row.id || row.rowNumber || index} className="mobile-record">
            {mobile.render(row, index)}
          </li>
        ))}
      </ul>
    );
  }

  const layout = mobileTableLayout(columns, mobile);
  if (!layout.primary) return null;

  return (
    <ul className="mobile-record-list" aria-label={caption || "Records"}>
      {rows.map((row, index) => (
        <li key={row._id || row.id || row.rowNumber || index} className="mobile-record">
          <div className="mobile-record-header">
            <div className="mobile-record-heading">
              {layout.avatar && <div className="mobile-record-avatar">{layout.avatar.render(row)}</div>}
              <div className="mobile-record-title">
                {mobile?.showPrimaryLabel && <span className="mobile-record-label">{layout.primary.label}</span>}
                <div className="mobile-record-value">{layout.primary.render(row)}</div>
                {layout.secondary && (
                  <div className="mobile-record-secondary">{layout.secondary.render(row)}</div>
                )}
              </div>
            </div>
            {layout.actions.length > 0 && (
              <div className="mobile-record-actions">
                {layout.actions.map((column) => <div key={column.key}>{column.render(row)}</div>)}
              </div>
            )}
          </div>

          {layout.featured.length > 0 && (
            <div className="mobile-record-highlights">
              {layout.featured.map((column) => (
                <div key={column.key} className="mobile-record-stat">
                  <span className="mobile-record-stat-label">{column.label}</span>
                  <div className="mobile-record-stat-val">{column.render(row)}</div>
                </div>
              ))}
            </div>
          )}

          {layout.details.length > 0 && (
            layout.details.length <= 3 || mobile?.expandDetails ? (
              <dl className="mobile-record-details-grid">
                {layout.details.map((column) => (
                  <div key={column.key} className="mobile-record-detail-row">
                    <dt className="mobile-record-detail-label">{column.label}</dt>
                    <dd className="mobile-record-detail-val">{column.render(row)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <details className="mobile-record-details">
                <summary>
                  <span>More details</span>
                  <ChevronDown aria-hidden="true" />
                </summary>
                <dl className="mobile-record-details-grid">
                  {layout.details.map((column) => (
                    <div key={column.key} className="mobile-record-detail-row">
                      <dt className="mobile-record-detail-label">{column.label}</dt>
                      <dd className="mobile-record-detail-val">{column.render(row)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )
          )}
        </li>
      ))}
    </ul>
  );
}
