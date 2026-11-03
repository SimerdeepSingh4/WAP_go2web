import { useSearchParams, Link } from "react-router";
import {
  MoreHorizontal,
  Eye,
  FileText,
  Megaphone,
  Clock,
  CheckCircle,
  RefreshCw,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
} from "@/features/admin/components/shared";
import { useResellerQuery } from "../hooks/useReseller";
import {
  number,
  dateTime,
  statusLabels,
  ownerName,
  needsReport,
  published,
  waiting,
} from "@/features/admin/lib/format";
import CampaignDetail from "@/components/dashboard/ReadOnlyCampaignDetail";

export default function ResellerCampaigns({ reports = false }) {
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

  // Metrics counts
  const totalCount = all.length;
  const pendingCount = all.filter(waiting).length;
  const ongoingCount = all.filter((c) => c.status === "ongoing").length;
  const completedCount = all.filter((c) => ["completed", "sent"].includes(c.status)).length;

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
        <button
          className="max-w-64 truncate text-left font-medium hover:underline text-foreground cursor-pointer"
          onClick={() => open(c)}
        >
          {c.campaignTitle}
        </button>
      ),
    },
    {
      key: "owner",
      label: "Account",
      sort: (c) => ownerName(c.userId),
      render: (c) => (
        <div>
          <p className="max-w-40 truncate font-medium text-foreground">{ownerName(c.userId)}</p>
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
      render: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "report",
      label: reports ? "Last report" : "Report",
      render: (c) =>
        published(c) ? (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
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
            render: (c) => (
              <span className="text-xs text-muted-foreground">{dateTime(c.createdAt)}</span>
            ),
          },
        ]
      : [
          {
            key: "delivered",
            label: "Delivered",
            className: "text-right",
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
      render: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${c.campaignTitle}`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => open(c)}>
              <Eye className="size-4 mr-2" />
              View campaign
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
            : "Review and manage campaign submissions and execution status."
        }
        action={
          <div className="flex items-center gap-2">
            {!reports && (
              <Button
                render={<Link to="/reseller/campaigns/create" />}
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

      {/* Top KPI Cards (matching Super Admin) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              Total campaigns
              <Megaphone className="size-4" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
              {number(totalCount)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              Awaiting review
              <Clock className="size-4 text-amber-500" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
              {number(pendingCount)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              Ongoing Dispatches
              <RefreshCw className="size-4 text-primary" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
              {number(ongoingCount)}
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-none">
          <CardContent className="p-4 sm:p-5">
            <p className="flex items-center justify-between text-xs text-muted-foreground font-medium">
              Completed & Published
              <CheckCircle className="size-4 text-emerald-500" />
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">
              {number(completedCount)}
            </p>
          </CardContent>
        </Card>
      </div>

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
    </>
  );
}
