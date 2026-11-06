import TransactionReference from "@/components/dashboard/TransactionReference";
// src/features/user/pages/UserActivity.jsx
import { useSearchParams } from "react-router";
import { PageHeading, QueryState, DataTable, Pager } from "@/features/admin/components/shared";
import { useUserQuery } from "../hooks/useUser";
import { dateTime, number } from "@/features/admin/lib/format";

/**
 * User Activity page – displays recent activity logs for the user.
 * Uses DataTable with pagination.
 */
export default function UserActivity() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const activity = useUserQuery("activity", { page, limit: 10 });

  const columns = [
    { key: "transactionId", label: "Transaction ID", render: transaction => <TransactionReference transaction={transaction} /> },
    { key: "date", label: "Date", render: (a) => <span className="text-xs">{dateTime(a.createdAt)}</span> },
    { key: "action", label: "Action", render: (a) => a.type || a.action || "Activity" },
    { key: "detail", label: "Detail", render: (a) => a.notes || a.detail || (a.amount ? `${number(a.amount)} credits` : "—") },
  ];

  function updatePage(p) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      next.set("page", String(p));
      return next;
    }, { replace: true });
  }

  const rows = activity.data?.transactions || activity.data?.activities || [];

  return (
    <>
      <PageHeading title="Activity" description="Your recent actions and events." />
      <QueryState query={activity}>
        <DataTable
          caption="Activity log"
          rows={rows}
          columns={columns}
          emptyTitle="No activity found"
        />
        <Pager
          page={page}
          totalPages={activity.data?.pagination?.totalPages || 1}
          total={activity.data?.pagination?.total || rows.length}
          onChange={(p) => updatePage(p)}
          disabled={activity.isFetching}
        />
      </QueryState>
    </>
  );
}
