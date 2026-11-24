import { Link } from "react-router";
import { ArrowUpRight, Building2, Megaphone, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";
import { useAdminQuery } from "../hooks/useAdmin";
import { QueryState } from "../../dashboard/components/shared";
import { number } from "../../../lib/format";

import { RecentCampaigns, AccountList, RecentTransactions } from "@/features/dashboard/components/OverviewPanels";

export default function Overview() {
  const overview = useAdminQuery("overview");
  const campaignsQuery = useAdminQuery("campaigns");
  const accountsQuery = useAdminQuery("accounts");
  const transactionsQuery = useAdminQuery("transactions", { limit: 5 });

  const stats = overview.data?.stats;

  const metrics = [
    { label: "Total campaigns", brandSlot: "campaigns", value: stats?.campaigns?.totalCampaigns, caption: "Across all accounts", icon: Megaphone, path: "/admin/campaigns", tone: "blue-filled" },
    { label: "Active resellers", brandSlot: "network", value: stats?.accounts?.activeResellers, caption: `${number(stats?.accounts?.totalResellers)} resellers in network`, icon: Building2, path: "/admin/resellers", tone: "gold-filled" },
    { label: "User accounts", brandSlot: "users", value: stats?.accounts?.totalUsers, caption: "Managed through resellers", icon: Users, path: "/admin/users", tone: "rose-filled" },
    { label: "Credits in circulation", brandSlot: "credits", value: stats?.credits?.totalCreditsInCirculation, caption: "Combined account balances", icon: Wallet, path: "/admin/credits", accent: true },
  ];

  return (
    <div className="portal-overview admin-overview">
      {/* Page Heading & Actions */}
      <header className="portal-page-heading">
        <div className="portal-heading-copy">
          <h1>Dashboard</h1>
          <p>Across all accounts</p>
        </div>
        <div className="portal-page-actions items-center gap-2.5">
          <Button size="sm" nativeButton={false} render={<Link to="/admin/credits?allocate=new" />}>
            Allocate credits
            <ArrowUpRight aria-hidden="true" className="size-3.5 ml-1" />
          </Button>
        </div>
      </header>

      {/* High-level Platform Totals */}
      <section aria-label="Workspace totals">
        <QueryState query={overview} variant="cards">
          <OverviewMetricCards items={metrics} />
        </QueryState>
      </section>

      {/* Submissions & Accounts (2 Columns) */}
      <div className="dashboard-two-column">
        <RecentCampaigns query={campaignsQuery} base="/admin" pendingOnly showOwner />
        <AccountList query={accountsQuery} base="/admin" role="Reseller" />
      </div>

      {/* Recent Financial / Credit Movements Ledger */}
      <RecentTransactions query={transactionsQuery} base="/admin" />
    </div>
  );
}
