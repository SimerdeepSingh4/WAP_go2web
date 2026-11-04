import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link } from "react-router";
import { RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeading, QueryState } from "@/features/admin/components/shared";
import { Summary, RecentCampaigns, AccountList } from "@/components/dashboard/OverviewPanels";
import { useResellerQuery } from "../hooks/useReseller";
import { number } from "@/features/admin/lib/format";
import { toast } from "@/components/ui/toast";

export default function Overview() {
  const { user: signedInUser } = useAuth();
  const campaigns = useResellerQuery("campaigns");
  const accounts = useResellerQuery("accounts");
  const balance = useResellerQuery("myBalance");
  const queries = [campaigns, accounts, balance];
  const wallet = balance.data?.wallet;
  async function refresh() {
    const results = await Promise.all(queries.map(q => q.refetch()));
    toast.add({ title: results.some(r => r.isError) ? "Some information could not be refreshed" : "Overview refreshed", type: results.some(r => r.isError) ? "error" : "success" });
  }
  return <>
    <PageHeading title="Overview" description="Manage your users and their available credits." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={refresh} disabled={queries.some(q => q.isFetching)}><RefreshCw />Refresh</Button><Button disabled={signedInUser?.isPreview} nativeButton={false} render={<Link to="/reseller/credits?allocate=new" />}><Plus />Allocate credits</Button></div>} />
    <QueryState query={balance}><Summary items={[{ label: "Available credits", value: number(wallet?.balance), hint: wallet?.isLocked ? "Locked - contact your administrator" : "Available for allocation", credit: true }, { label: "Your rate", value: number(wallet?.ratePerMsg), hint: "Credits per recipient" }]} /></QueryState>
    <div className="dashboard-two-column"><RecentCampaigns query={campaigns} base="/reseller" showOwner /><AccountList query={accounts} base="/reseller" role="User" /></div>
  </>;
}
