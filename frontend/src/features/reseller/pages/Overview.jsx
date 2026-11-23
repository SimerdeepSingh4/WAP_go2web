import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link } from "react-router";
import { Coins, Plus, Megaphone, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/features/dashboard/components/shared";
import { RecentCampaigns, AccountList } from "@/features/dashboard/components/OverviewPanels";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";
import { useResellerQuery } from "../hooks/useReseller";
import { useCreditRates } from "@/features/credits/hooks/useCredits";
import { formatCreditRatePaisa } from "@/lib/format";
import DashboardGreeting from "@/features/dashboard/components/DashboardGreeting";

export default function Overview() {
  const { user: signedInUser } = useAuth();
  const campaigns = useResellerQuery("campaigns");
  const accounts = useResellerQuery("accounts");
  const balance = useResellerQuery("myBalance");
  const rates = useCreditRates();
  const purchaseRates = rates.data?.purchaseRates;
  const wallet = balance.data?.wallet;
  const username = signedInUser?.username || "Reseller";

  const campaignList = campaigns.data?.data || [];
  const totalCampaigns = campaigns.isSuccess ? campaignList.length : null;
  const completedCampaigns = campaigns.isSuccess
    ? campaignList.filter(campaign => ["completed", "sent"].includes(campaign.status)).length
    : null;

  const userList = accounts.isSuccess
    ? (accounts.data?.users || []).filter(account => account.role === "User")
    : [];
  const totalUsers = accounts.isSuccess ? userList.length : null;
  const activeUsers = accounts.isSuccess
    ? userList.filter(account => account.status === "active" && !account.isExpired).length
    : null;

  const campaignCredits = wallet?.creditBalances?.CAMPAIGN?.available ?? 0;
  const filteringCredits = wallet?.creditBalances?.NUMBER_FILTERING?.available ?? 0;

  return <div className="portal-overview reseller-overview">
    <DashboardGreeting username={username} description="Manage campaigns, client accounts, and credits." action={<><Button variant="outline" nativeButton={false} render={<Link to="/reseller/credits?recharge=new" />}><Wallet />Recharge credits</Button><Button disabled={signedInUser?.isPreview} nativeButton={false} render={<Link to="/reseller/credits?allocate=new" />}><Plus />Allocate credits</Button></>} />
    <QueryState query={balance} variant="cards"><OverviewMetricCards className="dashboard-summary-metrics" columns={4} items={[
      {
        label: "Available credits",
        metrics: [
          { label: "Campaign", value: campaignCredits },
          { label: "Number filtering", value: filteringCredits },
        ],
        caption: wallet?.isLocked ? "Locked · contact your administrator" : null,
        icon: Wallet,
        path: "/reseller/credits",
        accent: true,
      },
      {
        label: "Campaigns",
        metrics: [
          { label: "Total campaigns", value: totalCampaigns },
          { label: "Completed", value: completedCampaigns },
        ],
        loading: campaigns.isPending,
        icon: Megaphone,
        path: "/reseller/campaigns",
        tone: "blue",
      },
      {
        label: "User accounts",
        metrics: [
          { label: "Total users", value: totalUsers },
          { label: "Active", value: activeUsers },
        ],
        loading: accounts.isPending,
        icon: Users,
        path: "/reseller/users",
        tone: "pink",
      },
      {
        label: "Purchase rates",
        metrics: [
          { label: "Campaign", value: formatCreditRatePaisa(purchaseRates?.CAMPAIGN?.unitPriceInr), valueSuffix: "paise/credit", loading: rates.isPending },
          { label: "Number filtering", value: formatCreditRatePaisa(purchaseRates?.NUMBER_FILTERING?.unitPriceInr), valueSuffix: "paise/credit", loading: rates.isPending },
        ],
        caption: rates.isError ? "Pricing unavailable" : null,
        icon: Coins,
        path: "/reseller/credits?recharge=new",
        tone: "purple",
        className: "reseller-purchase-rates",
      },
    ]} /></QueryState>
    <div className="dashboard-two-column"><RecentCampaigns query={campaigns} base="/reseller" showOwner cards /><AccountList query={accounts} base="/reseller" role="User" /></div>
  </div>;
}
