import { Link } from "react-router";
import { ArrowUpRight, Building2, Megaphone, RefreshCw, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import OverviewMetricCards from "@/components/dashboard/OverviewMetricCards";
import { useAdminQuery } from "../hooks/useAdmin";
import { QueryState } from "../components/shared";
import { number } from "../lib/format";

import { RecentCampaigns, AccountList, RecentTransactions } from "@/components/dashboard/OverviewPanels";
import { toast } from "@/components/ui/toast";

export default function Overview() {
  const overview = useAdminQuery("overview");
  const campaignsQuery = useAdminQuery("campaigns");
  const accountsQuery = useAdminQuery("accounts");
  const transactionsQuery = useAdminQuery("transactions", { limit: 5 });

  const stats = overview.data?.stats;
  const refreshing = [overview, campaignsQuery, accountsQuery, transactionsQuery].some((query) => query.isFetching);

  async function refresh() {
    try {
      const results = await Promise.all([
        overview.refetch(),
        campaignsQuery.refetch(),
        accountsQuery.refetch(),
        transactionsQuery.refetch(),
      ]);
      if (results.some((result) => result.isError)) throw new Error("Some dashboard data could not be refreshed.");
      toast.add({ title: "Overview refreshed", type: "success" });
    } catch (error) {
      toast.add({ title: "Refresh incomplete", description: error?.message || "Please try again.", type: "error" });
    }
  }

  const metrics = [
    { label: "Total campaigns", value: stats?.campaigns?.totalCampaigns, caption: "Across all accounts", icon: Megaphone, path: "/admin/campaigns" },
    { label: "Active resellers", value: stats?.accounts?.activeResellers, caption: `${number(stats?.accounts?.totalResellers)} resellers in network`, icon: Building2, path: "/admin/resellers" },
    { label: "User accounts", value: stats?.accounts?.totalUsers, caption: "Managed through resellers", icon: Users, path: "/admin/users" },
    { label: "Credits in circulation", value: stats?.credits?.totalCreditsInCirculation, caption: "Combined account balances", icon: Wallet, path: "/admin/credits", accent: true },
  ];

  return (
    <div className="portal-overview">
      {/* Page Heading & Actions */}
      <header className="portal-page-heading">
        <div className="portal-heading-copy">
          <h1>Workspace overview</h1>
          <p>Across all accounts</p>
        </div>
        <div className="portal-page-actions items-center gap-2.5">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing} aria-busy={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin motion-reduce:animate-none size-3.5" : "size-3.5"} aria-hidden="true" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button size="sm" nativeButton={false} render={<Link to="/admin/credits?allocate=new" />}>
            Allocate credits
            <ArrowUpRight aria-hidden="true" className="size-3.5 ml-1" />
          </Button>
        </div>
      </header>

      {/* High-level Platform Totals */}
      <section aria-label="Workspace totals">
        <QueryState query={overview}>
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
