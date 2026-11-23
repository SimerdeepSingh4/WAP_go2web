import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, Wallet, Clock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import RechargeModal from "@/features/credits/components/RechargeModal";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/hooks/useAuth";
import CampaignRecipientsInput from "@/features/campaigns/components/create/CampaignRecipientsInput";
import { FormError } from "@/features/dashboard/components/shared";
import { useResellerQuery } from "@/features/reseller/hooks/useReseller";
import { useUserQuery } from "@/features/user/hooks/useUser";
import { number } from "@/lib/format";
import { MAX_FILTERING_ROWS, parseFilteringRows } from "../../../../../shared/numberFiltering.js";
import { useSubmitFilteringRequest } from "../hooks/useNumberFiltering";

export default function FilteringRequestForm({ base }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const resellerBalance = useResellerQuery("myBalance", {}, user?.role === "Reseller");
  const userBalance = useUserQuery("myBalance", {}, user?.role === "User");
  const balance = user?.role === "Reseller" ? resellerBalance : userBalance;
  const wallet = balance.data?.wallet;
  const available = wallet?.creditBalances?.NUMBER_FILTERING?.available ?? 0;
  const [numbers, setNumbers] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const parsed = useMemo(() => parseFilteringRows(numbers), [numbers]);
  const submission = useSubmitFilteringRequest();
  const required = parsed.enteredCount;
  const hasInvalidRows = Boolean(parsed.error || parsed.invalidCount);
  const shortfall = balance.isSuccess && !hasInvalidRows && required > available;
  const neededQuantity = shortfall ? Math.max(1, required - available) : 5000;
  const canSubmit = balance.isSuccess && !wallet?.isLocked && !hasInvalidRows && !shortfall && required > 0;
  const showRecharge = balance.isSuccess && !wallet?.isLocked && (shortfall || available === 0);
  const showValidation = Boolean(numbers) && !parsed.error;

  function submit() {
    if (!canSubmit || submission.isPending) return;
    submission.mutate(numbers, {
      onSuccess: ({ data }) => {
        toast.add({ title: "Filtering request submitted", type: "success" });
        navigate(`${base}/number-filtering/${data.id}`);
      },
    });
  }

  return (
    <>
      <form className="filtering-request-form" onSubmit={event => {
        event.preventDefault();
        if (canSubmit) setReviewOpen(true);
      }}>
        <div className="filtering-input-panel">
          <CampaignRecipientsInput
            title="Numbers to filter"
            description={`Paste up to ${number(MAX_FILTERING_ROWS)} numbers per request.`}
            dataTour="number-filtering-input"
            rawRecipients={numbers}
            onRawRecipientsChange={setNumbers}
            totalRecipients={parsed.rows.length}
            invalidCount={parsed.invalidCount}
            invalidEntries={parsed.invalidEntries}
            showValidation={showValidation}
            readOnly={submission.isPending}
          />
          {parsed.error && <FormError message={parsed.error} />}
        </div>
        <section className="filtering-credit-panel" aria-labelledby="filtering-credits-heading">
          <header className="filtering-panel-header">
            <Wallet className="filtering-panel-icon" aria-hidden="true" />
            <div>
              <h2 id="filtering-credits-heading">Request summary</h2>
              <p>1 filtering credit per row, including repeats.</p>
            </div>
          </header>
          <div className="filtering-credit-body">
            <dl className="filtering-credit-estimate" aria-live="polite">
              <div className="filtering-credit-total">
                <dt>Credits required</dt>
                <dd>{hasInvalidRows ? "—" : number(required)}</dd>
              </div>
              <div>
                <dt>Available credits</dt>
                <dd>{balance.isSuccess ? number(available) : balance.isError ? "Unavailable" : "Loading…"}</dd>
              </div>
              {canSubmit && <div className="filtering-credit-remaining">
                <dt>Balance after submission</dt>
                <dd>{number(available - required)}</dd>
              </div>}
            </dl>
            {wallet?.isLocked && <FormError message="Your wallet is locked. Contact your account manager." />}
            {balance.isError && <FormError message="Your credit balance could not be loaded." />}
            {shortfall && !wallet?.isLocked && (
              <p className="filtering-credit-shortfall" role="status">
                You need {number(required - available)} more filtering credits.
              </p>
            )}
          </div>
          <div className="filtering-credit-actions">
            <Button type="submit" size="lg" disabled={!canSubmit || submission.isPending}>Review request <ArrowRight aria-hidden="true" /></Button>
            {showRecharge && (
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setRechargeOpen(true)}
              >
                <Zap aria-hidden="true" />
                Recharge credits
              </Button>
            )}
            {balance.isError && <Button type="button" variant="outline" size="lg" onClick={() => balance.refetch()} disabled={balance.isFetching}>{balance.isFetching ? "Retrying…" : "Retry balance"}</Button>}
          </div>
        </section>
      </form>
      <Dialog open={reviewOpen} onOpenChange={open => {
        if (!submission.isPending) {
          setReviewOpen(open);
          if (!open) submission.reset();
        }
      }}>
        <DialogContent showCloseButton={!submission.isPending}>
          <DialogHeader>
            <DialogTitle>Submit filtering request?</DialogTitle>
            <DialogDescription>
              Review the credit charge before submitting. The charge is final.
            </DialogDescription>
          </DialogHeader>
          <dl className="filtering-review-summary">
            <div><dt>Submitted rows</dt><dd>{number(required)}</dd></div>
            <div><dt>Credits charged</dt><dd>{number(required)}</dd></div>
            <div><dt>Balance after submission</dt><dd>{canSubmit ? number(available - required) : "—"}</dd></div>
          </dl>
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 text-xs font-medium my-3">
            <Clock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>Results are usually ready in 30–45 minutes.</span>
          </div>
          {submission.isError && <FormError message={submission.error.message} />}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={submission.isPending} onClick={() => { setReviewOpen(false); submission.reset(); }}>Back</Button>
            <Button type="button" disabled={!canSubmit || submission.isPending} onClick={submit}>{submission.isPending ? "Submitting…" : "Submit request"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {rechargeOpen && (
        <RechargeModal
          open={rechargeOpen}
          onOpenChange={(open) => {
            setRechargeOpen(open);
            if (!open) balance.refetch();
          }}
          initialCategory="NUMBER_FILTERING"
          initialQuantity={neededQuantity}
        />
      )}
    </>
  );
}
