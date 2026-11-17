import { Check, ClipboardCheck, TriangleAlert } from "lucide-react";
import { number } from "@/lib/format";
import "./action-review.css";

const reviewLabels = { allocate: "Review allocation", reclaim: "Review reclaim", requestCredits: "Review request", accountAccess: "Review access", changeRole: "Review role" };
export const actionReviewLabel = action => reviewLabels[action] || "Review changes";

export function ActionFormProgress({ reviewing }) {
  return <ol className="action-form-progress" aria-label="Form progress">
    <li aria-current={!reviewing ? "step" : undefined}><span>{reviewing ? <Check aria-hidden="true" /> : "1"}</span>Details</li>
    <li aria-current={reviewing ? "step" : undefined}><span>2</span>Review and confirm</li>
  </ol>;
}

export function CreditBalancePreview({ balance, amount, deduct = false, label = "Account balance" }) {
  if (typeof balance !== "number" || !Number.isFinite(balance) || !Number.isFinite(Number(amount))) return null;
  const before = Math.round(balance * 100), movement = Math.round(Number(amount) * 100);
  const after = before + (deduct ? -movement : movement);
  if (![before, movement, after].every(Number.isSafeInteger)) return null;
  return <div className="credit-balance-preview">
    <dl><div><dt>{label} now</dt><dd>{number(before / 100)} <span>credits</span></dd></div><div><dt>After confirmation</dt><dd>{number(after / 100)} <span>credits</span></dd></div></dl>
    <p>This is a preview. The current balance is checked again when you confirm.</p>
  </div>;
}

export default function ActionReview({ action, values, children }) {
  const danger = action === "reclaim" || action === "accountAccess" && ["blocked", "expired"].includes(values.status);
  const Icon = danger ? TriangleAlert : ClipboardCheck;
  const consequence = action === "reclaim" ? "These credits will be removed from the selected account."
    : action === "allocate" ? "Check the account and amount before allocating credits."
    : action === "accountAccess" ? danger ? "This account will be restricted from performing account actions." : "Access will follow the status and expiry date shown below."
    : action === "changeRole" ? "Changing this role changes the account’s pages and permissions."
    : action === "requestCredits" ? "Your balance changes only after credits are allocated."
    : "Check the details before confirming.";
  return <section className="action-review" data-caution={danger || undefined} aria-label="Confirmation details">
    <div className="action-review-heading"><Icon aria-hidden="true" /><p>{consequence}</p></div>
    <div className="action-review-details">{children}</div>
  </section>;
}
