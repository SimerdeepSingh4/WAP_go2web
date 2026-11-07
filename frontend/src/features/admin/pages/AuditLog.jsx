import { useSearchParams } from "react-router";
import { RefreshCw, Search, ShieldCheck, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeading, QueryState, DataTable, FilterSelect } from "../components/shared";
import { useAdminQuery } from "../hooks/useAdmin";
import { dateTime } from "../lib/format";
import { actionLabel, affectedRecord, basicActivityDetails, changedFields, fieldLabel, valueText } from "../lib/auditFormat";

function Changes({ event }) {
  const fields = changedFields(event);
  const created = event.action?.endsWith(".created"), deleted = event.action?.endsWith(".deleted");
  if (!fields.length) return <p className="rounded-lg bg-muted/30 p-4 text-sm text-muted-foreground">{event.action === "request.started" ? "Someone started an activity. This entry alone does not confirm whether it finished." : event.action === "request.finished" ? event.data?.outcome === "success" ? "The activity finished successfully." : "A response was recorded. See technical details for the result." : "No field-by-field changes were recorded for this activity."}</p>;
  return <section className="space-y-3" aria-label="Changes made">
    <h3 className="text-sm font-semibold">{created ? "Details added" : deleted ? "Details removed" : "What changed"}</h3>
    {fields.map((key) => <div key={key} className="rounded-xl border p-4">
      <p className="mb-3 text-sm font-medium">{fieldLabel(key)}</p>
      <dl className={`grid gap-4 text-sm ${!created && !deleted ? "sm:grid-cols-2" : ""}`}>
        {!created && <div><dt className="mb-1 text-xs text-muted-foreground">{deleted ? "Removed value" : "Previous value"}</dt><dd className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{valueText(event.data?.before?.[key], key)}</dd></div>}
        {!deleted && <div><dt className="mb-1 text-xs text-muted-foreground">{created ? "Value" : "New value"}</dt><dd className="max-h-48 overflow-auto whitespace-pre-wrap break-words font-medium">{valueText(event.data?.after?.[key], key)}</dd></div>}
      </dl>
    </div>)}
  </section>;
}

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
    {selected && <Dialog open onOpenChange={(open) => { if (!open) update({ event: "", verify: "" }); }}><DialogContent key={selected._id} className="max-h-[80dvh] gap-4 overflow-y-auto p-5 sm:max-w-md"><DialogHeader className="gap-2 pr-6"><DialogTitle className="text-base">{actionLabel(selected)}</DialogTitle><DialogDescription>By <span className="font-medium text-foreground">{selected.actor?.name || selected.actor?.role || "System"}</span></DialogDescription></DialogHeader>
      <dl className="space-y-3 rounded-xl bg-muted/25 p-3 text-sm">
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1"><dt className="text-xs text-muted-foreground">When</dt><dd className="text-xs">{dateTime(selected.occurredAt)} (IST)</dd></div>
        {basicActivityDetails(selected).map(([name, value]) => <div key={name} className={name === "Credits" ? "flex items-center justify-between gap-4" : "space-y-1"}><dt className="text-xs text-muted-foreground">{name}</dt><dd className={`break-words ${name === "Description" ? "line-clamp-3 text-xs leading-relaxed text-muted-foreground" : "font-medium"}`}>{value}</dd></div>)}
      </dl>
      <details className="group/audit-details border-t pt-3"><summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">Show more details</summary>
      <div className="mt-4 space-y-4">
      <dl className="grid gap-4 rounded-xl bg-muted/30 p-4 text-sm sm:grid-cols-2">
        <div><dt className="mb-1 text-xs text-muted-foreground">Who did it</dt><dd className="font-medium">{selected.actor?.name || selected.actor?.role || "System"}</dd>{selected.actor?.role && <dd className="text-xs text-muted-foreground">{selected.actor.role}</dd>}{(selected.actor?.impersonation || selected.actor?.preview) && <dd className="mt-1 text-xs text-muted-foreground">Using account access</dd>}</div>
        <div><dt className="mb-1 text-xs text-muted-foreground">When</dt><dd>{dateTime(selected.occurredAt)} (IST)</dd></div>
        <div className="sm:col-span-2"><dt className="mb-1 text-xs text-muted-foreground">Account or campaign</dt><dd className="break-words">{affectedRecord(selected)}</dd></div>
      </dl>
      <Changes event={selected} />
      <details className="rounded-xl border p-4"><summary className="cursor-pointer text-sm font-medium">Technical details and history check</summary>
        <p className="mt-3 text-xs text-muted-foreground">These details help an administrator investigate an issue.</p>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">{[["Record reference", selected.stream], ["Network address (IP)", selected.request?.ip || "Not recorded"], ["Request reference", selected.request?.id || "Not recorded"], ["Browser or device information", selected.request?.userAgent || "Not recorded"], ["Original administrator", selected.actor?.originalAdmin || "Not applicable"]].map(([name, value]) => <div key={name}><dt className="text-muted-foreground">{name}</dt><dd className="mt-1 break-all">{valueText(value)}</dd></div>)}</dl>
        <details className="mt-4"><summary className="cursor-pointer text-xs text-muted-foreground">Original recorded data</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/30 p-3 text-xs">{JSON.stringify(selected.data || {}, null, 2)}</pre></details>
        <div className="mt-4 space-y-3 border-t pt-4"><p className="text-xs text-muted-foreground">Check whether this record's saved history has missing or altered entries.</p><Button variant="outline" size="sm" disabled={verification.isFetching} onClick={() => verifyStream === selected.stream ? verification.refetch() : update({ verify: selected.stream })}><ShieldCheck />{verification.isFetching ? "Checking history..." : "Check history"}</Button><p role="status" className={`text-xs ${verification.data?.valid === false ? "text-destructive" : "text-muted-foreground"}`}>{verifyStream !== selected.stream ? "" : verification.isFetching ? "Checking saved entries..." : verification.isError ? "The check could not finish. Please try again." : verification.data?.valid ? "Check passed. No missing or changed entries were found." : verification.data ? "This history needs an administrator's review. Some entries may be missing or changed." : ""}</p></div>
      </details>
      </div>
      </details>
    </DialogContent></Dialog>}
  </>;
}
