// src/features/reseller/pages/Overview.jsx
import { FileText, Megaphone, RefreshCw, Users, Wallet, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useResellerQuery } from "../hooks/useReseller";
import { PageHeading, QueryState } from "@/features/admin/components/shared";
import { number } from "@/features/admin/lib/format";
import { CampaignCharts } from "@/features/admin/components/OverviewCharts";
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
    if (results.every((r) => !r.isError))
      toast.add({ title: "Overview refreshed", type: "success" });
  }

  return (
    <>
      <PageHeading
        title="Overview"
        description="Your users, campaigns, credits, and work that needs attention."
        action={
          <Button
            variant="outline"
            onClick={refresh}
            disabled={overview.isFetching || campaignsQuery.isFetching || accountsQuery.isFetching}
          >
            <RefreshCw className={overview.isFetching ? "animate-spin" : ""} />
            Refresh
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          [
            "My wallet",
            number(myBalance.data?.wallet?.balance),
            myBalance.data?.wallet?.isLocked ? "Expired & Locked" : "Your credit balance",
            myBalance.data?.wallet?.isLocked ? Lock : Wallet,
            myBalance.data?.wallet?.isLocked,
          ],
          ["My users", users.length, `${users.filter((u) => u.status === "active").length} active`, Users, false],
          ["Total campaigns", campaigns.length, "From your users", Megaphone, false],
          ["Credits allocated", number(stats?.credits?.totalAllocatedBySuperAdmin), "Received from admin", FileText, false],
        ].map(([label, value, caption, Icon, isLocked]) => (
          <Card key={label} className={`gap-3 rounded-lg shadow-none ${isLocked ? "border-red-300 bg-red-50/60" : ""}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
                {label}
              </CardTitle>
              <Icon className={`size-4 shrink-0 ${isLocked ? "text-red-600" : "text-muted-foreground"}`} aria-hidden="true" />
            </CardHeader>
            <CardContent>
              <p className={`break-words text-2xl font-semibold tabular-nums tracking-tight ${isLocked ? "text-red-700" : "text-foreground"}`}>
                {value}
              </p>
              <p className={`mt-1 text-xs ${isLocked ? "font-semibold text-red-600 inline-flex items-center gap-1" : "text-muted-foreground"}`}>
                {isLocked && <Lock className="size-3" />}
                {caption}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <QueryState query={campaignsQuery}>
        <CampaignCharts campaigns={campaigns} />
      </QueryState>
      {updated && <p className="text-xs text-muted-foreground">Last refreshed {updated}</p>}
    </>
  );
}
