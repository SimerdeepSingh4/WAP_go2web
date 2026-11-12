import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Popover } from "@base-ui/react/popover";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Archive, ArrowUpRight, Bell, Check, CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useNotifications, useNotificationAction } from "./useNotifications";
import NotificationListItem from "./NotificationListItem";

export default function NotificationBell({ base }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const query = useNotifications({ limit: 6 });
  const action = useNotificationAction();
  const count = query.data?.unreadCount || 0;
  const attentionCount = query.data?.attentionCount || 0;
  const reduced = useReducedMotion();
  const bell = useRef(null);
  const previousCount = useRef(null);
  useEffect(() => {
    if (!query.data) return;
    const increased = previousCount.current !== null && count > previousCount.current;
    previousCount.current = count;
    if ((!increased && !attentionCount) || reduced) return;
    const animation = bell.current?.animate([
      { transform: "rotate(0deg)", offset: 0 },
      { transform: "rotate(20deg)", offset: 0.06 },
      { transform: "rotate(-18deg)", offset: 0.12 },
      { transform: "rotate(14deg)", offset: 0.18 },
      { transform: "rotate(-10deg)", offset: 0.24 },
      { transform: "rotate(6deg)", offset: 0.30 },
      { transform: "rotate(-3deg)", offset: 0.36 },
      { transform: "rotate(0deg)", offset: 0.42 },
      { transform: "rotate(0deg)", offset: 1 },
    ], { duration: attentionCount ? 2400 : 1000, iterations: attentionCount ? Infinity : 1, easing: "ease-in-out" });
    return () => animation?.cancel();
  }, [count, attentionCount, reduced, query.isSuccess]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
      <Popover.Trigger className="portal-notification-btn relative" aria-label={`Notifications${count ? `, ${count} unread` : ""}${attentionCount ? `, ${attentionCount} need attention` : ""}`}>
        <Bell ref={bell} className="size-4.5 origin-top" aria-hidden="true" />
        {count > 0 && <span className="portal-notification-count" data-attention={attentionCount > 0 || undefined} aria-hidden="true">{count > 99 ? "99+" : count}</span>}
      </Popover.Trigger>
      <Popover.Portal><Popover.Positioner align="end" sideOffset={10} positionMethod="fixed" className="z-50"><Popover.Popup className="w-100 max-w-[calc(100vw-1rem)] origin-[var(--transform-origin)] overflow-hidden rounded-[28px] border border-border bg-popover/95 p-2 text-popover-foreground shadow-xl backdrop-blur-xl outline-none motion-safe:transition-[opacity,transform] motion-safe:duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
        <div className="flex items-center gap-2 px-3 pb-3 pt-2"><Bell className="size-[18px]" /><Popover.Title className="flex-1 text-sm font-semibold">Notifications</Popover.Title>{count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums">{count} new</span>}<Button size="icon-xs" variant="ghost" aria-label="Mark all notifications read" title="Mark all read" disabled={!count || action.isPending || user?.isPreview} onClick={() => action.mutate({ id: "all" })}><CheckCheck className="size-3.5" /></Button></div>
        <motion.div layoutScroll className="relative h-[min(480px,calc(100svh-12rem))] overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl bg-muted/50 px-1.5 pt-1.5 [overflow-anchor:none] [scrollbar-gutter:stable] [scrollbar-width:thin]">
          {query.isPending && <p role="status" className="p-6 text-center text-xs text-muted-foreground">Loading notifications...</p>}
          {query.isError && <div className="space-y-2 p-5 text-center text-xs"><p>Could not load notifications.</p><Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="size-3" /> Retry</Button></div>}
          <ul aria-label="Recent notifications" aria-busy={query.isFetching}><AnimatePresence initial={false}>{query.data?.items.map((item) => <NotificationListItem key={item._id} item={item} base={base} action={action} isPreview={user?.isPreview} compact onOpen={() => setOpen(false)} />)}</AnimatePresence></ul>
          {query.isSuccess && !query.data.items.length && <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center"><span className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-background"><Check className="size-5 text-muted-foreground" /></span><p className="text-sm font-medium">You're all caught up</p><p className="mt-1 text-xs text-muted-foreground">New notifications will land here.</p></div>}
        </motion.div>
        <div className="mt-1 flex items-center justify-between gap-2 px-2 py-1">
          <Link to={`${base}/notifications`} onClick={() => setOpen(false)} className="flex items-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">View all notifications<ArrowUpRight className="size-3.5" /></Link>
          <Button type="button" variant="ghost" size="xs" aria-label="Clear all notifications" title="Archive all inbox notifications" disabled={!query.data?.items?.length || action.isPending || user?.isPreview} onClick={() => action.mutate({ id: "all", archived: true })} className="gap-1 text-xs text-muted-foreground"><Archive className="size-3.5" />{action.isPending && action.variables?.archived && action.variables?.id === "all" ? "Clearing..." : "Clear all"}</Button>
        </div>
      </Popover.Popup></Popover.Positioner></Popover.Portal>
    </Popover.Root>
  );
}
