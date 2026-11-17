import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link } from "react-router";
import { Plus, Megaphone, Users, Coins, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/features/dashboard/components/shared";
import { RecentCampaigns, AccountList } from "@/features/dashboard/components/OverviewPanels";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";
import { useResellerQuery } from "../hooks/useReseller";
import DashboardGreeting from "@/features/dashboard/components/DashboardGreeting";

export default function Overview() {
  const { user: signedInUser } = useAuth();
  const campaigns = useResellerQuery("campaigns");
  const accounts = useResellerQuery("accounts");
  const balance = useResellerQuery("myBalance");
  const wallet = balance.data?.wallet;
  const username = signedInUser?.username || "Reseller";

  return <>
    <DashboardGreeting username={username} description="Manage your users and their available credits." action={<Button disabled={signedInUser?.isPreview} nativeButton={false} render={<Link to="/reseller/credits?allocate=new" />}><Plus />Allocate credits</Button>} />
    <QueryState query={balance}><OverviewMetricCards items={[
      { label: "Available credits", value: wallet?.balance, caption: wallet?.isLocked ? "Locked · contact your administrator" : "Available for allocation", icon: Wallet, path: "/reseller/credits", accent: true },
      { label: "Total campaigns", value: campaigns.isSuccess ? (campaigns.data?.data || []).length : null, loading: campaigns.isPending, caption: "Your workspace campaigns", icon: Megaphone, path: "/reseller/campaigns", tone: "blue" },
      { label: "User accounts", value: accounts.isSuccess ? (accounts.data?.users || []).filter(account => account.role === "User").length : null, loading: accounts.isPending, caption: "Managed by you", icon: Users, path: "/reseller/users", tone: "pink" },
      { label: "Your rate", value: wallet?.ratePerMsg, caption: "Credits per recipient", icon: Coins, path: "/reseller/credits", tone: "purple" },
    ]} /></QueryState>
    <div className="dashboard-two-column"><RecentCampaigns query={campaigns} base="/reseller" showOwner /><AccountList query={accounts} base="/reseller" role="User" /></div>
  </>;
}
