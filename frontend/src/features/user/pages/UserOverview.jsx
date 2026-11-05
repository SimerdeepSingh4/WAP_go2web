import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link } from "react-router";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/features/admin/components/shared";
import { Summary, RecentCampaigns } from "@/components/dashboard/OverviewPanels";
import { useUserQuery } from "../hooks/useUser";
import { number, dateTime } from "@/features/admin/lib/format";
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
    <QueryState query={balance}><Summary items={[{ label: "Available credits", value: number(wallet?.balance), hint: wallet?.isLocked ? "Locked - contact your reseller" : "Available for new campaigns", credit: true }, { label: "Rate per recipient", value: number(wallet?.ratePerMsg), hint: "Credits per message" }, { label: "Credit expiry", value: wallet?.expiresAt ? dateTime(wallet.expiresAt) : "No expiry", hint: "Current account balance" }]} /></QueryState>
    <RecentCampaigns query={campaigns} base="/user" />
    <div className="dashboard-note flex flex-wrap items-center justify-between gap-3"><span>Need more credits? Submit a request to your account manager.</span><Button variant="outline" nativeButton={false} render={<Link to="/user/credits?request=new" />}>Request credits</Button></div>
  </>;
}
