import { Link } from "react-router";
import { ArrowUpRight, Building2, Megaphone, RefreshCw, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAdminQuery } from "../hooks/useAdmin";
import { QueryState } from "../components/shared";
import { number } from "../lib/format";

import { RecentCampaigns, AccountList } from "@/components/dashboard/OverviewPanels";
import { toast } from "@/components/ui/toast";

export default function Overview() {
  const overview = useAdminQuery("overview");
  const campaignsQuery = useAdminQuery("campaigns");
  const accountsQuery = useAdminQuery("accounts");
  const stats = overview.data?.stats;
  const refreshing = [overview, campaignsQuery, accountsQuery].some((query) => query.isFetching);
  const updated = overview.dataUpdatedAt
    ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(overview.dataUpdatedAt)
    : null;

  async function refresh() {
    try {
      const results = await Promise.all([overview.refetch(), campaignsQuery.refetch(), accountsQuery.refetch()]);
      if (results.some((result) => result.isError)) throw new Error("Some dashboard data could not be refreshed.");
      toast.add({ title: "Overview refreshed", type: "success" });
    } catch (error) {
      toast.add({ title: "Refresh incomplete", description: error?.message || "Please try again.", type: "error" });
    }
  }

  const metrics = [
    { label: "Total campaigns", value: stats?.campaigns?.totalCampaigns, caption: "Across all accounts", icon: Megaphone, path: "/admin/campaigns" },
    { label: "Active resellers", value: stats?.accounts?.activeResellers, caption: `${number(stats?.accounts?.totalResellers)} resellers in your network`, icon: Building2, path: "/admin/resellers" },
    { label: "User accounts", value: stats?.accounts?.totalUsers, caption: "Managed through resellers", icon: Users, path: "/admin/users" },
    { label: "Credits in circulation", value: stats?.credits?.totalCreditsInCirculation, caption: "Combined account balances", icon: Wallet, path: "/admin/credits", accent: true },
  ];

  return (
    <div className="portal-overview">
      <header className="portal-page-heading">
        <div className="portal-heading-copy">
          <h1>Overview</h1>
          <p>Review submissions and manage accounts.</p>
        </div>
        <div className="portal-page-actions">
          <Button variant="outline" onClick={refresh} disabled={refreshing} aria-busy={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button render={<Link to="/admin/credits?allocate=new" />}>Allocate credits<ArrowUpRight aria-hidden="true" /></Button>
        </div>
      </header>

      <section aria-label="Workspace totals">
        <QueryState query={overview}>
          <div className="portal-metrics">
            {metrics.map(({ label, value, caption, icon: Icon, path, accent }) => (
              <Card key={label} className={`portal-card portal-metric${accent ? " portal-metric-accent" : ""}`}>
                <Link to={path} className="portal-metric-link">
                  <div className="portal-metric-top"><span>{label}</span><span className="portal-metric-icon"><Icon aria-hidden="true" /></span></div>
                  <p className="portal-metric-value">{value == null ? "—" : number(value)}</p>
                  <div className="portal-metric-bottom"><span>{caption}</span><ArrowUpRight aria-hidden="true" /></div>
                </Link>
              </Card>
            ))}
          </div>
        </QueryState>
      </section>

      <div className="dashboard-two-column">
        <RecentCampaigns query={campaignsQuery} base="/admin" pendingOnly showOwner />
        <AccountList query={accountsQuery} base="/admin" role="Reseller" />
      </div>
      {updated && <p className="portal-updated">Last refreshed {updated} IST</p>}
    </div>
  );
}
