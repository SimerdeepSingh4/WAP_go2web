import CampaignReference from "@/features/campaigns/components/CampaignReference";
import "@/features/campaigns/components/campaign-list.css";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Plus, Eye, FileText, Trash2 } from "lucide-react";
import CampaignDeleteDialog from "@/features/campaigns/components/CampaignDeleteDialog";
import { useUserMutation } from "../hooks/useUser";
import { Button } from "@/components/ui/button";
import RowActionsMenu from "@/features/dashboard/components/RowActionsMenu";
import { useUserQuery } from "../hooks/useUser";
import { PageHeading, SearchBox, FilterSelect, QueryState, DataTable, StatusBadge, ClearFiltersButton } from "@/features/dashboard/components/shared";
import { dateTime, number, statusLabels, published } from "@/lib/format";
import ReadOnlyCampaignDetail from "@/features/campaigns/components/detail/ReadOnlyCampaignDetail";

function campaignResult(c) {
  return published(c) ? <Link className="font-medium text-primary-text underline underline-offset-4" to={`/user/campaigns/${c._id}/report`}>View report</Link> : "Awaiting report";
}

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
    <PageHeading inlineMobile title="Campaigns" description="Your submissions and reported results." action={<Button nativeButton={false} render={<Link to="/user/campaigns/create" />}><Plus />Create campaign</Button>} />
    <div className="flex flex-wrap items-center justify-between gap-3"><SearchBox value={search} onChange={v => update("search", v)} label="Search campaigns" /><div className="flex flex-wrap gap-2"><FilterSelect label="Campaign status" value={status} onChange={v => update("status", v)} options={[{ value: "all", label: "All statuses" }, ...["pending", "scheduled", "ongoing", "completed", "stopped", "failed"].map(value => ({ value, label: statusLabels[value] }))]} /></div></div>
    <QueryState query={query} empty={!all.length} emptyTitle="No campaigns yet" emptyDescription="Create a campaign to submit your first message for review." emptyAction={<Button nativeButton={false} render={<Link to="/user/campaigns/create" />}>Create campaign</Button>}>
      <DataTable key={`${search}-${status}`} className="user-campaign-table" mobile={{ featured: ["status", "recipients", "report"] }} caption="Your campaigns" rows={rows} emptyTitle="No campaigns match your filters" emptyAction={<ClearFiltersButton />} columns={[
        { key: "campaignId", label: "Campaign ID", render: campaign => <CampaignReference campaign={campaign} compact /> },
        { key: "title", label: "Campaign", sort: c => c.campaignTitle, render: c => (
          <>
            <Link to={`/user/campaigns/${c._id}`} className="text-left font-medium hover:underline max-w-72 whitespace-normal break-words block">{c.campaignTitle}</Link>
            <div className="user-campaign-secondary"><CampaignReference campaign={c} compact /></div>
          </>
        ) },
        { key: "recipients", label: "Recipients", className: "text-right", sort: c => c.totalRecipients, render: c => (
          <>
            {number(c.totalRecipients)}
            <div className="user-campaign-secondary">{number(c.creditsDeducted)} credits charged</div>
          </>
        ) },
        { key: "status", label: "Status", render: c => (
          <>
            <StatusBadge status={c.status} />
            <div className="user-campaign-secondary">{campaignResult(c)}</div>
          </>
        ) },
        { key: "credits", label: "Credits charged", className: "text-right", render: c => number(c.creditsDeducted) },
        { key: "report", label: "Results", render: campaignResult },
        { key: "created", label: "Submitted", sort: c => new Date(c.createdAt).getTime(), render: c => dateTime(c.createdAt) },
        {
          key: "actions",
          label: <span className="sr-only">Actions</span>,
          render: (c) => (
            <RowActionsMenu
              name={c.campaignTitle}
              actions={[
                { label: "View Campaign", icon: Eye, to: `/user/campaigns/${c._id}` },
                { label: "View Report", icon: FileText, to: `/user/campaigns/${c._id}/report` },
                { label: "Delete Campaign", icon: Trash2, destructive: true, onClick: () => setCampaignToDelete(c) },
              ]}
            />
          ),
        },
      ]} />
    </QueryState>
    {params.get("campaign") && <ReadOnlyCampaignDetail id={params.get("campaign")} onClose={() => update("campaign", "")} />}
    {campaignToDelete && <CampaignDeleteDialog campaign={campaignToDelete} mutation={deleteMutation} onClose={() => setCampaignToDelete(null)} />}
  </>;
}
