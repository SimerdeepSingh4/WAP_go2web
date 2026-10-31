import { useSearchParams } from "react-router";
import { MoreHorizontal, Eye, FileText, Megaphone, Clock, CheckCircle, AlertTriangle, RefreshCw } from "lucide-react";
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

  const open = (campaign, report = false) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("campaign", campaign._id);
      if (report) next.set("editReport", "1");
      else next.delete("editReport");
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
          {c.status === "ongoing" && (
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
            </span>
          )}
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
        { label: "Published", val: "published", count: totalCount - needsReportCount },
      ]
    : [
        { label: "All", val: "all", count: totalCount },
        { label: "Queued / Pending", val: "pending", count: pendingCount },
        { label: "Ongoing", val: "ongoing", count: ongoingCount },
        { label: "Completed", val: "completed", count: completedCount },
        { label: "Needs Report", val: "unreported", count: needsReportCount },
      ];

  return (
    <>
      <PageHeading
        title={reports ? "Campaign Reports" : "Campaign Operations"}
        description={
          reports
            ? "Publish actual campaign results, deliver metrics, and review execution performance."
            : "Monitor the BullMQ campaign dispatch queue, manage submissions, and update execution status."
        }
        action={
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
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Total Campaigns
              <Megaphone className="size-4" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{number(totalCount)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Queue & Pending
              <Clock className="size-4 text-amber-500" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-600">{number(pendingCount)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Completed
              <CheckCircle className="size-4 text-emerald-500" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{number(completedCount)}</p>
          </CardContent>
        </Card>
        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground">
              Awaiting Reports
              <AlertTriangle className="size-4 text-blue-500" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{number(needsReportCount)}</p>
          </CardContent>
        </Card>
      </div>

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
                {tab.count}
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
    </>
  );
}
