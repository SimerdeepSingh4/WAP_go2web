import { ArrowLeft, Check, ChevronRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CreateCampaignHeader({
  onNavigateBack,
  isPending,
  checks = [],
}) {
  return (
    <header className="campaign-create-header">
      <Button type="button" variant="ghost" size="sm" onClick={onNavigateBack} disabled={isPending} className="-ml-2 gap-1.5 text-xs text-muted-foreground"><ArrowLeft className="size-3.5" /> Back to campaigns</Button>
      <div className="campaign-create-heading">
        <div><h1>Create a campaign</h1><p>Prepare your message, choose your audience, and review the credit cost.</p></div>
        <span className="campaign-create-approval"><ShieldCheck aria-hidden="true" />Admin approval required</span>
      </div>
      <nav className="campaign-compose-steps" aria-label="Campaign form sections"><ol>{[
        { label: "Campaign details", href: "create-details", complete: checks[0]?.ok },
        { label: "Message", href: "create-message", complete: checks[1]?.ok },
        { label: "Audience", href: "create-recipients", complete: checks[2]?.ok },
        { label: "Review", href: "create-summary", complete: checks.length > 0 && checks.every((check) => check.ok) },
      ].map((step, index) => <li key={step.href}><a href={`#${step.href}`} data-complete={Boolean(step.complete)}><span className="campaign-compose-step-number">{step.complete ? <Check aria-hidden="true" /> : index + 1}</span><span>{step.label}</span>{step.complete && <span className="sr-only">complete</span>}</a>{index < 3 && <ChevronRight className="campaign-compose-step-arrow" aria-hidden="true" />}</li>)}</ol></nav>
    </header>
  );
}

