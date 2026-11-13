import { Link } from "react-router";
import { ArrowRight, ChevronRight, Clock3, FileText, Megaphone, Wallet, Lock } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryState, StatusBadge } from "@/features/dashboard/components/shared";
import { DeliveryChart } from "@/features/admin/components/OverviewCharts";
import { dateTime, needsReport, number, ownerName, waiting } from "@/lib/format";

function CampaignQueue({ query }) {
  const campaigns = query.data?.data || [];
  const pending = campaigns.filter(waiting);
  const queue = [...pending].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(0, 5);
  const shortcuts = [
    {
      label: "Awaiting execution",
      count: pending.length,
      path: "/reseller/campaigns?status=pending",
      icon: Clock3,
    },
    {
      label: "Ongoing",
      count: campaigns.filter((campaign) => campaign.status === "ongoing").length,
      path: "/reseller/campaigns?status=ongoing",
      icon: Megaphone,
    },
    {
      label: "Reports to view",
      count: campaigns.filter((c) => c.status === "completed" || needsReport(c)).length,
      path: "/reseller/reports",
      icon: FileText,
    },
  ];

  return (
    <Card className="min-w-0 gap-0 rounded-lg py-0 shadow-none">
      <QueryState query={query}>
        <div className="grid grid-cols-3 divide-x border-b bg-muted/30">
          {shortcuts.map(({ label, count, path, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className="group min-w-0 px-3 py-4 transition-colors hover:bg-muted/70 sm:px-5 sm:py-5"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                <ArrowRight
                  className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </div>
              <p
                className={`text-2xl font-semibold tabular-nums tracking-tight ${
                  count ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {number(count)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{label}</p>
            </Link>
          ))}
        </div>
        <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-4 sm:px-5">
          <div>
            <CardTitle>Campaign dispatch queue</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Pending execution (Oldest first)</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false} render={<Link to="/reseller/campaigns?status=pending" />}
          >
            View all
            <ArrowRight />
          </Button>
        </CardHeader>
        <CardContent className="px-0">
          <QueryState
            query={query}
            empty={!queue.length}
            emptyTitle="All caught up"
            emptyDescription="New client campaigns will appear here."
          >
            <ul className="divide-y border-t">
              {queue.map((campaign) => (
                <li key={campaign._id}>
                  <Link
                    to={`/reseller/campaigns?campaign=${campaign._id}`}
                    className="group flex min-w-0 items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium group-hover:text-primary">
                        {campaign.campaignTitle}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {ownerName(campaign.userId)}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground sm:hidden">
                        {number(campaign.totalRecipients)}{" "}
                        {campaign.totalRecipients === 1 ? "recipient" : "recipients"}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-xs tabular-nums">
                        {number(campaign.totalRecipients)}{" "}
                        {campaign.totalRecipients === 1 ? "recipient" : "recipients"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {dateTime(campaign.createdAt)}
                      </p>
                    </div>
                    <div className="shrink-0 sm:ml-2">
                      <StatusBadge status={campaign.status} />
                    </div>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </QueryState>
        </CardContent>
      </QueryState>
    </Card>
  );
}

function UserNetwork({ query }) {
  const users = (query.data?.users || []).filter((account) => account.role === "User");

  return (
    <Card className="min-w-0 gap-0 rounded-lg py-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <CardTitle>Client users network</CardTitle>
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/reseller/users" />}>
          Manage
          <ArrowRight />
        </Button>
      </CardHeader>
      <CardContent className="px-0">
        <QueryState
          query={query}
          empty={!users.length}
          emptyTitle="No client users yet"
          emptyDescription="Add client accounts to start allocating credits."
        >
          <ul className="divide-y border-t">
            {users.slice(0, 4).map((user) => (
              <li key={user._id}>
                <Link
                  to={`/reseller/users?search=${encodeURIComponent(user.email)}`}
                  className="group flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5"
                >
                  <Avatar aria-hidden="true">
                    <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                      {(user.username || user.email || "U").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium group-hover:text-primary">
                      {user.username}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {user.email} · {number(user.ratePerMsg)} credits/msg
                    </p>
                  </div>
                  <StatusBadge status={user.status} />
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </QueryState>
      </CardContent>
    </Card>
  );
}

export default function ResellerOverviewWorkPanel({
  campaignsQuery,
  accountsQuery,
  myBalanceQuery,
}) {
  const wallet = myBalanceQuery?.data?.wallet || {};
  const isLocked = Boolean(wallet.isLocked);

  return (
    <section
      aria-label="Campaign operations and accounts"
      className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"
    >
      <div className="min-w-0 space-y-5">
        <CampaignQueue query={campaignsQuery} />
        <UserNetwork query={accountsQuery} />
      </div>

      <div className="min-w-0 space-y-5">
        <QueryState query={campaignsQuery}>
          <DeliveryChart campaigns={campaignsQuery.data?.data || []} />
        </QueryState>

        <Card
          className={`gap-0 rounded-lg py-0 shadow-none ${
            isLocked ? "border-red-300 bg-red-50/60" : ""
          }`}
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div className="flex items-center gap-3">
              {isLocked ? (
                <Lock className="size-5 text-red-600" aria-hidden="true" />
              ) : (
                <Wallet className="size-5 text-muted-foreground" aria-hidden="true" />
              )}
              <div>
                <p className="text-xs text-muted-foreground">Reseller Wallet Balance</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p
                    className={`text-base font-semibold tabular-nums ${
                      isLocked ? "text-red-700 font-bold" : "text-foreground"
                    }`}
                  >
                    {number(wallet.balance)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">credits</span>
                  </p>
                  {isLocked && (
                    <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-semibold">
                      Locked
                    </span>
                  )}
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              nativeButton={false} render={<Link to="/reseller/credits" />}
            >
              Manage credits
              <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

