import { Link } from "react-router";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Bell, Check, Info, MailOpen, Megaphone, Undo2, UserRound, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getNotificationSubject } from "./notification.utils";

const categories = {
  campaigns: { icon: Megaphone, label: "Campaigns", tone: "text-blue-600 dark:text-blue-400" },
  credits: { icon: Wallet, label: "Credits", tone: "text-emerald-600 dark:text-emerald-400" },
  accounts: { icon: UserRound, label: "Accounts", tone: "text-violet-600 dark:text-violet-400" },
  system: { icon: Info, label: "System", tone: "text-amber-600 dark:text-amber-400" },
};
const tint = "color-mix(in oklab, currentColor 12%, transparent)";
const reel = Array.from({ length: 20 }, (_, index) => index % 10);

function relativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function CreditAmount({ amount, reduced }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" aria-label={`${amount} credits`}>
      <span aria-hidden="true" className="flex text-2xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
        {[...amount].map((char, index) => /\d/.test(char) ? (
          <span key={index} className="relative inline-block h-[1.15em] overflow-hidden leading-[1.15]">
            <span className="invisible">0</span>
            <motion.span className="absolute inset-x-0 top-0 flex flex-col" initial={reduced ? false : { y: 0 }} animate={{ y: `-${(10 + Number(char)) * 1.15}em` }} transition={{ duration: reduced ? 0 : 0.85 + index * 0.06, delay: reduced ? 0 : 0.2, ease: [0.15, 0.85, 0.25, 1] }}>
              {reel.map((digit, key) => <span key={key}>{digit}</span>)}
            </motion.span>
          </span>
        ) : <span key={index}>{char}</span>)}
      </span>
      <span className="text-[11px] text-muted-foreground">credits</span>
    </div>
  );
}

export default function NotificationListItem({ item, base, action, isPreview, onArchive, onOpen, compact = false, day }) {
  const { user } = useAuth();
  const reduced = useReducedMotion();
  const category = categories[item.category] || { icon: Bell, label: "Update", tone: "text-primary" };
  const Icon = category.icon;
  const unread = !item.readAt && !item.archivedAt;
  const subject = getNotificationSubject(item);
  const showSubject = subject && (user?.role === "Super Admin" || user?.role === "Reseller");
  // Animate details present in the notification without inventing delivery progress.
  const amount = item.category === "credits" ? item.body?.match(/\b([\d,]+(?:\.\d+)?)\s+credits\b/i)?.[1] : null;
  const status = item.category === "campaigns" ? item.title?.match(/^Campaign (ongoing|completed|pending|paused|scheduled|stopped|failed|sent)\b/i)?.[1] : null;
  const disabled = action.isPending || isPreview;
  const href = item.href?.startsWith(base + "/") ? item.href : base + "/notifications";
  const open = () => { if (!item.readAt && !isPreview) action.mutate({ id: item._id, read: true }); onOpen?.(); };
  const archive = () => {
    if (disabled) return;
    onArchive?.();
    action.mutate({ id: item._id, archived: !item.archivedAt });
  };

  return (
    <motion.li layout={reduced ? false : "position"} initial={reduced ? false : { opacity: 0, height: 0, y: -16, scale: 0.96 }} animate={{ opacity: 1, height: "auto", y: 0, scale: 1 }} exit={{ opacity: 0, height: 0, x: reduced ? 0 : 64, scale: reduced ? 1 : 0.98 }} transition={reduced ? { duration: 0 } : { duration: 0.34, opacity: { duration: 0.2 }, y: { type: "spring", stiffness: 340, damping: 25 } }} className="relative min-w-0 overflow-hidden" data-notification={item._id}>
      {day && <p className="px-2 pb-2 pt-3 text-[10px] font-medium text-muted-foreground">{day}</p>}
      <article aria-label={`${category.label}: ${item.title}`} className={`group relative mb-2 rounded-2xl border border-border/80 bg-card text-card-foreground shadow-sm transition-colors hover:border-border ${compact ? "p-3" : "p-4 sm:p-5"}`}>
        <div className="flex items-start gap-3">
          <span className={`relative grid size-9 shrink-0 place-items-center rounded-xl ${category.tone}`} style={{ background: tint }}>
            <Icon className="size-[18px]" aria-hidden="true" />
            {unread && !reduced && <motion.span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl border-2 border-current" initial={{ scale: 1, opacity: 0.5 }} animate={{ scale: 1.8, opacity: 0 }} transition={{ duration: 0.9, delay: 0.26 }} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 pr-5 text-[11px] text-muted-foreground">
              <span className="font-medium">{category.label}</span><span aria-hidden="true">&middot;</span>
              <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()} className="tabular-nums">{relativeTime(item.createdAt)}</time>
            </div>
            <Link to={href} onClick={open} onKeyDown={(event) => { if (event.key === "Delete") { event.preventDefault(); archive(); } }} className="mt-0.5 block rounded-sm outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring">
              <p className="break-words pr-3 text-sm font-semibold leading-snug">{item.title}</p>
            </Link>
            {item.body && <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-snug text-muted-foreground">{item.body}</p>}
            {amount && <CreditAmount amount={amount} reduced={reduced} />}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              {(showSubject || status) && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
                {showSubject && <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground"><UserRound className="size-3 shrink-0" /><span className="truncate">{subject.username}{subject.role ? ` (${subject.role})` : ""}</span></span>}
                {status && <motion.span initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : 0.26 }} className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium capitalize ${category.tone}`} style={{ background: tint }}>{["completed", "sent"].includes(status.toLowerCase()) ? <Check className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />}{status}</motion.span>}
              </div>}
              <div className="relative z-10 flex shrink-0 items-center gap-2">
              <Button type="button" variant={item.readAt ? "outline" : "default"} size="xs" disabled={disabled} onClick={() => action.mutate({ id: item._id, read: !item.readAt })} className="rounded-full px-3 text-[11px]">{item.readAt ? <MailOpen /> : <Check />}{item.readAt ? "Mark unread" : "Mark read"}</Button>
              <Link to={href} onClick={open} className="inline-flex h-6 items-center gap-1 rounded-full border border-border bg-background px-3 text-[11px] font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">View<ArrowUpRight className="size-3" /></Link>
              </div>
            </div>
          </div>
        </div>
        {unread && <span aria-label="Unread" className={`pointer-events-none absolute right-10 top-4 size-2 rounded-full transition-opacity group-hover:opacity-0 group-focus-within:opacity-0 sm:right-4 ${category.tone}`} style={{ background: "currentColor" }} />}
        <Button type="button" variant="ghost" size="icon-xs" aria-label={item.archivedAt ? "Restore notification" : "Archive notification"} title={item.archivedAt ? "Restore notification" : "Archive notification"} disabled={disabled} onClick={archive} className="absolute right-2 top-2 z-10 rounded-full text-muted-foreground opacity-100 transition-opacity hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">{item.archivedAt ? <Undo2 /> : <X />}</Button>
      </article>
    </motion.li>
  );
}
