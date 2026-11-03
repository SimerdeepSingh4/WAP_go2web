import { Link } from "react-router";
import { ArrowRight, ArrowUpRight, ChevronRight, Clock3, FileText, Megaphone, Wallet } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { QueryState, StatusBadge } from "./shared";
import { DeliveryChart } from "./OverviewCharts";
import { dateTime, needsReport, number, ownerName, waiting } from "../lib/format";

function CampaignQueue({ query }) {
  const campaigns = query.data?.data || [];
  const pending = campaigns.filter(waiting);
  const queue = [...pending].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(0, 5);
  const shortcuts = [
    { label: "Awaiting execution", count: pending.length, path: "/admin/campaigns?status=pending", icon: Clock3, tone: "amber" },
    { label: "Ongoing campaigns", count: campaigns.filter((campaign) => campaign.status === "ongoing").length, path: "/admin/campaigns?status=ongoing", icon: Megaphone, tone: "green" },
    { label: "Reports to publish", count: campaigns.filter(needsReport).length, path: "/admin/reports?status=unreported", icon: FileText, tone: "brown" },
  ];

  return (
    <Card className="portal-card portal-queue-card">
      <QueryState query={query}>
        <div className="portal-queue-summary">
          {shortcuts.map(({ label, count, path, icon: Icon, tone }) => (
            <Link key={path} to={path} className={`portal-queue-shortcut portal-tone-${tone}`}>
              <span className="portal-shortcut-top"><Icon aria-hidden="true" /><ArrowUpRight aria-hidden="true" /></span>
              <strong>{number(count)}</strong><span>{label}</span>
            </Link>
          ))}
        </div>
        <div className="portal-card-heading">
          <div><h3>Campaign queue</h3><p>Oldest requests first · up to 5 shown</p></div>
          <Button variant="ghost" size="sm" render={<Link to="/admin/campaigns?status=pending" />}>View all<ArrowRight aria-hidden="true" /></Button>
        </div>
        <QueryState query={query} empty={!queue.length} emptyTitle="You're all caught up" emptyDescription="Campaigns awaiting execution will appear here.">
          <ul className="portal-campaign-list">
            {queue.map((campaign) => (
              <li key={campaign._id}>
                <Link to={`/admin/campaigns?campaign=${encodeURIComponent(campaign._id)}`} className="portal-campaign-row">
                  <span className="portal-campaign-icon"><Megaphone aria-hidden="true" /></span>
                  <span className="portal-campaign-copy">
                    <strong title={campaign.campaignTitle}>{campaign.campaignTitle || "Untitled campaign"}</strong>
                    <span className="portal-campaign-owner" title={ownerName(campaign.userId)}>{ownerName(campaign.userId)}</span>
                    <span className="portal-campaign-date">{dateTime(campaign.createdAt)}</span>
                  </span>
                  <span className="portal-campaign-meta">
                    <span className="portal-campaign-audience"><strong>{number(campaign.totalRecipients)}</strong> {campaign.totalRecipients === 1 ? "recipient" : "recipients"}</span>
                    <StatusBadge status={campaign.status} />
                  </span>
                  <ChevronRight className="portal-row-chevron" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </QueryState>
      </QueryState>
    </Card>
  );
}

function ResellerNetwork({ query }) {
  const resellers = (query.data?.users || []).filter((account) => account.role === "Reseller");
  return (
    <Card className="portal-card">
      <div className="portal-card-heading">
        <div><h3>Reseller network</h3><p>{query.data ? `${number(resellers.length)} resellers · up to 4 shown` : "Accounts connected to your workspace"}</p></div>
        <Button variant="ghost" size="sm" render={<Link to="/admin/resellers" />}>Manage<ArrowUpRight aria-hidden="true" /></Button>
      </div>
      <QueryState query={query} empty={!resellers.length} emptyTitle="Build your network" emptyDescription="Add a reseller to start allocating credits.">
        <ul className="portal-reseller-list">
          {resellers.slice(0, 4).map((reseller) => {
            const name = reseller.username || reseller.email || "Reseller";
            return (
              <li key={reseller._id}>
                <Link to={`/admin/resellers?search=${encodeURIComponent(reseller.email || name)}`} className="portal-reseller-row">
                  <Avatar className="portal-reseller-avatar" aria-hidden="true"><AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                  <span className="portal-reseller-copy"><strong title={name}>{name}</strong><span title={reseller.email}>{reseller.email || "No email provided"}</span></span>
                  <StatusBadge status={reseller.status} />
                  <ChevronRight className="portal-row-chevron" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </QueryState>
    </Card>
  );
}

export default function OverviewWorkPanel({ campaignsQuery, accountsQuery }) {
  return (
    <section aria-labelledby="operations-heading" className="portal-section">
      <div className="portal-section-heading">
        <div><p className="portal-eyebrow">Daily operations</p><h2 id="operations-heading">What needs your attention</h2></div>
        <Link to="/admin/activity" className="portal-text-link">View activity<ArrowUpRight aria-hidden="true" /></Link>
      </div>
      <div className="portal-work-grid">
        <div className="portal-card-stack"><CampaignQueue query={campaignsQuery} /><ResellerNetwork query={accountsQuery} /></div>
        <div className="portal-card-stack">
          <QueryState query={campaignsQuery}><DeliveryChart campaigns={campaignsQuery.data?.data || []} /></QueryState>
          <Card className="portal-card portal-credit-card">
            <div className="portal-credit-top"><span className="portal-credit-icon"><Wallet aria-hidden="true" /></span><span className="portal-credit-label">Admin balance</span></div>
            <p className="portal-credit-value">Unlimited<span>Super admin account</span></p>
            <p className="portal-credit-description">Allocate credits and manage balances across your network.</p>
            <Button variant="outline" render={<Link to="/admin/credits" />} className="portal-credit-button">Manage credits<ArrowUpRight aria-hidden="true" /></Button>
          </Card>
        </div>
      </div>
    </section>
  );
}
