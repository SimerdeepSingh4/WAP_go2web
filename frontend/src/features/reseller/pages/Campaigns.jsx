import CampaignReference from "@/features/campaigns/components/CampaignReference";
import { useState } from "react";
import { useSearchParams, Link } from "react-router";
import {
  MoreHorizontal,
  FileText,
  RefreshCw,
  Plus,
  Trash2,
  Image as ImageIcon,
  Video,
  MessageSquare,
  Users,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import CampaignDeleteDialog from "@/features/campaigns/components/CampaignDeleteDialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  PageHeading,
  SearchBox,
  FilterSelect,
  QueryState,
  DataTable,
  StatusBadge,
} from "@/features/dashboard/components/shared";
import { useResellerMutation, useResellerQuery } from "../hooks/useReseller";
import {
  number,
  dateTime,
  statusLabels,
  ownerName,
  needsReport,
  published,
  waiting,
} from "@/lib/format";
import CampaignDetail from "@/features/campaigns/components/detail/ReadOnlyCampaignDetail";
import UserAvatar from "@/features/accounts/components/UserAvatar";

function MessageTypeBadge({ type }) {
  const norm = (type || "").toLowerCase();
  if (norm === "image") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/60">
        <ImageIcon className="size-2.5 text-blue-600 dark:text-blue-400" />
        Image
      </span>
    );
  }
  if (norm === "video") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200/60 dark:border-purple-900/60">
        <Video className="size-2.5 text-purple-600 dark:text-purple-400" />
        Video
      </span>
    );
  }
  if (norm === "document" || norm === "pdf") {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/60 dark:border-amber-900/60">
        <FileText className="size-2.5 text-amber-600 dark:text-amber-400" />
        Document
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground border border-border/50">
      <MessageSquare className="size-2.5 text-muted-foreground" />
      {norm ? norm.charAt(0).toUpperCase() + norm.slice(1) : "Text"}
    </span>
  );
}

function formatSubmitted(value) {
  if (!value || Number.isNaN(new Date(value).getTime())) return "—";
  const str = dateTime(value);
  const parts = str.split(", ");
  if (parts.length === 2) {
    return (
      <div className="flex flex-col text-xs leading-tight">
        <span className="font-medium text-foreground/85">{parts[0]}</span>
        <span className="text-[11px] text-muted-foreground">{parts[1]}</span>
      </div>
    );
  }
  return <span className="text-xs text-muted-foreground">{str}</span>;
}

