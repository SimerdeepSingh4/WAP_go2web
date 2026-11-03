import { Link } from "react-router";
import { Megaphone, RefreshCw, Users, Wallet, Lock, Coins, Plus, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useResellerQuery } from "../hooks/useReseller";
import { PageHeading, QueryState } from "@/features/admin/components/shared";
import { number } from "@/features/admin/lib/format";
import { CampaignCharts } from "@/features/admin/components/OverviewCharts";
import ResellerOverviewWorkPanel from "../components/ResellerOverviewWorkPanel";
import { toast } from "@/components/ui/toast";

export default function Overview() {
  const overview = useResellerQuery("overview");
  const campaignsQuery = useResellerQuery("campaigns");
  const accountsQuery = useResellerQuery("accounts");
  const myBalance = useResellerQuery("myBalance");

  const campaigns = campaignsQuery.data?.data || [];
  const accounts = accountsQuery.data?.users || [];
  const users = accounts.filter((a) => a.role === "User");
  const stats = overview.data?.stats;
  const isLocked = Boolean(myBalance.data?.wallet?.isLocked);

  const updated = overview.dataUpdatedAt
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit",
        minute: "2-digit",
      }).format(overview.dataUpdatedAt)
    : null;

  async function refresh() {
    const results = await Promise.all([
      overview.refetch(),
      campaignsQuery.refetch(),
      accountsQuery.refetch(),
      myBalance.refetch(),
    ]);
    if (results.every((r) => !r.isError)) {
      toast.add({ title: "Overview refreshed", type: "success" });
    }
  }

  return (
    <>
      <PageHeading
        title="Overview"
        description="Your client users, campaigns, credit movements, and work that needs attention."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={refresh}
              disabled={overview.isFetching || campaignsQuery.isFetching || accountsQuery.isFetching || myBalance.isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${overview.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              render={<Link to="/reseller/campaigns/create" />}
              className="gap-1.5 font-semibold"
            >
              <Plus className="size-4" />
              Create Campaign
            </Button>
          </div>
        }
      />

      {/* Top 4 KPI Metric Cards (identical layout to Super Admin) */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          [
            "My Wallet Balance",
            number(myBalance.data?.wallet?.balance),
            isLocked ? "Expired & Locked" : "Available sending credits",
            isLocked ? Lock : Wallet,
            isLocked,
          ],
          [
            "My Client Users",
            users.length,
            `${users.filter((u) => u.status === "active").length} active accounts`,
            Users,
            false,
          ],
          [
            "Total Campaigns",
            campaigns.length,
            `${campaigns.filter((c) => c.status === "completed").length} completed dispatches`,
            Megaphone,
            false,
          ],
          [
            "Credits Purchased",
            number(stats?.credits?.creditsPurchasedThisMonth ?? stats?.wallet?.creditsPurchasedThisMonth ?? 0),
            "Received this month",
            Coins,
            false,
          ],
        ].map(([label, value, caption, Icon, locked]) => (
          <Card
            key={label}
            className={`gap-3 rounded-lg shadow-none ${
              locked ? "border-red-300 bg-red-50/60" : ""
            }`}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
                {label}
              </CardTitle>
              <Icon
                className={`size-4 shrink-0 ${
                  locked ? "text-red-600" : "text-muted-foreground"
                }`}
                aria-hidden="true"
              />
            </CardHeader>
            <CardContent>
              <p
                className={`break-words text-2xl font-semibold tabular-nums tracking-tight ${
                  locked ? "text-red-700" : "text-foreground"
                }`}
              >
                {value}
              </p>
              <p
                className={`mt-1 text-xs ${
                  locked
                    ? "font-semibold text-red-600 inline-flex items-center gap-1"
                    : "text-muted-foreground"
                }`}
              >
                {locked && <Lock className="size-3" />}
                {caption}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Work Operations Panel (Queue + Users + Delivery + Wallet) */}
      <ResellerOverviewWorkPanel
        campaignsQuery={campaignsQuery}
        accountsQuery={accountsQuery}
        myBalanceQuery={myBalance}
      />

      {/* Campaign Activity Analytics Charts */}
      <QueryState query={campaignsQuery}>
        <CampaignCharts campaigns={campaigns} />
      </QueryState>

      {updated && (
        <p className="text-xs text-muted-foreground">Last refreshed {updated}</p>
      )}
    </>
  );
}
