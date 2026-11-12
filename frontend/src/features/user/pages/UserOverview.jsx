import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link } from "react-router";
import { Plus, RefreshCw, Megaphone, CheckCircle, Coins, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/features/admin/components/shared";
import { RecentCampaigns } from "@/components/dashboard/OverviewPanels";
import OverviewMetricCards from "@/components/dashboard/OverviewMetricCards";
import { useUserQuery } from "../hooks/useUser";
import { dateTime } from "@/features/admin/lib/format";
import { toast } from "@/components/ui/toast";
import DashboardGreeting from "@/components/dashboard/DashboardGreeting";

export default function UserOverview() {
  const { user } = useAuth();
  const campaigns = useUserQuery("campaigns");
  const balance = useUserQuery("myBalance");
  const wallet = balance.data?.wallet;
  const username = user?.username || "User";
  async function refresh() {
    const results = await Promise.all([campaigns.refetch(), balance.refetch()]);
    const failed = results.some(r => r.isError);
    toast.add({ title: failed ? "Some information could not be refreshed" : "Overview refreshed", type: failed ? "error" : "success" });
  }
  return <>
    <DashboardGreeting username={username} description="Your credits and recent campaigns." action={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={refresh} disabled={campaigns.isFetching || balance.isFetching}><RefreshCw />Refresh</Button><Button nativeButton={false} render={<Link to="/user/campaigns/create" />}><Plus />Create campaign</Button></div>} />
    <QueryState query={balance}><OverviewMetricCards items={[
      { label: "Total campaigns", value: campaigns.isSuccess ? (campaigns.data?.data || []).length : null, loading: campaigns.isPending, caption: "All your submissions", icon: Megaphone, path: "/user/campaigns" },
      { label: "Completed campaigns", value: campaigns.isSuccess ? (campaigns.data?.data || []).filter(campaign => ["completed", "sent"].includes(campaign.status)).length : null, loading: campaigns.isPending, caption: "View campaign results", icon: CheckCircle, path: "/user/campaigns?status=completed" },
      { label: "Rate per recipient", value: wallet?.ratePerMsg, caption: "Credits per message", icon: Coins, path: "/user/credits" },
      { label: "Available credits", value: wallet?.balance, caption: wallet?.isLocked ? "Locked · contact your reseller" : wallet?.expiresAt ? `Expires ${dateTime(wallet.expiresAt)}` : "Available for campaigns · no expiry", icon: Wallet, path: "/user/credits", accent: true },
    ]} /></QueryState>
    <RecentCampaigns query={campaigns} base="/user" />
    <div className="dashboard-note flex flex-wrap items-center justify-between gap-3"><span>Need more credits? Submit a request to your account manager.</span><Button variant="outline" nativeButton={false} render={<Link to="/user/credits?request=new" />}>Request credits</Button></div>
  </>;
}
