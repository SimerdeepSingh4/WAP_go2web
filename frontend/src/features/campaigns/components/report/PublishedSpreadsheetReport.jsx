import CampaignReference from "@/components/dashboard/CampaignReference";
import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, Check, CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, FileSpreadsheet, Filter, Loader2, RotateCcw, Search, ShieldCheck, Users, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/features/admin/components/shared";
import { dateTime, number } from "@/features/admin/lib/format";
import { toast } from "@/components/ui/toast";
import api from "@/api/client";

const text = (value) => typeof value === "boolean" ? value ? "Yes" : "No" : String(value ?? "");
const columnLabels = { status: "Message status", category: "Reason", billingAction: "Credits" };

function ReportCell({ column, value, row }) {
  if (column.field === "status") {
    const status = String(value || "queued").toLowerCase();
    return <span className="whitespace-nowrap capitalize text-foreground">{status === "failed" ? "Not sent" : status.replace(/_/g, " ")}</span>;
  }
  if (column.field === "billingAction") return <span className="whitespace-nowrap text-foreground">{value === "refund" ? "Refunded" : "Charged"}</span>;
  if (column.field === "category") {
    const reason = ["delivered", "read"].includes(row.status) ? "\u2014" : text(value) || "\u2014";
    return <span className="block max-w-64 whitespace-pre-wrap break-words text-muted-foreground">{reason}</span>;
  }
  if (typeof value === "boolean") return <span className={`inline-flex items-center gap-1 text-xs ${value ? "text-foreground" : "text-muted-foreground"}`}>{value && <Check className="size-3" />}{text(value)}</span>;
  return <span className={`block max-w-72 whitespace-pre-wrap break-words ${column.field === "phoneNumber" ? "font-mono font-medium tracking-wide text-foreground" : value === "" || value == null ? "text-muted-foreground/50" : "text-muted-foreground"}`}>{text(value) || "—"}</span>;
}

