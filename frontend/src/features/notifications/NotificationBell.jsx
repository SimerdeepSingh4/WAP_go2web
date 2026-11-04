import { useState } from "react";
import { Link } from "react-router";
import { Popover } from "@base-ui/react/popover";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useNotifications, useNotificationAction } from "./useNotifications";

export default function NotificationBell({ base }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const query = useNotifications({ limit: 6 });
  const action = useNotificationAction();
  const count = query.data?.unreadCount || 0;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="portal-notification-btn relative" aria-label={`Notifications${count ? `, ${count} unread` : ""}`}>
        <Bell className="size-4.5" aria-hidden="true" />
        {count > 0 && <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
      </Popover.Trigger>
      <Popover.Portal><Popover.Positioner align="end" sideOffset={10} className="z-50"><Popover.Popup className="w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3"><Popover.Title className="text-sm font-semibold">Notifications</Popover.Title><Button size="icon-xs" variant="ghost" aria-label="Mark all notifications read" disabled={!count || action.isPending || user?.isPreview} onClick={() => action.mutate({ id: "all" })}><CheckCheck className="size-3.5" /></Button></div>
        <div className="max-h-88 overflow-y-auto">
          {query.isPending && <p role="status" className="p-6 text-center text-xs text-muted-foreground">Loading notifications...</p>}
          {query.isError && <div className="space-y-2 p-5 text-center text-xs"><p>Could not load notifications.</p><Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="size-3" /> Retry</Button></div>}
          {query.data?.items.map((item) => <Link key={item._id} to={item.href.startsWith(base + "/") ? item.href : `${base}/notifications`} onClick={() => { if (!user?.isPreview && !item.readAt) action.mutate({ id: item._id, read: true }); setOpen(false); }} className={`block border-b border-border/50 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring ${!item.readAt ? "bg-primary/[0.025]" : ""}`}><div className="flex items-start gap-2"><span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${item.readAt ? "bg-transparent" : "bg-primary"}`} /><div className="min-w-0"><p className={`text-xs ${item.readAt ? "font-normal" : "font-semibold"}`}>{item.title}</p><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{item.body}</p><time dateTime={item.createdAt} className="mt-1 block text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div></div></Link>)}
          {query.isSuccess && !query.data.items.length && <div className="p-8 text-center"><Bell className="mx-auto mb-2 size-5 text-muted-foreground/60" /><p className="text-xs font-medium">You're all caught up</p><p className="mt-1 text-[11px] text-muted-foreground">Campaign and credit updates will appear here.</p></div>}
        </div>
        <Link to={`${base}/notifications`} onClick={() => setOpen(false)} className="block border-t border-border px-4 py-3 text-center text-xs font-medium hover:bg-muted/40">View all notifications</Link>
      </Popover.Popup></Popover.Positioner></Popover.Portal>
    </Popover.Root>
  );
}
