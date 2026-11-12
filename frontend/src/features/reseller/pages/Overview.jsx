import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link } from "react-router";
import { RefreshCw, Plus, Megaphone, Users, Coins, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/features/admin/components/shared";
import { RecentCampaigns, AccountList } from "@/components/dashboard/OverviewPanels";
import OverviewMetricCards from "@/components/dashboard/OverviewMetricCards";
import { useResellerQuery } from "../hooks/useReseller";
import { toast } from "@/components/ui/toast";
import DashboardGreeting from "@/components/dashboard/DashboardGreeting";

export default function Overview() {
  const { user: signedInUser } = useAuth();
  const campaigns = useResellerQuery("campaigns");
  const accounts = useResellerQuery("accounts");
  const balance = useResellerQuery("myBalance");
  const queries = [campaigns, accounts, balance];
  const wallet = balance.data?.wallet;
  const username = signedInUser?.username || "Reseller";
  async function refresh() {
    const results = await Promise.all(queries.map(q => q.refetch()));
    toast.add({ title: results.some(r => r.isError) ? "Some information could not be refreshed" : "Overview refreshed", type: results.some(r => r.isError) ? "error" : "success" });
  }
  return <>
    <DashboardGreeting username={username} description="Manage your users and their available credits." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={refresh} disabled={queries.some(q => q.isFetching)}><RefreshCw />Refresh</Button><Button disabled={signedInUser?.isPreview} nativeButton={false} render={<Link to="/reseller/credits?allocate=new" />}><Plus />Allocate credits</Button></div>} />
    <QueryState query={balance}><OverviewMetricCards items={[
      { label: "Total campaigns", value: campaigns.isSuccess ? (campaigns.data?.data || []).length : null, loading: campaigns.isPending, caption: "Your workspace campaigns", icon: Megaphone, path: "/reseller/campaigns" },
      { label: "User accounts", value: accounts.isSuccess ? (accounts.data?.users || []).filter(account => account.role === "User").length : null, loading: accounts.isPending, caption: "Managed by you", icon: Users, path: "/reseller/users" },
      { label: "Your rate", value: wallet?.ratePerMsg, caption: "Credits per recipient", icon: Coins, path: "/reseller/credits" },
      { label: "Available credits", value: wallet?.balance, caption: wallet?.isLocked ? "Locked · contact your administrator" : "Available for allocation", icon: Wallet, path: "/reseller/credits", accent: true },
    ]} /></QueryState>
    <div className="dashboard-two-column"><RecentCampaigns query={campaigns} base="/reseller" showOwner /><AccountList query={accounts} base="/reseller" role="User" /></div>
  </>;
}
