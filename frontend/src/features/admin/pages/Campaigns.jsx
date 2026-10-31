import { useSearchParams } from "react-router";
import { MoreHorizontal, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageHeading, SearchBox, FilterSelect, QueryState, DataTable, StatusBadge } from "../components/shared";
import { useAdminQuery } from "../hooks/useAdmin";
import { number, dateTime, statusLabels, ownerName, needsReport, published, waiting } from "../lib/format";
import CampaignDetail from "../components/CampaignDetail";

export default function Campaigns({ reports = false }) {
  const query = useAdminQuery("campaigns");
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const status = params.get("status") || "all";
  const selected = params.get("campaign");
  function update(key, value) { setParams((current) => { const next = new URLSearchParams(current); value ? next.set(key, value) : next.delete(key); return next; }, { replace: true }); }
  const all = query.data?.data || [];
  const rows = all.filter((c) => {
    const matches = `${c.campaignTitle} ${ownerName(c.userId)} ${c.userId?.email || ""}`.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = status === "all" || (status === "unreported" ? needsReport(c) : status === "published" ? published(c) : status === "pending" ? waiting(c) : c.status === status || (status === "completed" && c.status === "sent"));
    return matches && matchesStatus;
  });
  const open = (campaign, report = false) => setParams((current) => { const next = new URLSearchParams(current); next.set("campaign", campaign._id); if (report) next.set("editReport", "1"); else next.delete("editReport"); return next; });
  const columns = [
    { key: "title", label: "Campaign", sort: (c) => c.campaignTitle, render: (c) => <button className="max-w-64 truncate text-left font-medium hover:underline" onClick={() => open(c)}>{c.campaignTitle}</button> },
    { key: "owner", label: "Account", sort: (c) => ownerName(c.userId), render: (c) => <div><p className="max-w-40 truncate">{ownerName(c.userId)}</p><p className="mt-0.5 text-xs text-muted-foreground">{c.userId?.role || "—"}</p></div> },
    { key: "audience", label: "Recipients", className: "text-right", sort: (c) => c.totalRecipients, render: (c) => <span className="tabular-nums">{number(c.totalRecipients)}</span> },
    { key: "status", label: "Status", render: (c) => <StatusBadge status={c.status} /> },
    { key: "report", label: reports ? "Last report" : "Report", render: (c) => published(c) ? <span className="text-xs text-muted-foreground">{reports ? dateTime(c.campaignSummary.reportedAt) : "Published"}</span> : <span className="text-xs text-muted-foreground">Awaiting report</span> },
    ...(!reports ? [{ key: "created", label: "Submitted", sort: (c) => new Date(c.createdAt).getTime(), render: (c) => <span className="text-xs text-muted-foreground">{dateTime(c.createdAt)}</span> }] : [{ key: "delivered", label: "Delivered", className: "text-right", render: (c) => published(c) ? number(c.campaignSummary.delivered) : "—" }]),
    { key: "actions", label: <span className="sr-only">Actions</span>, render: (c) => <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${c.campaignTitle}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-44"><DropdownMenuItem onClick={() => open(c)}><Eye />View campaign</DropdownMenuItem><DropdownMenuItem onClick={() => open(c, true)}><FileText />{published(c) ? "Update report" : "Publish report"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> },
  ];
  return <><PageHeading title={reports ? "Reports" : "Campaigns"} description={reports ? "Publish actual campaign results and review reported performance." : "Review submissions and update campaign progress."} />
    <div className="flex flex-wrap items-center justify-between gap-3"><SearchBox value={search} onChange={(value) => update("search", value)} label="Search campaigns or accounts" /><div className="flex flex-wrap items-center gap-2"><FilterSelect label="Filter campaigns" value={status} onChange={(value) => update("status", value)} options={reports ? [{ value: "all", label: "All reports" }, { value: "unreported", label: "Needs report" }, { value: "published", label: "Published" }] : [{ value: "all", label: "All statuses" }, ...Object.entries(statusLabels).filter(([key]) => !["sent", "active", "blocked"].includes(key)).map(([value, label]) => ({ value, label: value === "pending" ? "Awaiting execution" : label }))]} />{(search || status !== "all") && <Button variant="ghost" onClick={() => setParams({})}>Clear filters</Button>}</div></div>
    <QueryState query={query} empty={!all.length} emptyTitle={reports ? "No campaign reports yet" : "No campaigns yet"} emptyDescription="Campaigns created by your resellers and users will appear here."><DataTable key={`${search}-${status}`} caption={reports ? "Campaign performance reports" : "Campaign list"} rows={rows} columns={columns} /></QueryState>
    {selected && <CampaignDetail key={selected} id={selected} initialReport={params.get("editReport") === "1"} onClose={() => { setParams((current) => { const next = new URLSearchParams(current); next.delete("campaign"); next.delete("editReport"); return next; }); }} />}
  </>;
}
