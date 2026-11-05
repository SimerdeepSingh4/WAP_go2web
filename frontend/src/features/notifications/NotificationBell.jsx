import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Popover } from "@base-ui/react/popover";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { ArrowUpRight, Bell, Check, CheckCheck, RefreshCw } from "lucide-react";
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
  const reduced = useReducedMotion();
  const bell = useRef(null);
  const previousCount = useRef(null);
  useEffect(() => {
    if (!query.isSuccess) return;
    const increased = previousCount.current !== null && count > previousCount.current;
    previousCount.current = count;
    if (!increased || reduced) return;
    const animation = bell.current?.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(16deg)" }, { transform: "rotate(-12deg)" }, { transform: "rotate(7deg)" }, { transform: "rotate(-3deg)" }, { transform: "rotate(0deg)" }], { duration: 720, easing: "ease-out" });
    return () => animation?.cancel();
  }, [count, reduced, query.isSuccess]);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="portal-notification-btn relative" aria-label={`Notifications${count ? `, ${count} unread` : ""}`}>
        <Bell ref={bell} className="size-4.5 origin-top" aria-hidden="true" />
        {count > 0 && <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] leading-4 text-primary-foreground" aria-hidden="true">{count > 99 ? "99+" : count}</span>}
      </Popover.Trigger>
      <Popover.Portal><Popover.Positioner align="end" sideOffset={10} className="z-50"><Popover.Popup className="w-100 max-w-[calc(100vw-1rem)] origin-[var(--transform-origin)] overflow-hidden rounded-[28px] border border-border bg-popover/95 p-2 text-popover-foreground shadow-xl backdrop-blur-xl outline-none motion-safe:transition-[opacity,transform] motion-safe:duration-200 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0">
        <div className="flex items-center gap-2 px-3 pb-3 pt-2"><Bell className="size-[18px]" /><Popover.Title className="flex-1 text-sm font-semibold">Notifications</Popover.Title>{count > 0 && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium tabular-nums">{count} new</span>}<Button size="icon-xs" variant="ghost" aria-label="Mark all notifications read" title="Mark all read" disabled={!count || action.isPending || user?.isPreview} onClick={() => action.mutate({ id: "all" })}><CheckCheck className="size-3.5" /></Button></div>
        <div className="max-h-[min(480px,calc(100svh-12rem))] overflow-y-auto overscroll-contain rounded-2xl bg-muted/50 px-1.5 pt-1.5 [scrollbar-width:thin]">
          {query.isPending && <p role="status" className="p-6 text-center text-xs text-muted-foreground">Loading notifications...</p>}
          {query.isError && <div className="space-y-2 p-5 text-center text-xs"><p>Could not load notifications.</p><Button size="sm" variant="outline" onClick={() => query.refetch()}><RefreshCw className="size-3" /> Retry</Button></div>}
          <ul aria-label="Recent notifications" aria-busy={query.isFetching}><AnimatePresence initial={false}>{query.data?.items.map((item) => <NotificationListItem key={item._id} item={item} base={base} action={action} isPreview={user?.isPreview} compact onOpen={() => setOpen(false)} />)}</AnimatePresence></ul>
          {query.isSuccess && !query.data.items.length && <div className="py-12 text-center"><span className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-background"><Check className="size-5 text-muted-foreground" /></span><p className="text-sm font-medium">You're all caught up</p><p className="mt-1 text-xs text-muted-foreground">New notifications will land here.</p></div>}
        </div>
        <Link to={`${base}/notifications`} onClick={() => setOpen(false)} className="mt-1 flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-xs font-medium outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">View all notifications<ArrowUpRight className="size-3.5" /></Link>
      </Popover.Popup></Popover.Positioner></Popover.Portal>
    </Popover.Root>
  );
}
