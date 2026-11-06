import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Loader2, Search, X } from "lucide-react";
import api from "@/api/client";
import { useAuth } from "@/features/auth/hooks/useAuth";

export default function GlobalSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const input = useRef(null);
  const wrapper = useRef(null);
  const popup = useRef(null);
  const listId = useId();
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState({});
  const term = value.trim();
  const accountId = user?.id || user?._id;
  const query = useQuery({
    queryKey: ["global-search", accountId, user?.role, debounced],
    queryFn: async ({ signal }) => (await api.get("/search", { params: { q: debounced }, signal })).data,
    enabled: open && Boolean(accountId) && !user?.isExpired && debounced.length >= 2 && term === debounced,
    staleTime: 15000,
    retry: false,
  });
  const waiting = term !== debounced || query.isFetching;
  const groups = term === debounced ? query.data?.groups || [] : [];
  const items = groups.flatMap((group) => group.items);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(timer);
  }, [term]);
  useEffect(() => { setOpen(false); setValue(""); setActive(-1); }, [location.key, accountId]);
  useEffect(() => {
    function outside(event) {
      if (!wrapper.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    }
    function shortcut(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); input.current?.focus(); setOpen(true);
      }
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", shortcut);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", shortcut); };
  }, []);
  useLayoutEffect(() => {
    if (!open) return;
    function measure() {
      const rect = wrapper.current.getBoundingClientRect();
      const width = Math.min(520, window.innerWidth - 24);
      const top = rect.bottom + 8;
      setPosition({ position: "fixed", top, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), width, maxHeight: Math.max(80, window.innerHeight - top - 12) });
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open]);
  useEffect(() => {
    if (active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId]);

  function close() { setOpen(false); setActive(-1); }
  function keyboard(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); setOpen(true);
      setActive((index) => items.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length : -1);
    } else if (event.key === "Enter" && open && items.length) {
      event.preventDefault(); navigate(items[Math.max(0, active)]?.href || items[0].href); close();
    } else if (event.key === "Escape") { event.preventDefault(); close(); }
  }

  let index = -1;
  return <div ref={wrapper} className="portal-search-wrapper" onBlur={(event) => { if (!wrapper.current?.contains(event.relatedTarget) && !popup.current?.contains(event.relatedTarget)) close(); }}>
    <div className="portal-search-bar">
      <Search className="size-4.5 shrink-0 text-slate-500" aria-hidden="true" />
      <input ref={input} type="text" role="combobox" aria-label="Search records, transaction ID or campaign ID" aria-expanded={open} aria-controls={open ? listId : undefined} aria-autocomplete="list" aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined} maxLength={120} autoComplete="off" placeholder="Search records or IDs..." value={value} onFocus={() => setOpen(true)} onKeyDown={keyboard} onChange={(event) => { setValue(event.target.value); setActive(-1); setOpen(true); }} style={{ outline: "none", border: "none", boxShadow: "none" }} className="portal-search-input" />
      {value ? <button type="button" aria-label="Clear search" onClick={() => { setValue(""); setActive(-1); input.current?.focus(); }} className="shrink-0 p-0.5 text-slate-400 hover:text-slate-600"><X className="size-3.5" /></button> : <kbd className="portal-search-kbd hidden sm:inline-flex"><span>Ctrl</span><span>K</span></kbd>}
    </div>
    {open && createPortal(<div ref={popup} style={position} className="z-[80] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white p-2 shadow-xl" onBlur={(event) => { if (!popup.current?.contains(event.relatedTarget) && !wrapper.current?.contains(event.relatedTarget)) close(); }}>
      {term.length < 2 ? <p className="px-3 py-4 text-sm text-slate-500">{user?.role === "User" ? "Search campaigns and credit transactions." : "Search campaigns, accounts and credit transactions."}<span className="mt-1 block text-xs">Enter at least 2 characters, or paste a full TXN- transaction ID or CMP- campaign ID.</span></p>
        : waiting ? <div role="status" className="flex items-center gap-2 px-3 py-4 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" />Searching...</div>
          : query.isError ? <div role="alert" className="px-3 py-4 text-sm text-slate-600">Could not search records. <button type="button" onClick={() => query.refetch()} className="font-medium text-indigo-700 underline">Try again</button></div>
            : !items.length ? <p role="status" className="px-3 py-4 text-sm text-slate-500">No matching records found.</p> : null}
      <div id={listId} role="listbox" aria-label="Matching records">
        {!waiting && groups.map((group) => <div key={group.label} role="group" aria-label={group.label}>
          <p className="px-3 pb-1 pt-3 text-xs font-semibold text-slate-500">{group.label}</p>
          {group.items.map((item) => {
            const itemIndex = ++index;
            return <Link key={item.id} id={`${listId}-${itemIndex}`} role="option" aria-selected={active === itemIndex} to={item.href} onClick={close} onMouseEnter={() => setActive(itemIndex)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 outline-none hover:bg-slate-50 focus:bg-indigo-50 ${active === itemIndex ? "bg-indigo-50" : ""}`}>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{item.title}</span><span className="block truncate text-xs text-slate-500">{item.subtitle}</span>{item.reference && <span className="mt-1 block break-all font-mono text-xs text-slate-600">{item.reference}</span>}</span><ArrowUpRight className="size-4 shrink-0 text-slate-400" />
            </Link>;
          })}
        </div>)}
      </div>
    </div>, document.body)}
  </div>;
}
