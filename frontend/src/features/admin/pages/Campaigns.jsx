import CampaignReference from "@/features/campaigns/components/CampaignReference";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useSearchParams, Link } from "react-router";
import { Popover } from "@base-ui/react/popover";
import { MoreHorizontal, Eye, FileText, CalendarDays, Trash2, Download, Image as ImageIcon, Video, MessageSquare, Users, CheckCircle2, Clock, X } from "lucide-react";
import CampaignDeleteDialog from "@/features/campaigns/components/CampaignDeleteDialog";
import { useAdminMutation } from "../hooks/useAdmin";
import { Button } from "@/components/ui/button";
import CampaignFilterCalendar from "../components/CampaignFilterCalendar";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageHeading, QueryState, DataTable, StatusBadge, ClearFiltersButton } from "../../dashboard/components/shared";
import { useAdminQuery } from "../hooks/useAdmin";
import { number, dateTime, ownerName, needsReport, published, waiting } from "../../../lib/format";
import CampaignDetail from "../components/CampaignDetail";
import UserAvatar from "@/features/accounts/components/UserAvatar";
import { downloadProfileDp } from "@/features/campaigns/lib/downloadProfileDp";
import { toast } from "@/components/ui/toast";
import "@/features/campaigns/components/campaign-list.css";

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

