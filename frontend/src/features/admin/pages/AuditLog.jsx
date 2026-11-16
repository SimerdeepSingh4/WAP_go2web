import { useSearchParams } from "react-router";
import { RefreshCw, Search, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeading, QueryState, DataTable, FilterSelect } from "../../dashboard/components/shared";
import { useAdminQuery } from "../hooks/useAdmin";
import { dateTime } from "../../../lib/format";
import { actionLabel, affectedRecord } from "../lib/auditFormat";
import AuditEventDetail from "../components/AuditEventDetail";

export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "", scope = params.get("scope") || "changes", before = params.get("before") || "";
  const query = useAdminQuery("audit", { search, scope, ...(before ? { before } : {}), limit: 50 });
  const items = query.data?.items || [];
  const selected = items.find((item) => item._id === params.get("event"));
  const verifyStream = params.get("verify") || "";
  const verification = useAdminQuery("auditVerify", { stream: selected?.stream }, Boolean(selected && verifyStream === selected.stream));
  function update(changes) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
      return next;
    });
  }
  return <>
    <PageHeading title="Activity history" description="See who made a change, what they changed, and when it happened." action={<Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />Refresh</Button>} />
    <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">Showing the latest activity first. Choose <span className="font-medium text-foreground">View details</span> to see the previous and new values. This history cannot be edited here.</div>
    <div data-tour="audit-filters" className="flex flex-wrap items-center justify-between gap-3">
      <form key={search} className="flex w-full gap-2 sm:max-w-md" onSubmit={(event) => { event.preventDefault(); update({ search: String(new FormData(event.currentTarget).get("search") || "").trim(), before: "", event: "", verify: "" }); }}>
        <Input name="search" aria-label="Search activity" placeholder="Search by name, email, or reference" defaultValue={search} maxLength={120} />
        <Button type="submit" variant="outline" aria-label="Search activity"><Search className="size-4" /><span className="hidden sm:inline">Search</span></Button>
      </form>
      <div className="flex flex-wrap items-center gap-2"><FilterSelect label="Activity to show" value={scope} onChange={(value) => update({ scope: value, before: "", event: "", verify: "" })} options={[{ value: "changes", label: "Changes made" }, { value: "requests", label: "System activity (advanced)" }, { value: "all", label: "All activity" }]} />
        {(search || scope !== "changes") && <Button variant="ghost" onClick={() => update({ search: "", scope: "", before: "", event: "", verify: "" })}>Clear filters</Button>}
      </div>
    </div>
    <QueryState query={query} empty={!items.length} emptyTitle="No activity found" emptyDescription="Try clearing the filters or searching for a different name.">
      <DataTable rows={items} paginated={false} caption="Activity history" columns={[
        { key: "time", label: "When", render: (item) => <span className="whitespace-nowrap text-xs">{dateTime(item.occurredAt)}</span> },
        { key: "actor", label: "Who did it", render: (item) => <div><p className="text-sm font-medium">{item.actor?.name || item.actor?.role || "System"}</p><p className="text-xs text-muted-foreground">{item.actor?.role === "System" ? "Automatic activity" : item.actor?.role}{item.actor?.impersonation || item.actor?.preview ? " · Using account access" : ""}</p></div> },
        { key: "action", label: "What happened", render: (item) => <span className="text-sm font-medium">{actionLabel(item)}</span> },
        { key: "record", label: "Account or campaign", render: (item) => <span className="block max-w-64 break-words text-sm">{affectedRecord(item)}</span> },
        { key: "details", label: "Details", render: (item) => <Button variant="outline" size="sm" className="whitespace-nowrap!" onClick={() => update({ event: item._id, verify: "" })}><Eye className="size-3.5" />View details</Button> },
      ]} />
    </QueryState>
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground"><span>{items.length} {items.length === 1 ? "activity" : "activities"} shown · Times are in India Standard Time</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!before || query.isFetching} onClick={() => update({ before: "", event: "", verify: "" })}>Back to latest</Button><Button size="sm" variant="outline" disabled={!query.data?.nextCursor || query.isFetching} onClick={() => update({ before: query.data.nextCursor, event: "", verify: "" })}>Show older<ChevronRight /></Button></div></div>
    {selected && <AuditEventDetail key={selected._id} event={selected} verification={verification} historyRequested={verifyStream === selected.stream}
      onCheckHistory={() => verifyStream === selected.stream ? verification.refetch() : update({ verify: selected.stream })}
      onClose={() => update({ event: "", verify: "" })} />}
  </>;
}
