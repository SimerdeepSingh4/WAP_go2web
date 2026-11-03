import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { DataTable, QueryState, StatusBadge } from "@/features/admin/components/shared";
import { dateTime, number, ownerName } from "@/features/admin/lib/format";

export function Summary({ items }) {
  return <dl className="dashboard-summary">{items.map(({ label, value, hint, credit }) => <div className="dashboard-stat" data-credit={credit || undefined} key={label}><dt>{label}</dt><dd>{value}</dd>{hint && <p>{hint}</p>}</div>)}</dl>;
}

export function RecentCampaigns({ query, base, pendingOnly = false, showOwner = false }) {
  const all = query.data?.data || [];
  const rows = [...all].filter(c => !pendingOnly || ["pending", "scheduled"].includes(c.status)).sort((a, b) => pendingOnly ? new Date(a.createdAt) - new Date(b.createdAt) : new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6);
  const title = pendingOnly ? "Awaiting review" : "Recent campaigns";
  return <section className="dashboard-section">
    <div className="dashboard-section-heading"><h2>{title}</h2><Button variant="outline" size="sm" render={<Link to={`${base}/campaigns${pendingOnly ? "?status=pending" : ""}`} />}>View all</Button></div>
    <QueryState query={query} empty={!rows.length} emptyTitle={pendingOnly ? "No campaigns awaiting review" : "No campaigns yet"} emptyDescription={pendingOnly ? "New submissions will appear here." : "Submitted campaigns will appear here."}>
      <DataTable caption={title} rows={rows} paginated={false} columns={[
        { key: "name", label: "Campaign", render: c => <div className="min-w-28 max-w-96 whitespace-normal break-words"><Link className="font-medium hover:underline" to={`${base}/campaigns?campaign=${encodeURIComponent(c._id)}`}>{c.campaignTitle}</Link>{showOwner && <p className="mt-1 text-xs text-muted-foreground">{ownerName(c.userId)}</p>}<p className="mt-1 text-xs text-muted-foreground">{dateTime(c.createdAt)} · {number(c.totalRecipients)} recipients</p></div> },
        { key: "status", label: "Status", className: "text-right", render: c => <StatusBadge status={c.status} /> },
      ]} />
    </QueryState>
  </section>;
}

export function AccountList({ query, base, role }) {
  const accounts = (query.data?.users || []).filter(a => a.role === role);
  return <section className="dashboard-section">
    <div className="dashboard-section-heading"><h2>{role === "Reseller" ? "Resellers" : "Your users"}</h2><Button variant="outline" size="sm" render={<Link to={`${base}/${role === "Reseller" ? "resellers" : "users"}`} />}>Manage</Button></div>
    <QueryState query={query} empty={!accounts.length} emptyTitle={`No ${role === "Reseller" ? "resellers" : "users"} yet`} emptyDescription={`Add a ${role.toLowerCase()} to allocate credits.`}>
      <DataTable caption={role === "Reseller" ? "Resellers" : "Assigned users"} rows={accounts.slice(0, 5)} paginated={false} columns={[
        { key: "account", label: "Account", render: a => <div className="max-w-60 whitespace-normal break-words"><Link className="font-medium hover:underline" to={`${base}/${role === "Reseller" ? "resellers" : "users"}?search=${encodeURIComponent(a.email || a.username)}`}>{a.username}</Link><p className="mt-1 text-xs text-muted-foreground">{a.email}</p></div> },
        { key: "status", label: "Status", render: a => <StatusBadge status={a.status} /> },
      ]} />
    </QueryState>
  </section>;
}