export default function Campaigns({ reports = false }) {
  const query = useAdminQuery("campaigns");
  const [params, setParams] = useSearchParams();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [draftRange, setDraftRange] = useState({ from: undefined, to: undefined });
  const [campaignToDelete, setCampaignToDelete] = useState(null);
  const deleteMutation = useAdminMutation("deleteCampaign", "Campaign deleted successfully", () => setCampaignToDelete(null));
  const today = dateFromKey(campaignDay(new Date()));
  const yesterday = today ? new Date(today.getTime() - 86400000) : undefined;
  const sevenDaysAgo = today ? new Date(today.getTime() - 6 * 86400000) : undefined;
  const search = params.get("search") || "";
  const defaultStatus = reports ? "all" : "pending";
  const status = params.get("status") || defaultStatus;
  const selectedDateKey = params.get("date") || "";
  const rangeFromKey = params.get("from") || selectedDateKey;
  const rangeToKey = params.get("to") || selectedDateKey;
  const selectedRange = {
    from: dateFromKey(rangeFromKey),
    to: dateFromKey(rangeToKey),
  };
  const hasCompleteRange = Boolean(selectedRange.from && selectedRange.to);
  const presetParam = params.get("preset") || "";
  const detectedPreset = (() => {
    if (presetParam) return presetParam;
    if (!hasCompleteRange) return "custom";
    if (today && rangeFromKey === dateKey(today) && rangeToKey === dateKey(today)) return "today";
    if (yesterday && rangeFromKey === dateKey(yesterday) && rangeToKey === dateKey(yesterday)) return "yesterday";
    if (sevenDaysAgo && today && rangeFromKey === dateKey(sevenDaysAgo) && rangeToKey === dateKey(today)) return "7days";
    return "custom";
  })();
  const [activePreset, setActivePreset] = useState("custom");
  const hasDateFilter = Boolean(selectedDateKey || params.has("from") || params.has("to") || params.has("preset"));

  function applyRange(start, end, preset) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("date");
        next.set("from", start);
        next.set("to", end);
        if (preset) {
          next.set("preset", preset);
        } else {
          next.delete("preset");
        }
        return next;
      },
      { replace: true }
    );
    setCalendarOpen(false);
  }

  function applyPreset(preset) {
    if (preset === "today" && today) {
      const k = dateKey(today);
      applyRange(k, k, "today");
    } else if (preset === "yesterday" && yesterday) {
      const k = dateKey(yesterday);
      applyRange(k, k, "yesterday");
    } else if (preset === "7days" && sevenDaysAgo && today) {
      applyRange(dateKey(sevenDaysAgo), dateKey(today), "7days");
    } else if (preset === "custom") {
      setActivePreset("custom");
    }
  }

  const dateFilterLabel = (() => {
    if (!hasCompleteRange) {
      return rangeFromKey ? "Select end date" : "Filter by date";
    }
    if (presetParam === "today" || (today && rangeFromKey === dateKey(today) && rangeToKey === dateKey(today))) {
      return "Today";
    }
    if (presetParam === "yesterday" || (yesterday && rangeFromKey === dateKey(yesterday) && rangeToKey === dateKey(yesterday))) {
      return "Yesterday";
    }
    if (presetParam === "7days" || (sevenDaysAgo && today && rangeFromKey === dateKey(sevenDaysAgo) && rangeToKey === dateKey(today))) {
      return "7days";
    }
    return selectedRange.from.getTime() === selectedRange.to.getTime()
      ? selectedRange.from.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : `${selectedRange.from.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${selectedRange.to.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`;
  })();
  const hasFilters = Boolean(search || status !== defaultStatus || hasDateFilter);
  const reducedMotion = useReducedMotion();
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
  const datedCampaigns = hasCompleteRange
    ? all.filter((campaign) => {
        const day = campaignDay(campaign.createdAt);
        return day && day >= rangeFromKey && day <= rangeToKey;
      })
    : all;

  // Published, completed campaigns leave the work queue but remain in history.
  const campaignQueue = datedCampaigns.filter((campaign) =>
    !(["completed", "sent"].includes(campaign.status) && published(campaign))
  );

  // Metrics counts
  const totalCount = reports ? datedCampaigns.length : campaignQueue.length;
  const pendingCount = datedCampaigns.filter(waiting).length;
  const ongoingCount = datedCampaigns.filter((c) => c.status === "ongoing").length;
  const completedCount = datedCampaigns.filter((c) => ["completed", "sent"].includes(c.status)).length;
  const failedCount = datedCampaigns.filter((c) => c.status === "failed").length;
  const needsReportCount = datedCampaigns.filter(needsReport).length;

  const rows = (reports || status === "completed" ? datedCampaigns : campaignQueue).filter((c) => {
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
    {
      key: "campaignId",
      label: "Campaign ID",
      className: "w-28 whitespace-nowrap",
      render: campaign => <CampaignReference campaign={campaign} compact />
    },
    {
      key: "title",
      label: "Campaign",
      className: "w-48 whitespace-nowrap",
      sort: (c) => c.campaignTitle,
      render: (c) => (
        <div className="campaign-title-copy flex w-44 max-w-full min-w-0 flex-col gap-1">
          <Link
            to={`/admin/campaigns/${c._id}`}
            title={c.campaignTitle}
            className="block overflow-hidden text-ellipsis whitespace-nowrap text-left text-xs font-semibold text-foreground transition-colors hover:text-primary hover:underline"
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
      className: "w-px whitespace-nowrap",
      sort: (c) => ownerName(c.userId),
      render: (c) => (
        <div className="campaign-account-cell flex w-max max-w-44 items-center gap-3">
          <div className="campaign-account-avatar relative size-9 shrink-0">
            <UserAvatar user={c.userId} className="size-9" />
            {(c.profileDp || c.userId?.dp_img) && (
              <button
                type="button"
                onClick={async (event) => {
                  event.stopPropagation();
                  try { await downloadProfileDp(c._id); }
                  catch (error) { toast.add({ title: "DP download failed", description: error.response?.data?.message || "Could not download profile picture.", type: "error" }); }
                }}
                aria-label={`Download profile picture for ${ownerName(c.userId)}`}
                title={`Download ${ownerName(c.userId)}’s profile picture`}
                className="absolute -right-1 -bottom-0.5 z-10 grid size-5 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-xs outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                style={{ minHeight: 20, minWidth: 20 }}
              >
                <Download aria-hidden="true" className="size-3" />
              </button>
            )}
          </div>
          <div className="campaign-account-name min-w-0 max-w-32">
            <p className="overflow-hidden text-ellipsis whitespace-nowrap text-xs font-medium text-foreground" title={ownerName(c.userId)}>
              {ownerName(c.userId)}
            </p>
            <p className="text-[11px] capitalize text-muted-foreground">
              {c.userId?.role || "—"}
            </p>
          </div>
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
      render: (c) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge status={c.status} />
        </div>
      ),
    },
    {
      key: "report",
      label: "Report",
      className: "w-36 whitespace-nowrap",
      render: (c) =>
        published(c) ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
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
            className: "w-28 whitespace-nowrap",
            render: (c) => (published(c) ? number(c.campaignSummary.delivered) : "—"),
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
            <DropdownMenuItem render={<Link to={`/admin/campaigns/${c._id}`} />}>
              <Eye className="size-4 mr-2" />
              View Campaign
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to={`/admin/campaigns/${c._id}/report`} />}>
              <FileText className="size-4 mr-2" />
              View Report
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive cursor-pointer"
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

  const quickFilterTabs = reports
    ? [
        { label: "All reports", val: "all", count: totalCount },
        { label: "Needs report", val: "unreported", count: needsReportCount },
        { label: "Published", val: "published", count: datedCampaigns.filter(published).length },
      ]
    : [
        { label: "Awaiting review", val: "pending", count: pendingCount },
        { label: "Ongoing", val: "ongoing", count: ongoingCount },
        { label: "Completed", val: "completed", count: completedCount },
        { label: "Failed", val: "failed", count: failedCount },
        { label: "Needs report", val: "unreported", count: needsReportCount },
        { label: "All", val: "all", count: totalCount },
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
      />

      {/* Filter Tabs Bar */}
      <div className="campaign-list-toolbar flex flex-wrap items-center justify-between gap-3 border-b pb-3">
      <div data-tour="campaign-status" className="flex flex-wrap items-center gap-1.5">
        {quickFilterTabs.map((tab) => {
          const isCurrent = status === tab.val;
          return (
            <button
              key={tab.val}
              onClick={() => update("status", tab.val === defaultStatus ? "" : tab.val)}
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

        <div className="ml-auto flex w-[236px] max-w-full items-center gap-2">
          <Popover.Root open={calendarOpen} onOpenChange={(open) => {
            if (open) {
              setDraftRange(selectedRange);
              setActivePreset("");
            }
            setCalendarOpen(open);
          }}>
            <Popover.Trigger
                render={<Button data-tour="campaign-dates" data-filtered={hasCompleteRange || undefined} type="button" title={dateFilterLabel} variant={hasCompleteRange ? "default" : "outline"} size="sm" className="campaign-date-filter-trigger gap-2" />}
            >
              <CalendarDays className="size-4" />
              <span className="truncate">{dateFilterLabel}</span>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner align="end" sideOffset={8} className="z-50">
                <Popover.Popup className="campaign-calendar-popup">
                  {activePreset === "custom" ? (
                    <>
                      <CampaignFilterCalendar
                        latestDate={today}
                        selected={draftRange}
                        defaultMonth={draftRange.from || selectedRange.from || new Date()}
                        onSelect={(range) => setDraftRange(range || { from: undefined, to: undefined })}
                      />
                      <p className="px-2 pb-2 text-center text-xs text-muted-foreground" aria-live="polite">
                        {draftRange.from && !draftRange.to ? "Select an end date" : "Select a start and end date"}
                      </p>
                      <div className="flex justify-between gap-2 border-t border-border px-2 pt-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setDraftRange({ from: undefined, to: undefined })}>Clear</Button>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setCalendarOpen(false)}>Cancel</Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!draftRange.from || !draftRange.to || draftRange.from > today || draftRange.to > today}
                            onClick={() => {
                              const start = dateKey(draftRange.from);
                              const end = dateKey(draftRange.to);
                              applyRange(start <= end ? start : end, start <= end ? end : start, "custom");
                            }}
                          >
                            Apply range
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="border-b border-border px-3 py-2">
                        <span className="text-xs font-semibold text-foreground">Filter by date</span>
                      </div>
                      <div className="p-2 space-y-1">
                        {[
                          { id: "today", label: "Today", desc: today?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
                          { id: "yesterday", label: "Yesterday", desc: yesterday?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
                          { id: "7days", label: "7days", desc: sevenDaysAgo && today ? `${sevenDaysAgo.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${today.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : "" },
                          { id: "custom", label: "Custom days", desc: "" },
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                              if (item.id === "custom") {
                                setActivePreset("custom");
                              } else {
                                applyPreset(item.id);
                              }
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                              detectedPreset === item.id
                                ? "bg-primary text-primary-foreground font-semibold"
                                : "hover:bg-muted text-foreground"
                            }`}
                          >
                            <span>{item.label}</span>
                            {item.desc ? (
                              <span className={`text-[11px] ${detectedPreset === item.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                                {item.desc}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
          <motion.div initial={false} animate={{ opacity: hasFilters ? 1 : 0 }} transition={{ duration: reducedMotion ? 0 : 0.16 }} style={{ display: hasFilters ? undefined : "none" }} aria-hidden={!hasFilters}>
            <Button variant="ghost" size="icon" aria-label="Clear all filters" title="Clear all filters" disabled={!hasFilters} tabIndex={hasFilters ? 0 : -1} onClick={() => setParams({})}>
              <X aria-hidden="true" />
            </Button>
          </motion.div>
        </div>
      </div>

      <QueryState
        query={query}
        empty={!rows.length}
        emptyTitle={hasFilters ? "No campaigns match your filters" : reports ? "No campaign reports yet" : "No campaigns yet"}
        emptyDescription={hasCompleteRange ? "No campaigns were submitted during this date range." : "Campaigns created by your resellers and users will appear here."}
        emptyAction={hasFilters && <ClearFiltersButton keys={["search", "status", "date", "from", "to", "preset"]} />}
      >
        <DataTable
          key={`${search}-${status}-${rangeFromKey}-${rangeToKey}`}
          caption={reports ? "Campaign performance reports" : "Campaign list"}
          rows={rows}
          columns={columns}
          compact={true}
          className="campaign-list-table"
          mobile={{ featured: ["status", "audience", "report"] }}
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

      {campaignToDelete && <CampaignDeleteDialog campaign={campaignToDelete} mutation={deleteMutation} onClose={() => setCampaignToDelete(null)} />}
    </>
  );
}
