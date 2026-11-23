import { Check, ChevronRight, Wallet } from "lucide-react";
import { number } from "@/lib/format";

export default function CreateCampaignHeader({
  checks = [],
  availableCredits,
  isAdmin = false,
}) {
  const sections = [
    { label: "Details", id: "create-details", targets: ["create-details", "create-timing"] },
    { label: "Message", id: "create-message", targets: ["create-message", "create-media"] },
    { label: "Audience", id: "create-recipients", targets: ["create-recipients"] },
    { label: "Review", id: "create-summary" },
  ].map(section => ({
    ...section,
    complete: checks.every(check => (section.targets && !section.targets.includes(check.target)) || check.ok),
  }));
  const nextSection = sections.find(section => !section.complete);
  return (
    <header className="campaign-create-header">
      <div className="campaign-create-heading">
        <div><h1>Create a campaign</h1><p>Prepare your message, choose your audience, and review the credit cost.</p></div>
        <dl className="campaign-wallet">
          <dt><Wallet size={16} aria-hidden="true" />Available balance</dt>
          <dd>{isAdmin ? "Unlimited" : number(availableCredits)} <span>campaign credits</span></dd>
        </dl>
      </div>
      <nav className="campaign-compose-steps" aria-label="Campaign form sections">
        <ol>{sections.map((step, index) => (
          <li key={step.id}>
            <a href={`#${step.id}`} data-complete={step.complete} aria-current={step === nextSection ? "step" : undefined}>
              <span className="campaign-compose-step-number">{step.complete ? <Check aria-hidden="true" /> : index + 1}</span>
              {step.label}{step.complete && <span className="sr-only"> complete</span>}
            </a>
            {index < sections.length - 1 && <ChevronRight className="campaign-compose-step-arrow" aria-hidden="true" />}
          </li>
        ))}</ol>
      </nav>
    </header>
  );
}

