import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight, Loader2, Plus, X } from "lucide-react";
import api from "@/api/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import TrackedNumberBadges from "./TrackedNumberBadges";
import TrackedNumberNote from "./TrackedNumberNote";

const PAGE_SIZE = 25;

export default function TrackedNumbersPanel({ campaignId, query, onLocate }) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState(new Set());
  const [entryMode, setEntryMode] = useState(null);
  const [input, setInput] = useState("");
  const data = query.data;
  const filtered = useMemo(() => (data?.rows || []).filter((row) => `${row.phoneNumber} ${row.note}`.toLowerCase().includes(search.trim().toLowerCase())), [data, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const rows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const selectedNumbers = (data?.rows || []).filter((row) => selected.has(row.phoneNumber)).map((row) => row.phoneNumber);
  const allSelected = filtered.length > 0 && filtered.every((row) => selected.has(row.phoneNumber));
  const add = useMutation({
    mutationFn: ({ phoneNumbers }) => api.post(`/campaigns/${campaignId}/tracked-numbers`, { phoneNumbers }),
    onSuccess: async (_, variables) => {
      await client.invalidateQueries({ queryKey: ["tracked-numbers"] });
      setSearch(entryMode === "single" ? variables.phoneNumbers.replace(/\D/g, "") : "");
      setPage(0); setEntryMode(null); setInput("");
      toast.add({ title: "Tracked list updated", type: "success" });
    },
  });
  const saveContacts = useMutation({
    mutationFn: (phoneNumbers) => api.post(`/campaigns/${campaignId}/tracked-numbers/contacts`, { phoneNumbers }),
    onSuccess: async (response) => {
      const result = response.data.data;
      setSelected(new Set());
      toast.add({ title: `${result.addedCount} numbers saved to ${result.folder.name}`, description: result.skippedCount ? `${result.skippedCount} already saved.` : undefined, type: "success" });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["contact-folders"] }),
        client.invalidateQueries({ queryKey: ["admin"] }),
      ]);
    },
  });

  const startEntry = (mode) => { add.reset(); setInput(""); setEntryMode(mode); };
  const cancelEntry = () => { if (!add.isPending) { setEntryMode(null); setInput(""); add.reset(); } };
  const toggle = (number) => setSelected((previous) => { const next = new Set(previous); if (next.has(number)) next.delete(number); else next.add(number); return next; });

  return <aside aria-label="Repeated and tracked numbers" className="min-w-0 self-start border-t border-border pt-4 @min-[900px]:border-t-0 @min-[900px]:border-l @min-[900px]:pt-0 @min-[900px]:pl-5">
    <header className="flex min-h-16 items-center justify-between gap-2 py-3">
      <div>
        <h2 className="text-sm font-semibold">Repeated numbers <span className="ml-1 font-normal tabular-nums text-muted-foreground">{data?.rows.length ?? ""}</span></h2>
        {data && <p className="mt-1 text-[11px] text-muted-foreground">{data.totalUserCampaigns} submitted {data.totalUserCampaigns === 1 ? "campaign" : "campaigns"} by this user</p>}
      </div>
      <Link to="/admin/contacts" className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground hover:underline">Contacts</Link>
    </header>

    <div className="flex items-center gap-1 border-b border-border pb-2">
      <Button type="button" size="xs" variant="ghost" disabled={add.isPending} onClick={() => startEntry("single")}><Plus className="size-3" />Add number</Button>
      <Button type="button" size="xs" variant="ghost" disabled={add.isPending} onClick={() => startEntry("bulk")}>Paste multiple</Button>
    </div>

    {entryMode && <form aria-label="Add tracked numbers" className="border-b border-border py-2" onSubmit={(event) => { event.preventDefault(); if (!add.isPending) add.mutate({ phoneNumbers: input }); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelEntry(); } }}>
      {entryMode === "single" ? <div className="flex items-center gap-1">
        <input autoFocus aria-label="Number to track" type="tel" inputMode="tel" required disabled={add.isPending} value={input} onChange={(event) => setInput(event.target.value)}
          onPaste={(event) => { const text = event.clipboardData.getData("text"); if (/[\n,;\t]/.test(text.trim())) { event.preventDefault(); setEntryMode("bulk"); setInput(text); } }}
          placeholder="Phone number with country code" className="h-8 min-w-0 flex-1 border-0 border-b border-input bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-foreground" />
        <Button type="submit" size="icon-xs" variant="ghost" aria-label="Add tracked number" disabled={add.isPending || !input.trim()}>{add.isPending ? <Loader2 className="animate-spin" /> : <Check />}</Button>
        <Button type="button" size="icon-xs" variant="ghost" aria-label="Cancel adding number" disabled={add.isPending} onClick={cancelEntry}><X /></Button>
      </div> : <>
        <textarea autoFocus aria-label="Numbers to track" required rows={3} disabled={add.isPending} value={input} onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (input.trim() && !add.isPending) add.mutate({ phoneNumbers: input }); } }}
          placeholder="Paste numbers with country codes, one per line" className="max-h-36 w-full resize-y border-0 border-b border-input bg-transparent py-2 font-mono text-xs outline-none placeholder:text-muted-foreground focus:border-foreground" />
        <div className="mt-1 flex items-center gap-1"><Button type="submit" size="xs" disabled={add.isPending || !input.trim()}>{add.isPending && <Loader2 className="animate-spin" />}Add numbers</Button><Button type="button" size="xs" variant="ghost" disabled={add.isPending} onClick={cancelEntry}>Cancel</Button></div>
      </>}
      {add.isError && <p role="alert" className="mt-1 text-xs text-destructive">{add.error.message}</p>}
    </form>}

    {query.isPending ? <p role="status" className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Checking history...</p> : query.isError ? <div role="alert" className="space-y-2 py-4 text-xs"><p>{query.error.message}</p><Button variant="ghost" size="xs" onClick={() => query.refetch()}>Retry</Button></div> : <>
      {data.baseline && <p className="py-2 text-[11px] text-muted-foreground">First campaign. Repeats appear from Campaign 2.</p>}
      {!data.submitted && <p className="py-2 text-[11px] text-muted-foreground">Drafts are excluded from campaign history.</p>}

      {selectedNumbers.length > 0 && <div aria-label="Selected number actions" className="border-b border-border py-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium tabular-nums">{selectedNumbers.length} selected</span>
          <Button size="xs" variant="ghost" disabled={saveContacts.isPending} onClick={() => saveContacts.mutate(selectedNumbers)}>{saveContacts.isPending ? "Saving..." : "Save to Contacts"}</Button>
          <Button size="xs" variant="ghost" disabled={saveContacts.isPending} onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Folder: {data.username}</p>
        {saveContacts.isError && <p role="alert" className="mt-1 text-xs text-destructive">{saveContacts.error.message}</p>}
      </div>}

      <div className="flex items-center gap-2 border-b border-border py-2">
        <input type="search" aria-label="Search tracked numbers" placeholder="Search numbers or notes" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }}
          className="h-7 min-w-0 flex-1 border-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground focus-visible:underline" />
      </div>
      <div className="flex items-center justify-between border-b border-border py-2 text-[11px] text-muted-foreground">
        <label className="flex items-center gap-2"><input type="checkbox" checked={allSelected} disabled={!filtered.length} onChange={() => setSelected((previous) => { const next = new Set(previous); filtered.forEach((row) => allSelected ? next.delete(row.phoneNumber) : next.add(row.phoneNumber)); return next; })} />Select all {filtered.length}</label>
        <span>{data.rows.filter((row) => row.repeated).length} repeated</span>
      </div>

      <ul className="max-h-[620px] divide-y divide-border overflow-y-auto">{rows.map((row) => <li key={row.phoneNumber} className="flex items-start gap-2 py-2.5">
        <input type="checkbox" aria-label={`Select ${row.phoneNumber}`} checked={selected.has(row.phoneNumber)} onChange={() => toggle(row.phoneNumber)} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            {row.inCampaign ? <button type="button" title="Find in recipients" onClick={() => onLocate(row.phoneNumber)} className="break-all text-left font-mono text-xs font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">{row.phoneNumber}</button> : <span className="break-all font-mono text-xs">{row.phoneNumber}</span>}
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" title={`Appeared in ${row.campaignCount} of ${row.totalCampaigns} campaigns as of this submission`} aria-label={`Appeared in ${row.campaignCount} of ${row.totalCampaigns} campaigns as of this submission`}>{row.campaignCount}/{row.totalCampaigns}</span>
          </div>
          <TrackedNumberBadges row={row} showRepeated={false} />
          <TrackedNumberNote campaignId={campaignId} row={row} />
        </div>
      </li>)}</ul>
      {!rows.length && <p className="py-6 text-xs text-muted-foreground">{search ? "No matching numbers." : "No repeated or manually added numbers yet."}</p>}
      <footer className="flex items-center justify-between border-t border-border py-2 text-[11px] text-muted-foreground">
        <span>{filtered.length} numbers</span>
        <nav aria-label="Tracked number pagination" className="flex items-center gap-1"><Button size="icon-xs" variant="ghost" aria-label="Previous tracked numbers" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft /></Button><span className="tabular-nums">{currentPage + 1}/{pages}</span><Button size="icon-xs" variant="ghost" aria-label="Next tracked numbers" disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight /></Button></nav>
      </footer>
    </>}
  </aside>;
}
