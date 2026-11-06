import { useSearchParams } from "react-router";
import { RefreshCw, Search, ShieldCheck, ChevronRight, Eye, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PageHeading, QueryState, DataTable, FilterSelect } from "../components/shared";
import { useAdminQuery } from "../hooks/useAdmin";
import { dateTime } from "../lib/format";

const fieldLabels = { username: "Name", email: "Email", ratePerMsg: "Credits per recipient", expiresAt: "Expiry date", isLocked: "Wallet locked", balance: "Credit balance", balanceMinor: "Balance in hundredths", resellerId: "Assigned reseller", createdBy: "Created by", userId: "Account", campaignTitle: "Campaign", publicStatus: "Visible status", campaignSummary: "Campaign summary", publishedSpreadsheet: "Published report", amountMinor: "Amount in hundredths", performedBy: "Performed by", fromUser: "From account", toUser: "To account" };
function label(key) { return fieldLabels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (value) => value.toUpperCase()); }
function valueText(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (value === "[redacted]") return "Hidden for security";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return value.count !== undefined && value.sha256 ? `${value.count} entries (fingerprint recorded)` : JSON.stringify(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:/.test(value)) return dateTime(value);
  return String(value);
}
function actionLabel(event) {
  const creditLabels = { ALLOCATE: "Credits allocated", DEDUCT: "Credits charged", REFUND: "Credits refunded", RECLAIM: "Credits reclaimed", REQUEST: "Credits requested" };
  return creditLabels[event.data?.after?.type] || event.action.split(".").map((part) => label(part)).join(" · ");
}
function Changes({ event }) {
  const before = event.data?.before || {}, after = event.data?.after || {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => !["_id", "updatedAt", "createdAt", "password"].includes(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  if (!fields.length) return <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted/50 p-3 text-xs">{JSON.stringify(event.data || {}, null, 2)}</pre>;
  return <div className="space-y-3">{fields.map((key) => <div key={key} className="rounded-lg border p-3"><p className="mb-2 text-xs font-semibold">{label(key)}</p><dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2"><div><dt className="mb-1 text-muted-foreground">Before</dt><dd className="whitespace-pre-wrap break-all">{valueText(before[key])}</dd></div><div><dt className="mb-1 text-muted-foreground">After</dt><dd className="whitespace-pre-wrap break-all">{valueText(after[key])}</dd></div></dl></div>)}</div>;
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
    <PageHeading title="Audit log" description="See who changed account details, campaign records, and credits." action={<Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={query.isFetching ? "animate-spin" : ""} />Refresh</Button>} />
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/25 px-4 py-3 text-xs text-muted-foreground"><LockKeyhole className="size-4 shrink-0" /><span>This history is read-only. Open a record to see its changes and verify its history.</span></div>
    <div data-tour="audit-filters" className="flex flex-wrap items-center justify-between gap-3">
      <form key={search} className="flex w-full gap-2 sm:max-w-md" onSubmit={(event) => { event.preventDefault(); update({ search: String(new FormData(event.currentTarget).get("search") || "").trim(), before: "", event: "", verify: "" }); }}>
        <Input name="search" aria-label="Search audit history" placeholder="Search a name, email, action, or reference" defaultValue={search} maxLength={120} />
        <Button type="submit" variant="outline" size="icon" aria-label="Search audit history"><Search /></Button>
      </form>
      <FilterSelect label="Audit records" value={scope} onChange={(value) => update({ scope: value, before: "", event: "", verify: "" })} options={[{ value: "changes", label: "Record changes" }, { value: "requests", label: "Request activity" }, { value: "all", label: "All audit records" }]} />
    </div>
    <QueryState query={query} empty={!items.length} emptyTitle="No audit records found" emptyDescription="Try another search. New activity will appear here as the portal is used.">
      <DataTable rows={items} paginated={false} caption="Audit history" columns={[
        { key: "time", label: "When", render: (item) => <span className="whitespace-nowrap text-xs">{dateTime(item.occurredAt)}</span> },
        { key: "actor", label: "Who", render: (item) => <div><p className="text-xs font-medium">{item.actor.name || item.actor.role || "System"}</p><p className="text-[11px] text-muted-foreground">{item.actor.role}{item.actor.impersonation || item.actor.preview ? " · Account access session" : ""}</p></div> },
        { key: "action", label: "Action", render: (item) => <div><p className="text-xs font-medium">{actionLabel(item)}</p><p className="max-w-56 truncate text-[11px] text-muted-foreground" title={item.stream}>{item.stream}</p></div> },
        { key: "ip", label: "IP address", render: (item) => <span className="font-mono text-xs">{item.request?.ip || "System action"}</span> },
        { key: "details", label: "Details", render: (item) => <Button variant="ghost" size="sm" onClick={() => update({ event: item._id, verify: "" })}><Eye className="size-3.5" />View</Button> },
      ]} />
    </QueryState>
    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>Newest records first · up to 50 at a time</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!before || query.isFetching} onClick={() => update({ before: "", event: "", verify: "" })}>Latest</Button><Button size="sm" variant="outline" disabled={!query.data?.nextCursor || query.isFetching} onClick={() => update({ before: query.data.nextCursor, event: "", verify: "" })}>Older<ChevronRight /></Button></div></div>
    {selected && <Dialog open onOpenChange={(open) => { if (!open) update({ event: "", verify: "" }); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{actionLabel(selected)}</DialogTitle><DialogDescription>{selected.actor.name || selected.actor.role} · {dateTime(selected.occurredAt)}</DialogDescription></DialogHeader>
      <dl className="grid grid-cols-1 gap-3 rounded-lg bg-muted/30 p-3 text-xs sm:grid-cols-2"><div><dt className="text-muted-foreground">Record reference</dt><dd className="mt-1 break-all">{selected.stream}</dd></div><div><dt className="text-muted-foreground">IP address</dt><dd className="mt-1">{selected.request?.ip || "System action"}</dd></div>{selected.request?.id && <div className="sm:col-span-2"><dt className="text-muted-foreground">Request reference</dt><dd className="mt-1 break-all">{selected.request.id}</dd></div>}</dl>
      <Changes event={selected} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><p role="status" className={`text-xs ${verification.data?.valid === false ? "text-destructive" : "text-muted-foreground"}`}>{verification.isFetching ? "Checking this record's history…" : verifyStream !== selected.stream ? "" : verification.isError ? "Could not verify. Please try again." : verification.data?.valid ? "History verified: no missing or altered entries detected." : verification.data ? "Verification failed. Investigate this record's history." : ""}</p><Button variant="outline" size="sm" disabled={verification.isFetching} onClick={() => verifyStream === selected.stream ? verification.refetch() : update({ verify: selected.stream })}><ShieldCheck />Verify history</Button></div>
    </DialogContent></Dialog>}
  </>;
}
