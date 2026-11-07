import CampaignReference from "@/components/dashboard/CampaignReference";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Plus, RefreshCw, MoreHorizontal, Eye, FileText, Trash2 } from "lucide-react";
import CampaignDeleteDialog from "@/features/campaigns/components/CampaignDeleteDialog";
import { useUserMutation } from "../hooks/useUser";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useUserQuery } from "../hooks/useUser";
import { PageHeading, SearchBox, FilterSelect, QueryState, DataTable, StatusBadge } from "@/features/admin/components/shared";
import { dateTime, number, statusLabels, published } from "@/features/admin/lib/format";
import ReadOnlyCampaignDetail from "@/components/dashboard/ReadOnlyCampaignDetail";

export default function Campaigns() {
  const [campaignToDelete, setCampaignToDelete] = useState(null);
  const deleteMutation = useUserMutation("deleteCampaign", "Campaign deleted successfully", () => setCampaignToDelete(null));
  const query = useUserQuery("campaigns");
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const status = params.get("status") || "all";
  function update(key, value) { setParams(old => { const next = new URLSearchParams(old); value ? next.set(key, value) : next.delete(key); return next; }, { replace: true }); }
  const all = query.data?.data || [];
  const rows = all.filter(c => `${c.campaignTitle || ""} CMP-${c._id}`.toLowerCase().includes(search.toLowerCase()) && (status === "all" || c.status === status || (status === "completed" && c.status === "sent")));
  return <>
    <PageHeading title="Campaigns" description="Your submissions and reported results." action={<Button nativeButton={false} render={<Link to="/user/campaigns/create" />}><Plus />Create campaign</Button>} />
    <div className="flex flex-wrap items-center justify-between gap-3"><SearchBox value={search} onChange={v => update("search", v)} label="Search campaigns" /><div className="flex flex-wrap gap-2"><FilterSelect label="Campaign status" value={status} onChange={v => update("status", v)} options={[{ value: "all", label: "All statuses" }, ...["pending", "scheduled", "ongoing", "completed", "stopped", "failed"].map(value => ({ value, label: statusLabels[value] }))]} /><Button variant="outline" disabled={query.isFetching} onClick={() => query.refetch()}><RefreshCw />Refresh</Button></div></div>
    <QueryState query={query} empty={!all.length} emptyTitle="No campaigns yet" emptyDescription="Create a campaign to submit your first message for review.">
      <DataTable key={`${search}-${status}`} caption="Your campaigns" rows={rows} columns={[
        { key: "campaignId", label: "Campaign ID", render: campaign => <CampaignReference campaign={campaign} compact /> },
        { key: "title", label: "Campaign", sort: c => c.campaignTitle, render: c => <Link to={`/user/campaigns/${c._id}`} className="text-left font-medium hover:underline max-w-72 whitespace-normal break-words block">{c.campaignTitle}</Link> },
        { key: "recipients", label: "Recipients", className: "text-right", sort: c => c.totalRecipients, render: c => number(c.totalRecipients) },
        { key: "status", label: "Status", render: c => <StatusBadge status={c.status} /> },
        { key: "credits", label: "Credits charged", className: "text-right", render: c => number(c.creditsDeducted) },
        { key: "report", label: "Results", render: c => published(c) ? "Published" : "Awaiting report" },
        { key: "created", label: "Submitted", sort: c => new Date(c.createdAt).getTime(), render: c => dateTime(c.createdAt) },
        {
          key: "actions",
          label: <span className="sr-only">Actions</span>,
          render: (c) => (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" aria-label={`Actions for ${c.campaignTitle}`} />}
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem render={<Link to={`/user/campaigns/${c._id}`} />}>
                  <Eye className="size-4 mr-2" />
                  View Campaign
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link to={`/user/campaigns/${c._id}/report`} />}>
                  <FileText className="size-4 mr-2" />
                  View Report
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setCampaignToDelete(c)}
                >
                  <Trash2 className="size-4 mr-2" />
                  Delete Campaign
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ),
        },
      ]} />
    </QueryState>
    {params.get("campaign") && <ReadOnlyCampaignDetail id={params.get("campaign")} onClose={() => update("campaign", "")} />}
    {campaignToDelete && <CampaignDeleteDialog campaign={campaignToDelete} mutation={deleteMutation} onClose={() => setCampaignToDelete(null)} />}
  </>;
}
