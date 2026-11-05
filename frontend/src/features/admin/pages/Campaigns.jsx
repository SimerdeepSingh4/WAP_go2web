import { useState } from "react";
import { useSearchParams, Link } from "react-router";
import { Popover } from "@base-ui/react/popover";
import { MoreHorizontal, Eye, FileText, RefreshCw, CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageHeading, SearchBox, QueryState, DataTable, StatusBadge } from "../components/shared";
import { useAdminQuery } from "../hooks/useAdmin";
import { number, dateTime, ownerName, needsReport, published, waiting } from "../lib/format";
import CampaignDetail from "../components/CampaignDetail";

const IST_OFFSET = 330 * 60_000;

function campaignDay(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp + IST_OFFSET).toISOString().slice(0, 10) : null;
}

function dateFromKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined;
}

function dateKey(date) {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function Campaigns({ reports = false }) {
  const query = useAdminQuery("campaigns");
  const [params, setParams] = useSearchParams();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const search = params.get("search") || "";
  const status = params.get("status") || "all";
  const selectedDateKey = params.get("date") || "";
  const selectedDate = dateFromKey(selectedDateKey);
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
  const datedCampaigns = selectedDateKey
    ? all.filter((campaign) => campaignDay(campaign.createdAt) === selectedDateKey)
    : all;

  // Metrics counts
  const totalCount = datedCampaigns.length;
  const pendingCount = datedCampaigns.filter(waiting).length;
  const ongoingCount = datedCampaigns.filter((c) => c.status === "ongoing").length;
  const completedCount = datedCampaigns.filter((c) => ["completed", "sent"].includes(c.status)).length;
  const needsReportCount = datedCampaigns.filter(needsReport).length;

  const rows = datedCampaigns.filter((c) => {
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

  const columns = [
    {
      key: "title",
      label: "Campaign",
      sort: (c) => c.campaignTitle,
      render: (c) => (
        <div className="max-w-64">
          <Link
            to={`/admin/campaigns/${c._id}`}
            className="truncate text-left font-medium hover:underline text-foreground block w-full"
          >
            {c.campaignTitle}
          </Link>
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
      label: "Report",
      render: (c) =>
        published(c) ? (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
            Published ({number(c.campaignSummary.delivered)})
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
            <DropdownMenuItem render={<Link to={`/admin/campaigns/${c._id}`} />}>
              <Eye className="size-4 mr-2" />
              View Campaign
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to={`/admin/campaigns/${c._id}/report`} />}>
              <FileText className="size-4 mr-2" />
              View Report
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
        { label: "Published", val: "published", count: datedCampaigns.filter(published).length },
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
        <div className="flex flex-wrap items-center gap-2">
          <Popover.Root open={calendarOpen} onOpenChange={setCalendarOpen}>
            <Popover.Trigger
              render={<Button type="button" variant={selectedDateKey ? "default" : "outline"} size="sm" className="gap-2" />}
            >
              <CalendarDays className="size-4" />
              {selectedDate ? selectedDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Filter by date"}
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner align="end" sideOffset={8} className="z-50">
                <Popover.Popup className="rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    defaultMonth={selectedDate || new Date()}
                    onSelect={(day) => {
                      update("date", dateKey(day));
                      setCalendarOpen(false);
                    }}
                  />
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
          {selectedDateKey && (
            <Button variant="ghost" size="icon-sm" aria-label="Clear date filter" title="Clear date filter" onClick={() => update("date", "")}>
              <X className="size-4" />
            </Button>
          )}
          {(search || status !== "all" || selectedDateKey) && (
            <Button variant="ghost" size="sm" onClick={() => setParams({})}>
              Clear all filters
            </Button>
          )}
        </div>
      </div>

      <QueryState
        query={query}
        empty={!rows.length}
        emptyTitle={reports ? "No campaign reports yet" : "No campaigns yet"}
        emptyDescription={selectedDateKey ? "No campaigns were submitted on this date." : "Campaigns created by your resellers and users will appear here."}
      >
        <DataTable
          key={`${search}-${status}-${selectedDateKey}`}
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
