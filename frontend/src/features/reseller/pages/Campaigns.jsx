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
        <Link
          to={`/reseller/campaigns/${c._id}`}
          className="max-w-64 truncate text-left font-medium hover:underline text-foreground cursor-pointer block"
        >
          {c.campaignTitle}
        </Link>
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
      label: "Report",
      render: (c) =>
        published(c) ? (
          <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
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
      {campaignToDelete && (
        <AlertDialog open onOpenChange={(open) => { if (!open && !deleteMutation.isPending) setCampaignToDelete(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete campaign "{campaignToDelete.campaignTitle}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this campaign? This action cannot be undone. All recipient lists and report data will be permanently removed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteMutation.error && (
              <p className="text-sm text-destructive">{deleteMutation.error.message}</p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleteMutation.isPending}
                className="border border-destructive bg-white text-destructive hover:bg-red-50 dark:bg-destructive/10 dark:hover:bg-destructive/20"
                onClick={(e) => {
                  e.preventDefault();
                  deleteMutation.mutate(campaignToDelete._id);
                }}
              >
                {deleteMutation.isPending ? "Deleting…" : "Delete Campaign"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
