import { Fragment, useDeferredValue, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, ChevronLeft, ChevronRight, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { toast } from "@/components/ui/toast";
import api from "@/api/client";
import { useNotifications, useNotificationAction, useNotificationPreferences } from "./useNotifications";
import NotificationPreferences from "./NotificationPreferences";
import NotificationListItem from "./NotificationListItem";

function dayLabel(value) {
  const date = new Date(value), today = new Date(), yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined });
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const base = user.role === "Super Admin" ? "/admin" : user.role === "Reseller" ? "/reseller" : "/user";
  const client = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const query = useNotifications({ page, limit: 20, unread: filter === "unread", archived: filter === "archived", category, search: deferredSearch });
  const preferences = useNotificationPreferences();
  const action = useNotificationAction();
  const operations = useQuery({ queryKey: ["notificationOperations"], queryFn: async () => (await api.get("/notifications/operations")).data, enabled: user.role === "Super Admin" && !user.isPreview, refetchInterval: 60000 });
  const retry = useMutation({ mutationFn: () => api.post("/notifications/retry"), onSuccess: () => client.invalidateQueries({ queryKey: ["notificationOperations"] }), onError: (error) => toast.add({ title: error.message, type: "error" }) });
  const changeFilter = (value) => { setFilter(value); setPage(1); };
  const selectClass = "h-9 rounded-lg border border-input bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/20";
  const clearFilters = () => { setCategory(""); setSearch(""); setFilter("all"); setPage(1); };
  const hasFilters = Boolean(category || search);
  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-5 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5"><div className="flex items-center gap-2.5"><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Notifications</h1>{query.data?.unreadCount > 0 && <span className="rounded-md bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary">{query.data.unreadCount} unread</span>}</div><p className="text-xs leading-5 text-muted-foreground">Stay up to date with your campaigns, credits and account.</p></div>
        <div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={"size-3.5 " + (query.isFetching ? "animate-spin" : "")} /> Refresh</Button><Button type="button" size="sm" variant="outline" disabled={!query.data?.unreadCount || action.isPending || user.isPreview} onClick={() => action.mutate({ id: "all" })}><CheckCheck className="size-3.5" /> Mark all read</Button></div>
      </header>

      {operations.data && (operations.data.failedEvents > 0 || operations.data.failedPush > 0) && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"><div className="space-y-1"><p className="font-medium">Some notifications need attention</p><p className="text-[11px]">{operations.data.failedEvents} events and {operations.data.failedPush} browser deliveries could not be delivered.</p></div><Button size="sm" variant="outline" onClick={() => retry.mutate()} disabled={retry.isPending}>Retry deliveries</Button></div>}

      <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Notification history">
        <div className="flex items-center gap-5 border-b border-border px-4 sm:px-5" aria-label="Notification filter">{[["all", "All activity"], ["unread", "Unread"], ["archived", "Archived"]].map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => changeFilter(value)} className={"relative py-3.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 " + (filter === value ? "font-semibold text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-t after:bg-primary" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}</div>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-muted/15 p-3 sm:px-5">
          <div className="relative min-w-44 flex-1"><Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} aria-label="Search notifications" placeholder="Search notifications..." className="h-9 bg-background pl-9 text-xs focus-visible:ring-2 focus-visible:ring-ring/20" /></div>
          <select aria-label="Notification category" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} className={selectClass}><option value="">All categories</option>{["campaigns", "credits", "accounts", "system"].map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select>
          {hasFilters && <Button type="button" size="icon-sm" variant="ghost" aria-label="Clear search and filters" title="Clear filters" onClick={clearFilters}><X className="size-3.5" /></Button>}
        </div>
        {query.isPending && <div role="status" className="divide-y divide-border/50"><span className="sr-only">Loading notifications...</span>{[0, 1, 2].map((key) => <div key={key} className="flex gap-4 p-5 motion-safe:animate-pulse"><div className="size-9 shrink-0 rounded-xl bg-muted" /><div className="flex-1 space-y-2"><div className="h-2 w-20 rounded bg-muted" /><div className="h-3 w-2/3 rounded bg-muted" /><div className="h-2.5 w-5/6 rounded bg-muted/70" /></div></div>)}</div>}
        {query.isError && <div role="alert" className="space-y-3 p-10 text-center text-xs"><p>Could not load your notifications.</p><Button variant="outline" size="sm" onClick={() => query.refetch()}>Try again</Button></div>}
        <ul aria-busy={query.isFetching}>{query.data?.items.map((item, index, items) => <Fragment key={item._id}>
          {(index === 0 || dayLabel(items[index - 1].createdAt) !== dayLabel(item.createdAt)) && <li className="bg-muted/20 px-4 py-2 text-[10px] font-medium text-muted-foreground sm:px-5">{dayLabel(item.createdAt)}</li>}
          <NotificationListItem item={item} base={base} action={action} isPreview={user.isPreview} onArchive={() => setPage(1)} />
        </Fragment>)}</ul>
        {query.isSuccess && !query.data.items.length && <div className="px-5 py-14 text-center"><span className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl border border-border bg-muted/25"><Bell className="size-5 text-muted-foreground" /></span><p className="text-sm font-semibold">{hasFilters ? "No matching notifications" : filter === "unread" ? "You're all caught up" : filter === "archived" ? "Nothing archived yet" : "Your updates will appear here"}</p><p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-muted-foreground">{hasFilters ? "Try another search or category." : filter === "unread" ? "You've read all your latest updates." : filter === "archived" ? "Archived notifications stay available here." : "We'll keep you informed about campaigns, credits and account changes."}</p>{hasFilters && <Button type="button" size="sm" variant="outline" className="mt-4" onClick={clearFilters}>Clear filters</Button>}</div>}
        {query.data && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/15 px-4 py-3 text-[11px] text-muted-foreground sm:px-5"><span aria-live="polite">{query.data.pagination.total ? Math.min((page - 1) * 20 + 1, query.data.pagination.total) : 0}&ndash;{Math.min(page * 20, query.data.pagination.total)} of {query.data.pagination.total} notifications</span><div className="flex items-center gap-2"><Button type="button" variant="outline" size="icon-xs" aria-label="Previous notifications" disabled={page <= 1 || query.isFetching} onClick={() => setPage(page - 1)}><ChevronLeft className="size-3.5" /></Button><span className="px-1">Page {page} of {query.data.pagination.pages}</span><Button type="button" variant="outline" size="icon-xs" aria-label="Next notifications" disabled={page >= query.data.pagination.pages || query.isFetching} onClick={() => setPage(page + 1)}><ChevronRight className="size-3.5" /></Button></div></footer>}
      </section>
      {preferences.data && <NotificationPreferences key={JSON.stringify(preferences.data)} preference={preferences.data} user={user} />}
      {preferences.isError && <p role="alert" className="text-xs text-destructive">Preferences could not be loaded. <button type="button" className="underline" onClick={() => preferences.refetch()}>Retry</button></p>}
    </div>
  );
}
