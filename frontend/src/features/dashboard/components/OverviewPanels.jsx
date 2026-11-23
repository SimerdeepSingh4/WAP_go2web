import TransactionAmount from "@/features/credits/components/TransactionAmount";
import { Link } from "react-router";
import { Building2, ClipboardList, Megaphone, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, QueryState, StatusBadge } from "@/features/dashboard/components/shared";
import { dateTime, number, ownerName } from "@/lib/format";
import { useAuth } from "@/features/auth/hooks/useAuth";
import TransactionReference from "../../credits/components/TransactionReference";
import { getTransactionNote } from "../../credits/lib/creditTransactionDisplay";
import CampaignReference from "../../campaigns/components/CampaignReference";
import OverviewMetricCards from "./OverviewMetricCards";

import "./overview-panels.css";

export function Summary({ items }) {
  return <OverviewMetricCards columns={items.length} items={items.map(({ hint, credit, ...item }) => ({ ...item, caption: hint, accent: credit }))} />;
}

function PanelTitle({ icon: Icon, children }) {
  return <h2 className="overview-panel-title"><span aria-hidden="true"><Icon size={18} /></span>{children}</h2>;
}

export function RecentCampaigns({ query, base, pendingOnly = false, showOwner = false, cards = false }) {
  const all = query.data?.data || [];
  const rows = [...all].filter(c => !pendingOnly || ["pending", "scheduled"].includes(c.status)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  const title = pendingOnly ? "Awaiting review" : "Recent campaigns";
  return <section className="dashboard-section">
    <div className="dashboard-section-heading">{pendingOnly || cards ? <PanelTitle icon={pendingOnly ? ClipboardList : Megaphone}>{title}</PanelTitle> : <h2>{title}</h2>}<Button variant="outline" size="sm" nativeButton={false} render={<Link to={`${base}/campaigns${pendingOnly ? "?status=pending" : ""}`} />}>View all</Button></div>
    <QueryState query={query} empty={!rows.length} emptyTitle={pendingOnly ? "No campaigns awaiting review" : "No campaigns yet"} emptyDescription={pendingOnly ? "New submissions will appear here." : "Create your first campaign to get started."} emptyAction={!pendingOnly && <Button nativeButton={false} render={<Link to={`${base}/campaigns/create`} />}>Create campaign</Button>}>
      {pendingOnly || cards ? (
        <ul className="overview-review-list">
          {rows.map(campaign => (
            <li key={campaign._id}>
              <div className="overview-record-top">
                <Link className="overview-record-name" to={`${base}/campaigns/${encodeURIComponent(campaign._id)}`}>{campaign.campaignTitle}</Link>
                <StatusBadge status={campaign.status} />
              </div>
              <p className="overview-record-meta">{showOwner && <>{ownerName(campaign.userId)} · </>}{number(campaign.totalRecipients)} recipients</p>
              <div className="overview-review-footer">
                <CampaignReference campaign={campaign} compact />
                <span>{dateTime(campaign.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <DataTable caption={title} rows={rows} paginated={false} columns={[
        { key: "campaignId", label: "Campaign ID", render: campaign => <CampaignReference campaign={campaign} compact /> },
        { key: "name", label: "Campaign", render: c => <div className="min-w-28 max-w-96 whitespace-normal break-words"><Link className="font-medium hover:underline" to={`${base}/campaigns/${encodeURIComponent(c._id)}`}>{c.campaignTitle}</Link>{showOwner && <p className="mt-1 text-xs text-muted-foreground">{ownerName(c.userId)}</p>}<p className="mt-1 text-xs text-muted-foreground">{dateTime(c.createdAt)} · {number(c.totalRecipients)} recipients</p></div> },
        { key: "status", label: "Status", className: "text-right", render: c => <StatusBadge status={c.status} /> },
      ]} />}
    </QueryState>
  </section>;
}

export function AccountList({ query, base, role }) {
  const accounts = (query.data?.users || []).filter(a => a.role === role);
  const accountPath = base + (role === "Reseller" ? "/resellers" : "/users");
  return <section className="dashboard-section">
    <div className="dashboard-section-heading"><PanelTitle icon={role === "Reseller" ? Building2 : Users}>{role === "Reseller" ? "Resellers" : "Your users"}</PanelTitle><Button variant="outline" size="sm" nativeButton={false} render={<Link to={accountPath} />}>Manage</Button></div>
    <QueryState query={query} empty={!accounts.length} emptyTitle={`No ${role === "Reseller" ? "resellers" : "users"} yet`} emptyDescription={`Add a ${role.toLowerCase()} to allocate credits.`} emptyAction={<Button variant="outline" nativeButton={false} render={<Link to={accountPath} />}>Manage {role === "Reseller" ? "resellers" : "users"}</Button>}>
      <ul className="overview-reseller-list">
          {accounts.slice(0, 5).map(account => (
            <li key={account._id || account.email}>
              <span className="overview-account-avatar" aria-hidden="true">{(account.username || account.email || "?").slice(0, 2).toUpperCase()}</span>
              <div>
                <Link className="overview-record-name" to={`${accountPath}?search=${encodeURIComponent(account.email || account.username)}`}>{account.username}</Link>
                <p className="overview-record-meta">{account.email}</p>
              </div>
              <StatusBadge status={account.status} />
            </li>
          ))}
        </ul>

    </QueryState>
  </section>;
}

export function RecentTransactions({ query, base }) {
  const { user } = useAuth();
  const transactions = query.data?.transactions || [];
  const rows = transactions.slice(0, 5);
  return (
    <section className="dashboard-section">
      <div className="dashboard-section-heading">
        <div>
          <PanelTitle icon={Wallet}>Recent credit movements</PanelTitle>
        </div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link to={base === "/admin" ? `${base}/activity` : `${base}/credits`} />}>
          View all activity
        </Button>
      </div>
      <QueryState
        query={query}
        empty={!rows.length}
        emptyTitle="No transactions recorded"
        emptyDescription="Credit allocations and adjustments will appear here."
      >
        <DataTable
          caption="Recent credit movements"
          rows={rows}
          paginated={false}
          columns={[
            { key: "transactionId", label: "Transaction ID", render: transaction => <TransactionReference transaction={transaction} /> },
            {
              key: "date",
              label: "Date",
              render: (t) => <span className="text-xs text-muted-foreground whitespace-nowrap">{dateTime(t.createdAt)}</span>,
            },
            {
              key: "type",
              label: "Type",
              render: (t) => {
                const isReclaim = t.type === "RECLAIM";
                const isAllocate = t.type === "ALLOCATE";
                return (
                  <span
                    className="portal-status inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border"
                    data-tone={isReclaim || isAllocate ? "success" : "neutral"}
                  >
                    {isReclaim ? "Credit Deducted" : isAllocate ? "Credit Added" : t.type}
                  </span>
                );
              },
            },
            {
              key: "account",
              label: "Account",
              render: (t) => (
                <div className="max-w-48 whitespace-normal break-words text-xs">
                  <span className="font-medium text-foreground">{ownerName(t.toUser, user?.role)}</span>
                  {t.fromUser && (
                    <span className="text-muted-foreground block text-[11px]">from {ownerName(t.fromUser, user?.role)}</span>
                  )}
                </div>
              ),
            },
            {
              key: "amount",
              label: "Credits",
              className: "text-right",
              render: t => <TransactionAmount transaction={t} viewer={user} />,
            },
            {
              key: "note",
              label: "Notes",
              render: (t) => {
                const noteText = getTransactionNote(t) || t.description || "—";
                return (
                  <span
                    className="text-xs text-muted-foreground whitespace-normal [overflow-wrap:anywhere] leading-relaxed block"
                    title={noteText !== "—" ? noteText : undefined}
                  >
                    {noteText}
                  </span>
                );
              },
            },
          ]}
        />
      </QueryState>
    </section>
  );
}
