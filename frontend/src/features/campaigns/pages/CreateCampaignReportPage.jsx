import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import api from "@/api/client";
import { StatusBadge } from "@/features/dashboard/components/shared";
import CampaignCategoryCards from "../components/detail/CampaignCategoryCards";
import ReportLoadError from "../components/report/ReportLoadError";
import FailedCampaignReportEditor from "../components/report/FailedCampaignReportEditor";

export default function CreateCampaignReportPage() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ["campaign-detail", id],
    queryFn: async () => (await api.get(`/campaigns/${id}`)).data.data,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  if (query.isError) return <ReportLoadError error={query.error} base="/admin" onRetry={() => query.refetch()} isRetrying={query.isFetching} />;
  if (query.isPending || !query.isFetchedAfterMount) return <div role="status" aria-label="Loading report editor" className="space-y-4"><div className="h-24 animate-pulse rounded-xl bg-muted/40" /><div className="h-32 animate-pulse rounded-xl bg-muted/40" /><div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((key) => <div key={key} className="h-52 animate-pulse rounded-xl bg-muted/40" />)}</div></div>;
  const campaign = query.data;
  if (!campaign) return <ReportLoadError base="/admin" onRetry={() => query.refetch()} isRetrying={query.isFetching} />;

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-5 pb-6">
      <header className="space-y-4">
        <Link to={`/admin/campaigns/${id}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" /> Back to campaign</Link>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{campaign.status === "failed" ? "Create failure report" : "Create report"}</h1>
          <div className="flex flex-wrap items-center gap-2.5"><p className="min-w-0 break-words text-sm font-medium">{campaign.campaignTitle}</p><StatusBadge status={campaign.status} /></div>
          <p className="text-xs leading-5 text-muted-foreground">{campaign.status === "failed" ? "Review the original contacts and explain the failure before publishing." : "Organize recipients, then save and review the report before publishing."}</p>
        </div>
      </header>
      {campaign.status === "failed" ? <FailedCampaignReportEditor key={`${campaign._id}:${campaign.spreadsheetRevision || 0}`} campaign={campaign} /> : <CampaignCategoryCards key={`${campaign._id}:${campaign.spreadsheetRevision || 0}`} campaign={campaign} />}
    </div>
  );
}
