import { Link } from "react-router";
import { ArrowLeft, ListChecks, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { SectionCard } from "@/features/campaigns/components/create/CampaignDetailsSection";
import OriginalUploadPreview from "@/features/campaigns/components/report/OriginalUploadPreview";
import { PageHeading, QueryState } from "@/features/dashboard/components/shared";
import { dateTime, number } from "@/lib/format";
import FilteringNumberActions from "../components/FilteringNumberActions";
import FilteringPublishedResults from "../components/FilteringPublishedResults";
import FilteringReference from "../components/FilteringReference";
import FilteringResultEditor from "../components/FilteringResultEditor";
import FilteringStatusBadge from "../components/FilteringStatusBadge";
import { useFilteringRequest } from "../hooks/useNumberFiltering";

export default function NumberFilteringDetail({ id, base, admin }) {
  const { user } = useAuth();
  const query = useFilteringRequest(id);
  const request = query.data?.data;
  const creditsCharged = request?.creditsCharged ?? (request?.chargeTransactionId ? request.submittedRowCount : null);
  const chargeDisplay = creditsCharged === 0 ? "Cleared by credit reset" : number(creditsCharged);
  const canReview = admin && user?.role === "Super Admin" && !user?.isPreview;

  return (
    <>
      <PageHeading
        title={
          <div className="flex flex-wrap items-center gap-2.5">
            <span>Filtering request</span>
            {request && <FilteringReference request={request} compact />}
          </div>
        }
        description={request && `Submitted ${dateTime(request.createdAt)}`}
        action={<Button nativeButton={false} readOnlySafe variant="outline" render={<Link to={`${base}/number-filtering`} />}><ArrowLeft />All requests</Button>}
      />
      <QueryState query={query}>
        {request && (
          <div className="min-w-0 space-y-5">
            <dl className="flex flex-wrap items-center gap-x-7 gap-y-3 rounded-xl border bg-card px-4 py-3 text-sm">
              {admin && <div><dt className="text-xs text-muted-foreground">Requested by</dt><dd className="font-medium">{request.owner?.username || "Unavailable account"}</dd></div>}
              <div><dt className="text-xs text-muted-foreground">Recipients</dt><dd className="font-semibold tabular-nums">{number(request.submittedRowCount)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Filtering Credits charged</dt><dd className="font-semibold tabular-nums">{chargeDisplay}</dd></div>
              {request.publishedAt && <div><dt className="text-xs text-muted-foreground">Result numbers</dt><dd className="font-semibold tabular-nums">{number(request.publishedRowCount)}</dd></div>}
              <div className="sm:ml-auto"><dt className="sr-only">Status</dt><dd><FilteringStatusBadge status={request.status} /></dd></div>
            </dl>
            <OriginalUploadPreview numbers={request.submittedNumbers} count={request.submittedRowCount} actions={request.submittedNumbers && (
              <FilteringNumberActions numbers={request.submittedNumbers} fileName={`filtering-${request.id}-submitted.txt`} />
            )} />
            {canReview && <FilteringResultEditor request={request} />}
            {request.publishedAt && <FilteringPublishedResults request={request} />}
            {!canReview && !request.publishedAt && (
              <SectionCard icon={ListChecks} title="Filtering results">
                <div className="space-y-3">
                  {request.status !== "CLOSED" && (
                    <div className="flex items-center gap-2.5 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs font-medium">
                      <Clock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>It will take 30-45 minutes to complete and report will be generated and visible to you after that.</span>
                    </div>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {request.status === "CLOSED" ? "This request closed without published results." : "Results will appear here after your admin publishes them."}
                  </p>
                </div>
              </SectionCard>
            )}
          </div>
        )}
      </QueryState>
    </>
  );
}
