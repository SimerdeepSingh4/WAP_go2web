import { Building2, FileText, Megaphone, RefreshCw, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAdminQuery } from "../hooks/useAdmin";
import { PageHeading, QueryState } from "../components/shared";
import { number } from "../lib/format";
import { CampaignCharts } from "../components/OverviewCharts";
import OverviewWorkPanel from "../components/OverviewWorkPanel";
import { toast } from "@/components/ui/toast";

export default function Overview() {
  const overview = useAdminQuery("overview");
  const campaignsQuery = useAdminQuery("campaigns");
  const accountsQuery = useAdminQuery("accounts");
  const campaigns = campaignsQuery.data?.data || [];
  const stats = overview.data?.stats;
  const updated = overview.dataUpdatedAt ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(overview.dataUpdatedAt) : null;
  async function refresh() {
    const results = await Promise.all([overview.refetch(), campaignsQuery.refetch(), accountsQuery.refetch()]);
    if (results.every((result) => !result.isError)) toast.add({ title: "Overview refreshed", type: "success" });
  }
  return <>
    <PageHeading title="Overview" description="Your campaigns, accounts, and work that needs attention." action={<Button variant="outline" onClick={refresh} disabled={overview.isFetching || campaignsQuery.isFetching || accountsQuery.isFetching}><RefreshCw className={overview.isFetching ? "animate-spin" : ""} />Refresh</Button>} />
    <QueryState query={overview}><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[
      ["Total campaigns", stats?.campaigns?.totalCampaigns, "Across all accounts", Megaphone],
      ["Active resellers", stats?.accounts?.activeResellers, `${number(stats?.accounts?.totalResellers)} total resellers`, Building2],
      ["User accounts", stats?.accounts?.totalUsers, "Managed through resellers", FileText],
      ["Credits in circulation", stats?.credits?.totalCreditsInCirculation, "Combined account balances", Wallet],
    ].map(([label, value, caption, Icon]) => <Card key={label} className="gap-3 rounded-lg shadow-none"><CardHeader className="flex flex-row items-center justify-between gap-2"><CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</CardTitle><Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /></CardHeader><CardContent><p className="break-words text-2xl font-semibold tabular-nums tracking-tight">{number(value)}</p><p className="mt-1 text-xs text-muted-foreground">{caption}</p></CardContent></Card>)}</div></QueryState>
    <QueryState query={campaignsQuery}><CampaignCharts campaigns={campaigns} /></QueryState>
    <OverviewWorkPanel campaignsQuery={campaignsQuery} accountsQuery={accountsQuery} />
    {updated && <p className="text-xs text-muted-foreground">Last refreshed {updated}</p>}
  </>;
}
