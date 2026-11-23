import { useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { ArrowLeft, ArrowRight, ArrowUpRight, ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, FilterSelect, PageHeading, Pager, QueryState } from "@/features/dashboard/components/shared";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { dateTime, number } from "@/lib/format";
import { accountRestriction } from "../../../../../shared/accountAccess.js";
import { FILTERING_STATUS_LABELS } from "../../../../../shared/numberFiltering.js";
import FilteringRequestForm from "../components/FilteringRequestForm";
import FilteringStatusBadge from "../components/FilteringStatusBadge";
import FilteringReference from "../components/FilteringReference";
import { useFilteringRequests } from "../hooks/useNumberFiltering";
import NumberFilteringDetail from "./NumberFilteringDetail";
import "../number-filtering.css";

const filters = [{ value: "all", label: "All statuses" }, ...Object.entries(FILTERING_STATUS_LABELS).map(([value, label]) => ({ value, label }))];
const ownerRequestLayout = { primary: "filteringId", secondary: "createdAt", featured: ["count", "status"] };
const adminRequestLayout = { ...ownerRequestLayout, featured: ["owner", "status"] };

function RequestList({ base, admin, canRequest }) {
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const list = useFilteringRequests({ page, ...(status === "all" ? {} : { status }) });
  const columns = [
    { key: "filteringId", label: "Filtering ID", render: row => <FilteringReference request={row} to={`${base}/number-filtering/${row.id}`} compact /> },
    ...(admin ? [{ key: "owner", label: "Requested by", render: row => <div className="min-w-0"><p className="font-medium">{row.owner?.username || "Unavailable account"}</p><p className="text-xs text-muted-foreground">{row.owner?.role}</p></div> }] : []),
    { key: "count", label: admin ? "Recipients" : "Numbers", render: row => number(row.submittedRowCount) },
    { key: "createdAt", label: "Submitted", render: row => dateTime(row.createdAt) },
    { key: "status", label: "Status", render: row => row.publishedAt ? (
      <Link className="font-medium text-primary-text underline underline-offset-4"
        to={`${base}/number-filtering/${row.id}#published-results`}
        aria-label={`View report for ${row.filteringId || row.id}`}>View report</Link>
    ) : <FilteringStatusBadge status={row.status} /> },
    {
      key: "actions",
      label: "Action",
      render: row => (
        <Button nativeButton={false} readOnlySafe={!admin} variant="outline" size="sm" render={<Link to={`${base}/number-filtering/${row.id}`} />}>
          {admin ? "Review" : "View request"}
          {admin ? <ArrowUpRight aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
        </Button>
      ),
    },
  ];
  const items = list.data?.items || [];
  const pagination = list.data?.pagination;
  const total = pagination?.total ?? items.length;

  function changeStatus(value) {
    setStatus(value);
    setPage(1);
  }

  const content = (
    <>
      <PageHeading
        inlineMobile={canRequest}
        title="Number Filtering"
        description={admin ? "Review submissions and publish the numbers checked by your team." : "Track your requests and download published results."}
        action={canRequest && <Button nativeButton={false} render={<Link to={`${base}/number-filtering/new`} />}><Plus />New request</Button>}
      />
      <section className="filtering-history" aria-labelledby="filtering-requests-heading">
        <div className="filtering-history-toolbar">
            <div className="filtering-panel-header">
              <ClipboardList className="filtering-panel-icon" aria-hidden="true" />
              <div>
                <h2 id="filtering-requests-heading">{admin ? "Filtering requests" : "Your requests"}</h2>
                {list.isSuccess && <p>{number(total)} {status !== "all" && "matching "}{total === 1 ? "request" : "requests"}</p>}
              </div>
            </div>
          <FilterSelect label="Filter by request status" value={status} options={filters} onChange={changeStatus} />
        </div>
        <QueryState query={list}>
          <DataTable
            columns={columns}
            rows={items}
            paginated={false}
            caption={admin ? "Filtering requests" : "Your filtering requests"}
            mobile={admin ? adminRequestLayout : ownerRequestLayout}
            emptyTitle={status === "all" ? "No filtering requests" : "No requests match this status"}
            emptyDescription={status === "all" ? "Submitted requests will appear here." : "Choose another status to see more requests."}
            emptyAction={status !== "all" && (
              <Button type="button" variant="outline" size="sm" readOnlySafe onClick={() => changeStatus("all")}>Show all requests</Button>
            )}
          />
          {pagination?.pages > 1 || page > 1 ? (
            <Pager page={page} totalPages={pagination?.pages || 1} total={total} onChange={setPage} disabled={list.isFetching} />
          ) : null}
        </QueryState>
      </section>
    </>
  );
  return <div className="number-filtering-workspace">{content}</div>;
}

export default function NumberFilteringPage({ base, create = false }) {
  const { id } = useParams();
  const { user } = useAuth();
  const admin = base === "/admin";
  const canRequest = !admin && ["User", "Reseller"].includes(user?.role) && !user.isPreview && !accountRestriction(user);
  if (create) {
    if (!canRequest) return <Navigate to={`${base}/number-filtering`} replace />;
    return (
      <div className="number-filtering-workspace">
        <PageHeading
          inlineMobile
          title="New filtering request"
          description="Enter your numbers, then review the credit charge before submitting."
          action={<Button nativeButton={false} variant="outline" render={<Link to={`${base}/number-filtering`} />}><ArrowLeft />All requests</Button>}
        />
        <FilteringRequestForm base={base} />
      </div>
    );
  }
  return id ? <NumberFilteringDetail key={id} id={id} base={base} admin={admin} /> : <RequestList base={base} admin={admin} canRequest={canRequest} />;
}
