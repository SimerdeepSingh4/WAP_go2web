import { Coins, Send, Loader2, CheckCircle2, Circle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { number } from "@/features/admin/lib/format";

export function SummaryRow({ label, children, strong }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={strong ? "font-semibold text-foreground" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums">{children}</span>
    </div>
  );
}

export default function CampaignCostSummary({
  enteredCount,
  totalRecipients,
  estimate,
  estimatedCost,
  hasInsufficientCredits,
  isAdmin,
  currentBalance,
  remainingBalance,
  checks,
  submitDisabled,
  isPending,
  onCancel,
}) {
  return (
    <Card data-tour="create-summary" className="gap-0 rounded-xl border border-border py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border px-4 py-3 sm:px-5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Coins className="size-3.5 text-muted-foreground" />
          Campaign summary
        </CardTitle>
        <CardDescription className="mt-1 text-[11px] leading-5">Each entered number is charged, including repeats.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-4 text-xs sm:p-5">
        <SummaryRow label="Numbers entered">
          <span className="font-medium text-foreground">{number(enteredCount ?? totalRecipients)}</span>
        </SummaryRow>
        <SummaryRow label="Rate per recipient">
          <span className="font-medium text-foreground">{number(estimate.rate)} {estimate.rate === 1 ? "credit" : "credits"}</span>
        </SummaryRow>
        <div className="rounded-lg bg-muted/40 px-3 py-3">
          <SummaryRow label="Estimated credits" strong>
            <span
              className={`text-lg font-semibold ${
                hasInsufficientCredits ? "text-destructive" : "text-foreground"
              }`}
            >
              {number(estimatedCost)} credits
            </span>
          </SummaryRow>
        </div>
        <div className="space-y-2 text-xs border-t pt-3">
          <SummaryRow label="Wallet balance">
            <span className="font-medium text-foreground">{isAdmin ? "Unlimited" : number(currentBalance)}</span>
          </SummaryRow>
          <SummaryRow label="After submission">
            <span
              className={`font-medium ${
                remainingBalance < 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {isAdmin ? "Unlimited" : number(remainingBalance)}
            </span>
          </SummaryRow>
        </div>

        {hasInsufficientCredits && (
          <div
            role="alert"
            className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20"
          >
            You need {number(estimatedCost - currentBalance)} more credits to submit this campaign.
          </div>
        )}

        <ul className="pt-3 border-t space-y-1.5" aria-label="Submission checklist">
          {checks.map((c) => (
            <li
              key={c.label}
              className={`flex items-center gap-2 text-xs ${
                c.ok ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {c.ok ? (
                <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
              ) : (
                <Circle className="size-3.5 shrink-0" />
              )}
              {c.label}
            </li>
          ))}
        </ul>
      </CardContent>

      <CardFooter className="flex flex-col gap-2 border-t border-border bg-muted/15 p-4 sm:px-5">
        <Button type="submit" disabled={submitDisabled} className="h-10 w-full gap-2 font-medium">
          {isPending ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Send className="size-4 mr-2" />
          )}
          Review campaign
        </Button>
        {!isAdmin && <p className="text-center text-[11px] leading-5 text-muted-foreground">Your campaign starts after admin approval.</p>}
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          className="w-full text-xs text-muted-foreground"
        >
          Cancel
        </Button>
      </CardFooter>
    </Card>
  );
}

