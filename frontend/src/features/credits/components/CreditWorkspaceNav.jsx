import { usePurchasesList } from "../hooks/useCredits";
import "./credit-settings.css";

export default function CreditWorkspaceNav({ items, active, onChange }) {
  const requests = usePurchasesList({ scope: "seller", limit: 1 });
  const pendingCount = requests.data?.pendingCount || 0;

  return (
    <div className="credit-workspace-nav" role="group" aria-label="Credit workspace sections">
      {items.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" aria-pressed={active === value} onClick={() => onChange(value)}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
          {value === "requests" && pendingCount > 0 && (
            <span className="credit-workspace-count">
              <span aria-hidden="true">{pendingCount > 99 ? "99+" : pendingCount}</span>
              <span className="sr-only">{pendingCount} awaiting review</span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
