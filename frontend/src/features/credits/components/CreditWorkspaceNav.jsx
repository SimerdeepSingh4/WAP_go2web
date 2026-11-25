import { usePurchasesList } from "../hooks/useCredits";
import "./credit-settings.css";

export default function CreditWorkspaceNav({ items, active, onChange }) {
  const requests = usePurchasesList({ scope: "seller", limit: 1 });
  const pendingCount = requests.data?.pendingCount || 0;

  return (
    <div className="credit-workspace-nav" role="group" aria-label="Credit workspace sections">
      {items.map(({ value, label, shortLabel, icon: Icon }) => {
        const count = value === "requests" ? pendingCount : 0;
        return (
          <button
            key={value}
            type="button"
            aria-label={count > 0 ? `${label}, ${count} awaiting review` : label}
            aria-pressed={active === value}
            onClick={() => onChange(value)}
          >
            <span className="credit-workspace-icon">
              <Icon aria-hidden="true" />
              {count > 0 && <span className="credit-workspace-count" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
            </span>
            <span className="credit-workspace-label">{label}</span>
            <span className="credit-workspace-short-label">{shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
