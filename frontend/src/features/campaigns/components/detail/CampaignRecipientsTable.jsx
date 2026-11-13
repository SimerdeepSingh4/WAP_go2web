import RecipientNumberHighlight, { recipientMarkMap } from "./RecipientNumberHighlight";
import TrackedNumberBadges from "./TrackedNumberBadges";
import { useAuth } from "@/features/auth/hooks/useAuth";
import RecipientActivityButton from "./RecipientActivityButton";
import { useState, useMemo, useDeferredValue } from "react";
import { Users, Search, Download, CheckCircle2, AlertCircle, Clock, Copy, Check, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import api from "@/api/client";
import { number } from "@/features/admin/lib/format";
import { campaignContactRows } from "../../../../../../shared/campaignContacts.js";

export function buildCampaignContacts(campaign) {
  return campaign ? campaignContactRows(campaign) : [];
}

export function getStatusBadge(status) {
  const s = (status || "").toLowerCase();
  switch (s) {
    case "pending_report":
      return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"><Clock className="size-3" />Awaiting report</span>;
    case "read":
    case "delivered":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-3" />
          Delivered
        </span>
      );
    case "sent":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 dark:bg-blue-950/40 dark:text-blue-300">
          <Check className="size-3" />
          Sent
        </span>
      );
    case "duplicate":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700 ring-1 ring-inset ring-stone-600/20 dark:bg-stone-800 dark:text-stone-300">
          Duplicate
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertCircle className="size-3" />
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300">
          <Clock className="size-3" />
          Queued
        </span>
      );
  }
}