export default function PublishedSpreadsheetReport({ campaign, base, isAdmin, embedded = false }) {
  const sheet = campaign.publishedSpreadsheet;
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [category, setCategory] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(100);
  const [downloading, setDownloading] = useState(false);
  const overview = useMemo(() => {
    const categories = new Map(), statuses = new Map();
    let delivered = 0, failed = 0;
    for (const row of sheet.rows) {
      categories.set(row.category || "Uncategorized", (categories.get(row.category || "Uncategorized") || 0) + 1);
      const status = String(row.status || "queued").toLowerCase();
      statuses.set(status, (statuses.get(status) || 0) + 1);
      if (["delivered", "read"].includes(status)) delivered++;
      else if (status === "failed") failed++;
    }
    const total = sheet.rows.length;
    return { categories: [...categories], statuses: [...statuses], delivered, failed, remaining: total - delivered - failed, total, rate: total ? Math.round(delivered / total * 100) : 0 };
  }, [sheet.rows]);
  const rows = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const filtered = sheet.rows.filter((row) => (!category || (row.category || "Uncategorized") === category) && (!deliveryStatus || String(row.status || "queued").toLowerCase() === deliveryStatus) && (!query || String(row.rowNumber) === query.replace(/^#/, "") || Object.values(row.values).some((value) => text(value).toLowerCase().includes(query))));
    if (sort) filtered.sort((a, b) => text(a.values[sort.id]).localeCompare(text(b.values[sort.id]), undefined, { numeric: true }) * sort.direction);
    return filtered;
  }, [sheet.rows, deferredSearch, category, deliveryStatus, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const summary = sheet.summary || {};
  const creditsCharged = summary.creditsCharged || 0;
  const creditsRefunded = summary.creditsRefunded || 0;
  const filtered = Boolean(search || category || deliveryStatus);
  const clearFilters = () => { setSearch(""); setCategory(""); setDeliveryStatus(""); setPage(0); };
  const selectClass = "h-9 max-w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
  const download = async () => {
    setDownloading(true);
    try {
      const response = await api.get(`/campaigns/${campaign._id}/recipient-report`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url; anchor.download = "campaign-report.xlsx"; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.add({ title: "Could not download the report. Please try again.", type: "error" }); }
    finally { setDownloading(false); }
  };

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-5 pb-6">
      {!embedded && <header className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to={`${base}/campaigns`} className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="size-3.5" /> Campaigns</Link>
          <span aria-hidden="true" className="text-muted-foreground/40">/</span>
          <span className="text-foreground">Report</span>
        </nav>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2"><h1 className="min-w-0 break-words text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">{campaign.campaignTitle}</h1><CampaignReference campaign={campaign} /><StatusBadge status={campaign.status} /></div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>Published {dateTime(sheet.publishedAt)}</span><span className="hidden h-3 border-l border-border sm:block" aria-hidden="true" /><span>{number(overview.total)} recipients</span></div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isAdmin && <Button variant="outline" size="sm" nativeButton={false} render={<Link to={`${base}/campaigns/${campaign._id}`} />}>Edit campaign</Button>}
            <Button type="button" size="sm" disabled={downloading} onClick={download} className="h-8 gap-1.5">{downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}{downloading ? "Downloading..." : "Download Excel"}</Button>
          </div>
        </div>
      </header>}

      <section aria-label="Report summary" className="overflow-hidden rounded-xl border border-border bg-card">
        <dl className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
          {[
            { label: "Recipients", value: overview.total, hint: "Numbers in this report", icon: Users },
            { label: "Delivered", value: overview.delivered, hint: overview.rate + "% delivery rate", icon: CheckCircle2 },
            { label: "Credits charged", value: creditsCharged, hint: "Charged at submission", icon: Wallet },
            { label: "Credits refunded", value: creditsRefunded, hint: number(Math.max(0, creditsCharged - creditsRefunded)) + " net credits used", icon: RotateCcw },
          ].map(({ label, value, hint, icon: Icon }) => <div key={label} className="min-w-0 bg-card p-4 sm:px-5"><dt className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-3.5 shrink-0" />{label}</dt><dd className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">{number(value)}<p className="mt-1 text-[11px] font-normal leading-5 tracking-normal text-muted-foreground">{hint}</p></dd></div>)}
        </dl>
        <div className="space-y-2.5 border-t border-border px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground"><span className="font-medium text-foreground">Delivery results</span><div className="flex flex-wrap gap-x-4 gap-y-1">{[["Delivered", overview.delivered, "bg-emerald-500"], ["Not sent", overview.failed, "bg-rose-400"], ["Other", overview.remaining, "bg-slate-300 dark:bg-slate-600"]].map(([label, value, color]) => <span key={label} className="inline-flex items-center gap-1.5"><span className={"size-1.5 rounded-full " + color} />{label}<strong className="font-medium text-foreground tabular-nums">{number(value)}</strong></span>)}</div></div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={overview.delivered + " delivered, " + overview.failed + " not sent, " + overview.remaining + " other recipients"}>{[[overview.delivered, "bg-emerald-500"], [overview.failed, "bg-rose-400"], [overview.remaining, "bg-slate-300 dark:bg-slate-600"]].map(([value, color], index) => <span key={index} className={color} style={{ width: (overview.total ? value / overview.total * 100 : 0) + "%" }} />)}</div>
        </div>
      </section>

      {sheet.notes && <section className="rounded-xl border border-border bg-card px-4 py-3 sm:px-5"><h2 className="text-xs font-medium text-foreground">Report note</h2><p className="mt-1.5 whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{sheet.notes}</p></section>}

      <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="recipient-report-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5"><div className="space-y-1"><h2 id="recipient-report-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground"><FileSpreadsheet className="size-3.5 text-muted-foreground" /> Recipient details<span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{number(overview.total)}</span></h2><p className="text-[11px] text-muted-foreground">Message results and credits for each recipient.</p></div><span className="inline-flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1 text-[10px] font-medium text-muted-foreground"><ShieldCheck className="size-3" /> Read only</span></div>
        <div className="flex flex-col gap-2.5 border-y border-border bg-muted/20 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-5">
          <div className="relative min-w-0 flex-1 sm:min-w-52"><Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input type="search" aria-label="Search report" placeholder="Search phone, row or notes..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} className="h-9 w-full bg-background pl-9 text-xs focus-visible:ring-2 focus-visible:ring-ring/20" /></div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center"><label className="flex min-w-0 items-center gap-1.5"><Filter aria-hidden="true" className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" /><select aria-label="Filter report reason" value={category} onChange={(event) => { setCategory(event.target.value); setPage(0); }} className={`${selectClass} w-full sm:w-44`}><option value="">All reasons</option>{overview.categories.map(([name, count]) => <option key={name} value={name}>{name} ({number(count)})</option>)}</select></label><select aria-label="Filter delivery status" value={deliveryStatus} onChange={(event) => { setDeliveryStatus(event.target.value); setPage(0); }} className={`${selectClass} sm:w-40`}><option value="">Message status</option>{overview.statuses.map(([status, count]) => <option key={status} value={status}>{status === "failed" ? "Not sent" : status.charAt(0).toUpperCase() + status.slice(1)} ({number(count)})</option>)}</select></div>
          {filtered && <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="h-9 self-start gap-1 text-xs"><X className="size-3" /> Clear</Button>}
        </div>
        <p className="recipient-scroll-hint">Swipe sideways for more columns. Phone numbers stay in view.</p><div role="region" aria-label="Scrollable recipient report" tabIndex={0} className="recipient-table-scroll max-h-[min(60vh,560px)] overscroll-contain" aria-busy={search !== deferredSearch}>
          <table className="recipient-comparison w-full border-separate border-spacing-0 text-left text-xs"><caption className="sr-only">Published recipient report. All index values stay the same when searching, filtering, and sorting.</caption>
            <thead className="sticky top-0 z-20"><tr><th scope="col" className="recipient-index sticky left-0 z-30 min-w-20 border-r border-b border-border bg-muted px-4 py-2.5 font-medium text-muted-foreground" title="Permanent row number from All">Row</th>{sheet.columns.map((column) => <th key={column.id} scope="col" aria-sort={sort?.id === column.id ? sort.direction === 1 ? "ascending" : "descending" : "none"} className={`${column.field === "phoneNumber" ? "recipient-phone " : ""}border-b border-border bg-muted px-4 py-3 font-medium`} style={{ minWidth: Math.min(column.width || 150, 260) }}><button type="button" className={`flex w-full items-center justify-between gap-3 whitespace-nowrap text-left ${sort?.id === column.id ? "text-primary" : "text-muted-foreground hover:text-foreground"}`} onClick={() => { setSort({ id: column.id, direction: sort?.id === column.id ? -sort.direction : 1 }); setPage(0); }}>{columnLabels[column.field] || column.label}{sort?.id === column.id ? sort.direction === 1 ? <ArrowUp className="size-3 shrink-0" /> : <ArrowDown className="size-3 shrink-0" /> : <ArrowUpDown className="size-3 shrink-0 opacity-50" />}</button></th>)}</tr></thead>
            <tbody>{rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((row, index) => <tr key={row.rowNumber} className="group"><th scope="row" className={`recipient-index sticky left-0 z-10 border-r border-b border-border/60 px-4 py-3 font-mono text-[11px] font-normal text-muted-foreground bg-card group-hover:bg-muted`}>{row.rowNumber}</th>{sheet.columns.map((column) => <td key={column.id} className={`${column.field === "phoneNumber" ? "recipient-phone " : ""}border-b border-border/60 px-4 py-3 align-middle group-hover:bg-primary/[0.025] ${index % 2 ? "bg-muted/10" : "bg-card"}`}><ReportCell column={column} value={row.values[column.id]} row={row} /></td>)}</tr>)}
              {!rows.length && <tr><td colSpan={sheet.columns.length + 1} className="px-5 py-14 text-center"><div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><Search className="size-4" /></div><p className="text-sm font-medium text-foreground">{filtered ? "No matching recipients" : "No recipient rows published"}</p><p className="mt-1 text-xs text-muted-foreground">{filtered ? "Try a different phone number, reason or message status." : "Published recipient details will appear here."}</p>{filtered && <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">Clear filters</Button>}</td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-col gap-3 bg-muted/20 px-4 py-3 text-[11px] text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
          <p aria-live="polite">Showing <span className="font-medium text-foreground">{rows.length ? number(currentPage * pageSize + 1) : 0}–{number(Math.min((currentPage + 1) * pageSize, rows.length))}</span> of <span className="font-medium text-foreground">{number(rows.length)}</span> recipients{filtered ? ` · ${number(overview.total)} total` : ""}</p>
          <div className="flex flex-wrap items-center gap-1.5"><select aria-label="Recipients per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} className="mr-1 h-7 rounded-md border border-input bg-background px-1.5 text-[11px]">{[50, 100, 250].map((size) => <option key={size} value={size}>{size} / page</option>)}</select><Button variant="ghost" size="icon-xs" aria-label="First report page" disabled={!currentPage} onClick={() => setPage(0)}><ChevronsLeft className="size-3.5" /></Button><Button variant="ghost" size="icon-xs" aria-label="Previous report page" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="size-3.5" /></Button><label className="mx-1 inline-flex items-center gap-1.5">Page<input type="number" aria-label="Go to report page" min={1} max={pages} value={currentPage + 1} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= pages) setPage(value - 1); }} className="h-7 w-12 rounded-md border border-input bg-background px-1 text-center text-xs text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" /><span>of {number(pages)}</span></label><Button variant="ghost" size="icon-xs" aria-label="Next report page" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}><ChevronRight className="size-3.5" /></Button><Button variant="ghost" size="icon-xs" aria-label="Last report page" disabled={currentPage + 1 >= pages} onClick={() => setPage(pages - 1)}><ChevronsRight className="size-3.5" /></Button></div>
        </footer>
      </section>
    </div>
  );
}