export default function ResellerCampaigns({ reports = false }) {
  const [campaignToDelete, setCampaignToDelete] = useState(null);
  const deleteMutation = useResellerMutation(
    "deleteCampaign",
    "Campaign deleted successfully",
    () => setCampaignToDelete(null)
  );
  const query = useResellerQuery("campaigns");
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const status = params.get("status") || "all";
  const selected = params.get("campaign");

  function update(key, value) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        value ? next.set(key, value) : next.delete(key);
        return next;
      },
      { replace: true }
    );
  }

  const all = query.data?.data || [];

  const rows = all.filter((c) => {
    const matches = `${c.campaignTitle} CMP-${c._id} ${ownerName(c.userId)} ${c.userId?.email || ""}`
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus =
      status === "all" ||
      (status === "unreported"
        ? needsReport(c)
        : status === "published"
        ? published(c)
        : status === "pending"
        ? waiting(c)
        : c.status === status || (status === "completed" && c.status === "sent"));
    return matches && matchesStatus;
  });

  const columns = [
    { key: "campaignId", label: "Campaign ID", className: "w-28 whitespace-nowrap", render: campaign => <CampaignReference campaign={campaign} compact /> },
    {
      key: "title",
      label: "Campaign",
      className: "w-full min-w-[200px]",
      sort: (c) => c.campaignTitle,
      render: (c) => (
        <div className="min-w-0 flex flex-col gap-1">
          <Link
            to={`/reseller/campaigns/${c._id}`}
            className="truncate text-left font-semibold hover:underline text-foreground block text-xs hover:text-primary transition-colors"
          >
            {c.campaignTitle}
          </Link>
          <div className="flex items-center gap-1.5">
            <MessageTypeBadge type={c.messageType} />
          </div>
        </div>
      ),
    },
    {
      key: "owner",
      label: "Account",
      className: "min-w-[160px] whitespace-nowrap",
      sort: (c) => ownerName(c.userId),
      render: (c) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <UserAvatar user={c.userId} className="size-7 shrink-0" />
          <p className="min-w-0 font-medium text-xs text-foreground whitespace-nowrap truncate max-w-[140px]" title={ownerName(c.userId)}>{ownerName(c.userId)}</p>
        </div>
      ),
    },
    {
      key: "audience",
      label: "Recipients",
      className: "w-28 whitespace-nowrap",
      sort: (c) => c.totalRecipients,
      render: (c) => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-muted/70 text-foreground border border-border/60 tabular-nums">
          <Users className="size-3 text-muted-foreground" />
          {number(c.totalRecipients)}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      className: "w-28 whitespace-nowrap",
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "report",
      label: "Report",
      className: "w-36 whitespace-nowrap",
      render: (c) =>
        published(c) ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
            <CheckCircle2 className="size-3" />
            Published ({number(c.campaignSummary.delivered)})
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border/50">
            <Clock className="size-3" />
            Awaiting report
          </span>
        ),
    },
    ...(!reports
      ? [
          {
            key: "created",
            label: "Submitted",
            className: "w-36 whitespace-nowrap",
            sort: (c) => new Date(c.createdAt).getTime(),
            render: (c) => formatSubmitted(c.createdAt),
          },
        ]
      : [
          {
            key: "delivered",
            label: "Delivered",
            className: "w-28 whitespace-nowrap text-right",
            render: (c) =>
              published(c) ? (
                <span className="tabular-nums font-semibold text-emerald-600">
                  {number(c.campaignSummary.delivered)}
                </span>
              ) : (
                "—"
              ),
          },
        ]),
    {
      key: "actions",
      label: <span className="sr-only">Actions</span>,
      className: "w-12 text-right",
      render: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label={`Actions for ${c.campaignTitle}`} />}
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem render={<Link to={`/reseller/campaigns/${c._id}/report`} />}>
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
  ];

  return (
    <>
      <PageHeading
        title={reports ? "Reports" : "Campaigns"}
        description={
          reports
            ? "Review campaign performance reports from your users."
            : "View submissions and published results for your users."
        }
        action={
          <div className="flex items-center gap-2">
            {!reports && (
              <Button
                nativeButton={false} render={<Link to="/reseller/campaigns/create" />}
                size="sm"
                className="gap-1.5 font-semibold shadow-xs"
              >
                <Plus className="size-4" />
                Create campaign
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox
          value={search}
          onChange={(value) => update("search", value)}
          label="Search campaigns or accounts"
        />
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Filter campaigns"
            value={status}
            onChange={(value) => update("status", value)}
            options={
              reports
                ? [
                    { value: "all", label: "All reports" },
                    { value: "unreported", label: "Needs report" },
                    { value: "published", label: "Published" },
                  ]
                : [
                    { value: "all", label: "All statuses" },
                    ...Object.entries(statusLabels)
                      .filter(([key]) => !["sent", "active", "blocked"].includes(key))
                      .map(([value, label]) => ({
                        value,
                        label: value === "pending" ? "Awaiting execution" : label,
                      })),
                  ]
            }
          />
          {(search || status !== "all") && (
            <Button variant="ghost" size="sm" onClick={() => setParams({})}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      <QueryState
        query={query}
        empty={!all.length}
        emptyTitle={reports ? "No campaign reports yet" : "No campaigns yet"}
        emptyDescription="Campaigns created by you or your users will appear here."
      >
        <DataTable
          key={`${search}-${status}`}
          caption={reports ? "Campaign performance reports" : "Campaign list"}
          rows={rows}
          columns={columns}
          compact={true}
        />
      </QueryState>

      {selected && (
        <CampaignDetail
          key={selected}
          id={selected}
          onClose={() => {
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.delete("campaign");
              next.delete("editReport");
              return next;
            });
          }}
        />
      )}
      {campaignToDelete && <CampaignDeleteDialog campaign={campaignToDelete} mutation={deleteMutation} onClose={() => setCampaignToDelete(null)} />}
    </>
  );
}