export default function CampaignRecipientsTable({ campaign, trackedRows, focusedPhone = "", onClearFocus, embedded = false }) {
  const { user } = useAuth();
  const inputAudit = user?.role === "Super Admin" ? campaign.recipientInputAudit : null;
  const numberMarks = useMemo(() => recipientMarkMap(inputAudit), [inputAudit]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(focusedPhone || search);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [isExporting, setIsExporting] = useState(false);
  const [copiedNumber, setCopiedNumber] = useState(null);
  const allRecipients = useMemo(() => buildCampaignContacts(campaign), [campaign]);
  const filtered = useMemo(() => allRecipients.filter((row) => focusedPhone ? row.phoneNumber.replace(/\D/g, "") === focusedPhone : row.phoneNumber.toLowerCase().includes(deferredSearch.trim().toLowerCase())), [allRecipients, deferredSearch, focusedPhone]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages - 1);
  const start = current * pageSize;
  const rows = filtered.slice(start, start + pageSize);
  const copyNumber = async (phoneNumber) => {
    try {
      await navigator.clipboard.writeText(phoneNumber);
      setCopiedNumber(phoneNumber);
      setTimeout(() => setCopiedNumber(null), 1500);
      toast.add({ title: "Phone number copied", type: "success" });
    } catch { toast.add({ title: "Could not copy phone number", type: "error" }); }
  };
  const download = async () => {
    setIsExporting(true);
    try {
      const response = await api.get(`/campaigns/${campaign._id}/export-recipients`, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = String(campaign.campaignTitle || "campaign").replace(/[^a-z0-9_-]+/gi, "-") + "-recipients.xlsx";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { toast.add({ title: "Could not download contacts. Please try again.", type: "error" }); }
    finally { setIsExporting(false); }
  };
  return (
    <section data-tour="campaign-recipients" aria-label="Campaign contacts" className={embedded ? "min-w-0 overflow-hidden" : "min-w-0 overflow-hidden rounded-xl border border-border bg-card"}>
      <header className={`flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border ${embedded ? "py-3" : "px-4 py-4 sm:px-5"}`}>
        <div className="flex min-w-0 items-center gap-3">
          {!embedded && <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"><Users className="size-4" /></span>}
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{embedded ? "Recipients" : "Campaign contacts"}</h2><span className={embedded ? "text-xs font-normal text-muted-foreground tabular-nums" : "rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums"}>{number(allRecipients.length)}</span></div>{!embedded && <p className="mt-1 text-[11px] text-muted-foreground">Submitted contacts and published delivery status.</p>}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2"><RecipientActivityButton activity={inputAudit} /><Button type="button" variant={embedded ? "ghost" : "outline"} size="sm" disabled={isExporting || !allRecipients.length} onClick={download} className="gap-1.5 text-xs">{isExporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}Download Excel</Button></div>
      </header>
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 ${embedded ? "" : "bg-muted/15 px-4 sm:px-5"}`}>
        <div className="relative w-full sm:max-w-xs"><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input type="search" aria-label="Search campaign contacts" placeholder="Search phone number..." value={focusedPhone || search} onChange={(event) => { onClearFocus?.(); setSearch(event.target.value); setPage(0); }} className="h-9 bg-background pl-9 text-xs" /></div>
        {focusedPhone && <Button size="sm" variant="ghost" onClick={() => { onClearFocus?.(); setSearch(""); setPage(0); }}>Show all recipients</Button>}
        <label className="flex items-center gap-2 text-xs text-muted-foreground">Rows per page<select aria-label="Contacts per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} className="h-8 rounded-lg border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30">{[10, 25, 50, 100].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <p className="recipient-scroll-hint">Swipe sideways to see all contact details and copy actions.</p><Table className="recipient-comparison min-w-[370px] table-fixed [&_th]:px-3! [&_td]:px-3! [&_td]:py-2.5! [&_th]:py-3!">
        <TableHeader className="bg-muted/40"><TableRow className="hover:bg-transparent"><TableHead className="recipient-index w-12 text-center text-[11px]">#</TableHead><TableHead className="recipient-phone text-[11px]">Phone number</TableHead><TableHead className="w-28 text-[11px] sm:w-36">Status</TableHead><TableHead className="w-12 text-center"><span className="sr-only">Copy</span></TableHead></TableRow></TableHeader>
        <TableBody>{rows.length ? rows.map((row) => {
          const tracked = user?.role === "Super Admin" ? trackedRows?.get(row.phoneNumber.replace(/\D/g, "")) : undefined;
          return <TableRow key={row.rowNumber} className="hover:bg-muted/25"><TableCell className="recipient-index text-center text-[11px] text-muted-foreground tabular-nums">{row.rowNumber}</TableCell><TableCell data-input-risk={numberMarks.get(row.rowNumber)} className={`recipient-phone break-all font-mono text-xs font-medium ${tracked ? "border-l-2 border-l-amber-500/60" : ""}`}>{row.phoneNumber}{numberMarks.has(row.rowNumber) && <div className="mt-1"><RecipientNumberHighlight mark={numberMarks.get(row.rowNumber)} /></div>}<TrackedNumberBadges row={tracked} /></TableCell><TableCell>{getStatusBadge(row.status)}</TableCell><TableCell className="text-center"><Button type="button" size="icon-xs" variant="ghost" aria-label={`Copy phone number ${row.phoneNumber}`} onClick={() => copyNumber(row.phoneNumber)} className="text-muted-foreground hover:text-foreground">{copiedNumber === row.phoneNumber ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}</Button></TableCell></TableRow>;
        }) : <TableRow><TableCell colSpan={4} className="py-10! text-center text-xs text-muted-foreground">{search || focusedPhone ? "No contacts match your search." : "No contacts available."}</TableCell></TableRow>}</TableBody>
      </Table>
      <footer className={`flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 ${embedded ? "" : "bg-muted/15 px-4 sm:px-5"}`}>
        <p aria-live="polite" className="text-[11px] text-muted-foreground">{filtered.length ? number(start + 1) : 0}&ndash;{number(Math.min(start + pageSize, filtered.length))} of {number(filtered.length)} contacts{search && filtered.length !== allRecipients.length ? ` (${number(allRecipients.length)} total)` : ""}</p>
        <nav aria-label="Contact pagination" className="flex items-center gap-1"><Button type="button" size="icon-xs" variant="outline" aria-label="First contact page" disabled={current === 0} onClick={() => setPage(0)}><ChevronsLeft /></Button><Button type="button" size="icon-xs" variant="outline" aria-label="Previous contact page" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft /></Button><span className="px-2 text-[11px] text-muted-foreground tabular-nums">Page {current + 1} of {pages}</span><Button type="button" size="icon-xs" variant="outline" aria-label="Next contact page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ChevronRight /></Button><Button type="button" size="icon-xs" variant="outline" aria-label="Last contact page" disabled={current >= pages - 1} onClick={() => setPage(pages - 1)}><ChevronsRight /></Button></nav>
      </footer>
    </section>
  );
}
