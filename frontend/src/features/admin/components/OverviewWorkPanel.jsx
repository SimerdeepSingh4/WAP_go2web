import { Link } from "react-router";
import { ArrowRight, ChevronRight, Clock3, FileText, Megaphone, Wallet } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryState, StatusBadge } from "./shared";
import { DeliveryChart } from "./OverviewCharts";
import { dateTime, needsReport, number, ownerName, waiting } from "../lib/format";

function CampaignQueue({ query }) {
  const campaigns = query.data?.data || [];
  const pending = campaigns.filter(waiting);
  const queue = [...pending].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(0, 5);
  const shortcuts = [
    { label: "Awaiting execution", count: pending.length, path: "/admin/campaigns?status=pending", icon: Clock3 },
    { label: "Ongoing", count: campaigns.filter((campaign) => campaign.status === "ongoing").length, path: "/admin/campaigns?status=ongoing", icon: Megaphone },
    { label: "Reports to publish", count: campaigns.filter(needsReport).length, path: "/admin/reports?status=unreported", icon: FileText },
  ];

  return <Card className="min-w-0 gap-0 rounded-lg py-0 shadow-none">
    <QueryState query={query}>
      <div className="grid grid-cols-3 divide-x border-b bg-muted/30">
        {shortcuts.map(({ label, count, path, icon: Icon }) => <Link key={path} to={path} className="group min-w-0 px-3 py-4 transition-colors hover:bg-muted/70 sm:px-5 sm:py-5">
          <div className="mb-3 flex items-center justify-between gap-2"><Icon className="size-4 text-muted-foreground" aria-hidden="true" /><ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" /></div>
          <p className={`text-2xl font-semibold tabular-nums tracking-tight ${count ? "text-foreground" : "text-muted-foreground"}`}>{number(count)}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{label}</p>
        </Link>)}
      </div>
      <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-4 sm:px-5">
        <div><CardTitle>Campaign queue</CardTitle><p className="mt-1 text-xs text-muted-foreground">Oldest first</p></div>
        <Button variant="ghost" size="sm" render={<Link to="/admin/campaigns?status=pending" />}>View all<ArrowRight /></Button>
      </CardHeader>
      <CardContent className="px-0">
        <QueryState query={query} empty={!queue.length} emptyTitle="You're all caught up" emptyDescription="New campaigns will appear here.">
          <ul className="divide-y border-t">
            {queue.map((campaign) => <li key={campaign._id}>
              <Link to={`/admin/campaigns?campaign=${campaign._id}`} className="group flex min-w-0 items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium group-hover:text-primary">{campaign.campaignTitle}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{ownerName(campaign.userId)}</p>
                  <p className="mt-1 text-xs tabular-nums text-muted-foreground sm:hidden">{number(campaign.totalRecipients)} {campaign.totalRecipients === 1 ? "recipient" : "recipients"}</p>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="text-xs tabular-nums">{number(campaign.totalRecipients)} {campaign.totalRecipients === 1 ? "recipient" : "recipients"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{dateTime(campaign.createdAt)}</p>
                </div>
                <div className="shrink-0 sm:ml-2"><StatusBadge status={campaign.status} /></div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>)}
          </ul>
        </QueryState>
      </CardContent>
    </QueryState>
  </Card>;
}

function ResellerNetwork({ query }) {
  const resellers = (query.data?.users || []).filter((account) => account.role === "Reseller");
  return <Card className="min-w-0 gap-0 rounded-lg py-0 shadow-none">
    <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-4 sm:px-5">
      <CardTitle>Reseller network</CardTitle>
      <Button variant="ghost" size="sm" render={<Link to="/admin/resellers" />}>Manage<ArrowRight /></Button>
    </CardHeader>
    <CardContent className="px-0">
      <QueryState query={query} empty={!resellers.length} emptyTitle="No resellers yet" emptyDescription="Add a reseller to get started.">
        <ul className="divide-y border-t">
          {resellers.slice(0, 4).map((reseller) => <li key={reseller._id}>
            <Link to={`/admin/resellers?search=${encodeURIComponent(reseller.email)}`} className="group flex min-w-0 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5">
              <Avatar aria-hidden="true"><AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">{(reseller.username || reseller.email || "R").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium group-hover:text-primary">{reseller.username}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{reseller.email}</p></div>
              <StatusBadge status={reseller.status} /><ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>)}
        </ul>
      </QueryState>
    </CardContent>
  </Card>;
}

export default function OverviewWorkPanel({ campaignsQuery, accountsQuery }) {
  return <section aria-label="Campaign operations and accounts" className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <div className="min-w-0 space-y-5">
      <CampaignQueue query={campaignsQuery} />
      <ResellerNetwork query={accountsQuery} />
    </div>
    <div className="min-w-0 space-y-5">
      <QueryState query={campaignsQuery}><DeliveryChart campaigns={campaignsQuery.data?.data || []} /></QueryState>
      <Card className="gap-0 rounded-lg py-0 shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="flex items-center gap-3"><Wallet className="size-5 text-muted-foreground" aria-hidden="true" /><div><p className="text-xs text-muted-foreground">Master Reserve</p><p className="mt-1 text-base font-semibold">Unlimited</p></div></div>
          <Button variant="outline" size="sm" render={<Link to="/admin/credits" />}>Manage credits<ArrowRight /></Button>
        </CardContent>
      </Card>
    </div>
  </section>;
}
