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
    <div className="dashboard-section-heading"><h2>{title}</h2><Button variant="outline" size="sm" nativeButton={false} render={<Link to={`${base}/campaigns${pendingOnly ? "?status=pending" : ""}`} />}>View all</Button></div>
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
    <div className="dashboard-section-heading"><h2>{role === "Reseller" ? "Resellers" : "Your users"}</h2><Button variant="outline" size="sm" nativeButton={false} render={<Link to={`${base}/${role === "Reseller" ? "resellers" : "users"}`} />}>Manage</Button></div>
    <QueryState query={query} empty={!accounts.length} emptyTitle={`No ${role === "Reseller" ? "resellers" : "users"} yet`} emptyDescription={`Add a ${role.toLowerCase()} to allocate credits.`}>
      <DataTable caption={role === "Reseller" ? "Resellers" : "Assigned users"} rows={accounts.slice(0, 5)} paginated={false} columns={[
        { key: "account", label: "Account", render: a => <div className="max-w-60 whitespace-normal break-words"><Link className="font-medium hover:underline" to={`${base}/${role === "Reseller" ? "resellers" : "users"}?search=${encodeURIComponent(a.email || a.username)}`}>{a.username}</Link><p className="mt-1 text-xs text-muted-foreground">{a.email}</p></div> },
        { key: "status", label: "Status", render: a => <StatusBadge status={a.status} /> },
      ]} />
    </QueryState>
  </section>;
}

export function RecentTransactions({ query, base }) {
  const transactions = query.data?.transactions || [];
  const rows = transactions.slice(0, 5);
  return (
    <section className="dashboard-section">
      <div className="dashboard-section-heading">
        <div>
          <h2>Recent credit movements</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Audited allocation and adjustment ledger</p>
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
                    className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium border ${
                      isReclaim
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : isAllocate
                        ? "border-blue-200 bg-blue-50 text-blue-800"
                        : "border-border bg-muted text-muted-foreground"
                    }`}
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
                  <span className="font-medium text-foreground">{ownerName(t.toUser)}</span>
                  {t.fromUser && (
                    <span className="text-muted-foreground block text-[11px]">from {ownerName(t.fromUser)}</span>
                  )}
                </div>
              ),
            },
            {
              key: "amount",
              label: "Credits",
              className: "text-right",
              render: (t) => {
                const isReclaim = t.type === "RECLAIM";
                return (
                  <span
                    className={`tabular-nums text-xs font-semibold ${
                      isReclaim ? "text-emerald-700" : "text-blue-700"
                    }`}
                  >
                    {isReclaim ? "+" : "-"}{number(t.amount)}
                  </span>
                );
              },
            },
            {
              key: "note",
              label: "Notes",
              render: (t) => (
                <span className="text-xs text-muted-foreground line-clamp-1 max-w-xs">
                  {t.notes || t.description || "—"}
                </span>
              ),
            },
          ]}
        />
      </QueryState>
    </section>
  );
}
