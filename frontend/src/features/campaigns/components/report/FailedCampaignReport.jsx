import CampaignReference from "@/components/dashboard/CampaignReference";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { number } from "@/features/admin/lib/format";
import { StatusBadge } from "@/features/admin/components/shared";

export function FailureContacts({ rows }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => rows.filter((row) => String(row.phoneNumber).toLowerCase().includes(search.trim().toLowerCase())), [rows, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / 100));
  const current = Math.min(page, pages - 1);
  return <section data-tour="report-failure-contacts" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5"><div><h2 className="flex items-center gap-2 text-sm font-semibold"><Users className="size-4 text-muted-foreground" />All contacts<span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium">{number(rows.length)}</span></h2><p className="mt-1 text-xs text-muted-foreground">The contacts submitted by the campaign creator, including repeat entries.</p></div><div className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search original campaign contacts" placeholder="Search contacts..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} className="pl-9" /></div></header>
    <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-border bg-muted/30 text-muted-foreground"><tr><th className="w-24 px-4 py-3 font-medium sm:px-5">Row</th><th className="px-4 py-3 font-medium sm:px-5">Phone number</th></tr></thead><tbody>{filtered.slice(current * 100, (current + 1) * 100).map((row) => <tr key={row.rowNumber} className="border-b border-border/50 last:border-0"><td className="px-4 py-3 tabular-nums text-muted-foreground sm:px-5">{row.rowNumber}</td><td className="break-all px-4 py-3 font-mono sm:px-5">{row.phoneNumber}</td></tr>)}{!filtered.length && <tr><td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">No matching contacts</td></tr>}</tbody></table></div>
    <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5"><span>{number(filtered.length)} contacts</span><div className="flex items-center gap-2"><Button variant="outline" size="icon-xs" aria-label="Previous contacts" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft /></Button><span>{current + 1} / {pages}</span><Button variant="outline" size="icon-xs" aria-label="Next contacts" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ChevronRight /></Button></div></footer>
  </section>;
}

export default function FailedCampaignReport({ campaign, base, embedded = false }) {
  const sheet = campaign.publishedSpreadsheet;
  return <div className="w-full min-w-0 space-y-5">
    {!embedded && <header className="space-y-3"><Link to={`${base}/campaigns`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Back to campaigns</Link><div className="flex flex-wrap items-center gap-2.5"><h1 className="break-words text-xl font-semibold tracking-tight">{campaign.campaignTitle}</h1><CampaignReference campaign={campaign} /><StatusBadge status="failed" /></div><p className="text-xs text-muted-foreground">Campaign failure report</p></header>}
    <section data-tour="report-failure" className="rounded-xl border border-border bg-card p-4 sm:p-5"><h2 className="text-sm font-semibold">Reason for failure</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{sheet.notes}</p><p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">Total campaign charge: <strong className="font-medium text-foreground">{number(sheet.summary?.creditsCharged || 0)}</strong> credits. Total refunded: <strong className="font-medium text-foreground">{number(sheet.summary?.creditsRefunded || 0)}</strong> credits.</p></section>
    <FailureContacts rows={sheet.rows} />
  </div>;
}
