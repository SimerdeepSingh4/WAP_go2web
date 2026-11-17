import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link } from "react-router";
import { Plus, Megaphone, CheckCircle, Coins, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/features/dashboard/components/shared";
import { RecentCampaigns } from "@/features/dashboard/components/OverviewPanels";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";
import { useUserQuery } from "../hooks/useUser";
import DashboardGreeting from "@/features/dashboard/components/DashboardGreeting";

export default function UserOverview() {
  const { user } = useAuth();
  const campaigns = useUserQuery("campaigns");
  const balance = useUserQuery("myBalance");
  const wallet = balance.data?.wallet;
  const username = user?.username || "User";

  return <>
    <DashboardGreeting username={username} description="Your credits and recent campaigns." action={<Button nativeButton={false} render={<Link to="/user/campaigns/create" />}><Plus />Create campaign</Button>} />
    <QueryState query={balance}><OverviewMetricCards items={[
      { label: "Available credits", value: wallet?.balance, caption: wallet?.isLocked ? "Locked · contact your reseller" : "Available for campaigns", icon: Wallet, path: "/user/credits", accent: true },
      { label: "Total campaigns", value: campaigns.isSuccess ? (campaigns.data?.data || []).length : null, loading: campaigns.isPending, caption: "All your submissions", icon: Megaphone, path: "/user/campaigns", tone: "blue" },
      { label: "Completed campaigns", value: campaigns.isSuccess ? (campaigns.data?.data || []).filter(campaign => ["completed", "sent"].includes(campaign.status)).length : null, loading: campaigns.isPending, caption: "View campaign results", icon: CheckCircle, path: "/user/campaigns?status=completed", tone: "yellow" },
      { label: "Rate per recipient", value: wallet?.ratePerMsg, caption: "Credits per recipient", icon: Coins, path: "/user/credits", tone: "purple" },
    ]} /></QueryState>
    <RecentCampaigns query={campaigns} base="/user" />
    <div className="dashboard-note flex flex-wrap items-center justify-between gap-3"><span>Need more credits? Submit a request to your account manager.</span><Button variant="outline" nativeButton={false} render={<Link to="/user/credits?request=new" />}>Request credits</Button></div>
  </>;
}
