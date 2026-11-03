import { useSearchParams, Link } from "react-router";
import { MoreHorizontal, Eye, FileText, Megaphone, Clock, CheckCircle, AlertTriangle, RefreshCw, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

  // Metrics counts
  const totalCount = all.length;
  const pendingCount = all.filter(waiting).length;
  const ongoingCount = all.filter((c) => c.status === "ongoing").length;
  const completedCount = all.filter((c) => ["completed", "sent"].includes(c.status)).length;
  const needsReportCount = all.filter(needsReport).length;

  const rows = all.filter((c) => {
    const matches = `${c.campaignTitle} ${ownerName(c.userId)} ${c.userId?.email || ""}`
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

  const open = (campaign, report = false, editStatus = false) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("campaign", campaign._id);
      if (report) next.set("editReport", "1");
      else next.delete("editReport");
      if (editStatus) next.set("editStatus", "1");
      else next.delete("editStatus");
      return next;
    });

  const columns = [
    {
      key: "title",
      label: "Campaign",
      sort: (c) => c.campaignTitle,
      render: (c) => (
        <div className="max-w-64">
          <button
            className="truncate text-left font-medium hover:underline text-foreground block w-full"
            onClick={() => open(c)}
          >
            {c.campaignTitle}
          </button>
          <span className="text-xs text-muted-foreground">
            {c.messageType ? `${c.messageType.toUpperCase()} Message` : "Standard"}
          </span>
        </div>
      ),
    },
    {
      key: "owner",
      label: "Account",
      sort: (c) => ownerName(c.userId),
      render: (c) => (
        <div>
          <p className="max-w-40 truncate font-medium text-xs">{ownerName(c.userId)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{c.userId?.role || "—"}</p>
        </div>
      ),
    },
    {
      key: "audience",
      label: "Recipients",
      className: "text-right",
      sort: (c) => c.totalRecipients,
      render: (c) => <span className="tabular-nums font-semibold">{number(c.totalRecipients)}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (c) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={c.status} />
        </div>
      ),
    },
    {
      key: "report",
      label: reports ? "Last report" : "Report",
      render: (c) =>
        published(c) ? (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            {reports ? dateTime(c.campaignSummary.reportedAt) : "Published"}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
            Awaiting report
          </span>
        ),
    },
    ...(!reports
      ? [
          {
            key: "created",
            label: "Submitted",
            sort: (c) => new Date(c.createdAt).getTime(),
            render: (c) => <span className="text-xs text-muted-foreground">{dateTime(c.createdAt)}</span>,
          },
        ]
      : [
          {
            key: "delivered",
            label: "Delivered",
            className: "text-right",
            render: (c) => (published(c) ? number(c.campaignSummary.delivered) : "—"),
          },
        ]),
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
            <DropdownMenuItem onClick={() => open(c)}>
              <Eye className="size-4 mr-2" />
              View campaign
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => open(c, false, true)}>
              <Pencil className="size-4 mr-2" />
              Change status
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => open(c, true)}>
              <FileText className="size-4 mr-2" />
              {published(c) ? "Update report" : "Publish report"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const quickFilterTabs = reports
    ? [
        { label: "All reports", val: "all", count: totalCount },
        { label: "Needs report", val: "unreported", count: needsReportCount },
        { label: "Published", val: "published", count: all.filter(published).length },
      ]
    : [
        { label: "All", val: "all", count: totalCount },
        { label: "Awaiting review", val: "pending", count: pendingCount },
        { label: "Ongoing", val: "ongoing", count: ongoingCount },
        { label: "Completed", val: "completed", count: completedCount },
        { label: "Needs report", val: "unreported", count: needsReportCount },
      ];

  return (
    <>
      <PageHeading
        title={reports ? "Reports" : "Campaigns"}
        description={
          reports
            ? "Review and publish recorded campaign results."
            : "Review submissions and update campaign status."
        }
        action={
          <div className="flex items-center gap-2">
            {!reports && (
              <Button
                render={<Link to="/admin/campaigns/create" />}
                size="sm"
                className="gap-1.5 font-semibold"
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

      {/* Filter Tabs Bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b pb-3">
        {quickFilterTabs.map((tab) => {
          const isCurrent = status === tab.val;
          return (
            <button
              key={tab.val}
              onClick={() => update("status", tab.val === "all" ? "" : tab.val)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                isCurrent
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-semibold ${
                  isCurrent ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted-foreground/15 text-foreground"
                }`}
              >
                {query.isSuccess ? tab.count : "-"}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox value={search} onChange={(value) => update("search", value)} label="Search campaigns or accounts..." />
        {(search || status !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => setParams({})}>
            Clear all filters
          </Button>
        )}
      </div>

      <QueryState
        query={query}
        empty={!all.length}
        emptyTitle={reports ? "No campaign reports yet" : "No campaigns yet"}
        emptyDescription="Campaigns created by your resellers and users will appear here."
      >
        <DataTable
          key={`${search}-${status}`}
          caption={reports ? "Campaign performance reports" : "Campaign list"}
          rows={rows}
          columns={columns}
        />
      </QueryState>

      {selected && (
        <CampaignDetail
          key={selected}
          id={selected}
          initialReport={params.get("editReport") === "1"}
          initialStatus={params.get("editStatus") === "1"}
          onClose={() => {
            setParams((current) => {
              const next = new URLSearchParams(current);
              next.delete("campaign");
              next.delete("editReport");
              next.delete("editStatus");
              return next;
            });
          }}
        />
      )}
    </>
  );
}
