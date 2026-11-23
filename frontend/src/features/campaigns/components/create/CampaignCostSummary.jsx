import { ArrowRight, CheckCircle2, Circle, Clock3, Coins, Info, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { number } from "@/lib/format";
import "./campaign-cost-summary.css";

export default function CampaignCostSummary({
  enteredCount, totalRecipients, estimatedCost, hasInsufficientCredits,
  isAdmin, currentBalance, remainingBalance, checks, submitDisabled, isPending, onCancel,
}) {
  const completed = checks.filter((check) => check.ok).length;
  const ready = checks.length > 0 && completed === checks.length && !submitDisabled;
  const count = enteredCount ?? totalRecipients;
  return <Card id="create-summary" data-tour="create-summary" className="campaign-cost-summary">
    <header className="campaign-cost-heading">
      <div className="campaign-cost-heading-copy">
        <span className="campaign-cost-icon"><Coins aria-hidden="true" /></span>
        <h2>Campaign summary</h2>
      </div>
      <span className="campaign-cost-readiness" data-ready={ready}>
        {ready && <CheckCircle2 aria-hidden="true" />}
        {ready ? "Ready to review" : `${completed} of ${checks.length} checks complete`}
      </span>
    </header>

    <div className="campaign-cost-body">
      <section className="campaign-cost-breakdown" aria-label="Campaign credit estimate">
        <div className="campaign-cost-estimate" data-insufficient={hasInsufficientCredits}>
          <span className="campaign-cost-eyebrow">Required Campaign Credits</span>
          <p className="campaign-cost-amount">{number(estimatedCost)} <span>credits</span></p>
          <p className="campaign-cost-calculation">{number(count)} {count === 1 ? "recipient" : "recipients"} (1 credit each)</p>
        </div>
        <dl className="campaign-cost-wallet">
          <div><dt>Available credits</dt><dd>{isAdmin ? "Unlimited" : number(currentBalance)}{!isAdmin && <span> credits</span>}</dd></div>
          <div><dt>After submission</dt><dd data-negative={!isAdmin && remainingBalance < 0}>{isAdmin ? "Unlimited" : number(remainingBalance)}{!isAdmin && <span> credits</span>}</dd></div>
        </dl>
        {isAdmin && <p className="campaign-cost-billing-note"><Info aria-hidden="true" /><span>Every entered row is charged, including duplicates.</span></p>}
        {hasInsufficientCredits && <p className="campaign-cost-alert" role="alert">You need <strong>{number(estimatedCost - currentBalance)} more Campaign Credits</strong> to submit this campaign.</p>}
      </section>

      <section className="campaign-cost-checklist" aria-labelledby="campaign-checklist-heading">
        <div className="campaign-cost-checklist-heading"><h3 id="campaign-checklist-heading">Before you continue</h3><span>{completed}/{checks.length}</span></div>
        <ul aria-label="Submission checklist">{checks.map((check) => <li key={check.label} data-complete={check.ok}>
          {check.ok ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
          <span>{check.ok || !check.target || check.target === "create-summary" ? check.label : <a className="underline underline-offset-4" href={`#${check.target}`}>{check.label}</a>}</span><small>{check.ok ? "Complete" : "Needed"}</small>
        </li>)}</ul>
      </section>
    </div>

    <footer className="campaign-cost-footer">
      <p><Clock3 aria-hidden="true" /><span>{isAdmin ? "Review all details before confirming." : "Your submission will be reviewed by an admin."}</span></p>
      <div className="campaign-cost-actions">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>Cancel</Button>
        <Button type="submit" disabled={submitDisabled || isPending} className="campaign-cost-review">
          {isPending ? <><Loader2 className="animate-spin" aria-hidden="true" />Submitting…</> : <>Review campaign<ArrowRight aria-hidden="true" /></>}
        </Button>
      </div>
    </footer>
  </Card>;
}
