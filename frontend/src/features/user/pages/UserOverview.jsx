import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link } from "react-router";
import { Plus, Megaphone, Coins, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QueryState } from "@/features/dashboard/components/shared";
import { RecentCampaigns } from "@/features/dashboard/components/OverviewPanels";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";
import { useUserQuery } from "../hooks/useUser";
import { useCreditRates } from "@/features/credits/hooks/useCredits";
import DashboardGreeting from "@/features/dashboard/components/DashboardGreeting";
import { formatCreditRatePaisa } from "@/lib/format";

export default function UserOverview() {
  const { user } = useAuth();
  const campaigns = useUserQuery("campaigns");
  const balance = useUserQuery("myBalance");
  const ratesQuery = useCreditRates();
  const wallet = balance.data?.wallet;
  const username = user?.username || "User";

  const campaignRate = formatCreditRatePaisa(ratesQuery.data?.purchaseRates?.CAMPAIGN?.unitPriceInr);
  const filteringRate = formatCreditRatePaisa(ratesQuery.data?.purchaseRates?.NUMBER_FILTERING?.unitPriceInr);

  const campaignList = campaigns.data?.data || [];
  const totalCampaigns = campaigns.isSuccess ? campaignList.length : null;
  const completedCampaigns = campaigns.isSuccess
    ? campaignList.filter(campaign => ["completed", "sent"].includes(campaign.status)).length
    : null;

  const campaignCredits = wallet?.creditBalances?.CAMPAIGN?.available ?? 0;
  const filteringCredits = wallet?.creditBalances?.NUMBER_FILTERING?.available ?? 0;

  return <>
    <DashboardGreeting username={username} description="Your credits and recent campaigns." action={<Button nativeButton={false} render={<Link to="/user/campaigns/create" />}><Plus />Create campaign</Button>} />
    <QueryState query={balance} variant="cards"><OverviewMetricCards className="dashboard-summary-metrics" columns={3} items={[
      {
        label: "Available Credits",
        metrics: [
          { label: "Campaign", value: campaignCredits },
          { label: "Filtering", value: filteringCredits },
        ],
        caption: wallet?.isLocked ? "Locked · contact your admin" : "Broadcast and filtering balances",
        icon: Wallet,
        path: "/user/credits",
        accent: true,
      },
      {
        label: "Campaigns",
        metrics: [
          { label: "Total", value: totalCampaigns, loading: campaigns.isPending },
          { label: "Completed", value: completedCampaigns, loading: campaigns.isPending },
        ],
        caption: campaigns.isSuccess ? `${completedCampaigns} of ${totalCampaigns} completed` : "All submissions & results",
        icon: Megaphone,
        path: "/user/campaigns",
        tone: "blue",
      },
      {
        label: "Purchase Rates",
        metrics: [
          { label: "Campaign", value: campaignRate, valueSuffix: "Paisa", loading: ratesQuery.isPending },
          { label: "Filtering", value: filteringRate, valueSuffix: "Paisa", loading: ratesQuery.isPending },
        ],
        caption: campaignRate == null && filteringRate == null ? "Pricing unavailable" : "Configured rate per credit",
        icon: Coins,
        path: "/user/credits",
        tone: "purple",
      },
    ]} /></QueryState>
    <RecentCampaigns query={campaigns} base="/user" />
    <div className="dashboard-note flex flex-wrap items-center justify-between gap-3"><span>Need more credits? Recharge your broadcast and filtering credits anytime.</span><Button className="credit-recharge-button" variant="outline" nativeButton={false} render={<Link to="/user/credits?recharge=new" />}>Recharge credits</Button></div>
  </>;
}
