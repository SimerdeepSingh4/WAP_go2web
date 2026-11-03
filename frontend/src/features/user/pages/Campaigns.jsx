import { Link, useSearchParams } from "react-router";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUserQuery } from "../hooks/useUser";
import { PageHeading, SearchBox, FilterSelect, QueryState, DataTable, StatusBadge } from "@/features/admin/components/shared";
import { dateTime, number, statusLabels, published } from "@/features/admin/lib/format";
import ReadOnlyCampaignDetail from "@/components/dashboard/ReadOnlyCampaignDetail";

export default function Campaigns() {
  const query = useUserQuery("campaigns");
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const status = params.get("status") || "all";
  function update(key, value) { setParams(old => { const next = new URLSearchParams(old); value ? next.set(key, value) : next.delete(key); return next; }, { replace: true }); }
  const all = query.data?.data || [];
  const rows = all.filter(c => (c.campaignTitle || "").toLowerCase().includes(search.toLowerCase()) && (status === "all" || c.status === status || (status === "completed" && c.status === "sent")));
  return <>
    <PageHeading title="Campaigns" description="Your submissions and reported results." action={<Button render={<Link to="/user/campaigns/create" />}><Plus />Create campaign</Button>} />
    <div className="flex flex-wrap items-center justify-between gap-3"><SearchBox value={search} onChange={v => update("search", v)} label="Search campaigns" /><div className="flex flex-wrap gap-2"><FilterSelect label="Campaign status" value={status} onChange={v => update("status", v)} options={[{ value: "all", label: "All statuses" }, ...["pending", "scheduled", "ongoing", "completed", "stopped", "failed"].map(value => ({ value, label: statusLabels[value] }))]} /><Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw />Refresh</Button></div></div>
    <QueryState query={query} empty={!all.length} emptyTitle="No campaigns yet" emptyDescription="Create a campaign to submit your first message for review.">
      <DataTable key={`${search}-${status}`} caption="Your campaigns" rows={rows} columns={[
        { key: "title", label: "Campaign", sort: c => c.campaignTitle, render: c => <button className="text-left font-medium hover:underline max-w-72 whitespace-normal break-words" onClick={() => update("campaign", c._id)}>{c.campaignTitle}</button> },
        { key: "recipients", label: "Recipients", className: "text-right", sort: c => c.totalRecipients, render: c => number(c.totalRecipients) },
        { key: "status", label: "Status", render: c => <StatusBadge status={c.status} /> },
        { key: "credits", label: "Credits charged", className: "text-right", render: c => number(c.creditsDeducted) },
        { key: "report", label: "Results", render: c => published(c) ? "Published" : "Awaiting report" },
        { key: "created", label: "Submitted", sort: c => new Date(c.createdAt).getTime(), render: c => dateTime(c.createdAt) },
      ]} />
    </QueryState>
    {params.get("campaign") && <ReadOnlyCampaignDetail id={params.get("campaign")} onClose={() => update("campaign", "")} />}
  </>;
}
