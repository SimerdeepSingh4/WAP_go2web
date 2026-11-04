import { Link } from "react-router";
import { Archive, ArrowUpRight, Bell, Check, Info, MailOpen, Megaphone, Undo2, UserRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

const categories = {
  campaigns: { icon: Megaphone, label: "Campaign", tone: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" },
  credits: { icon: Wallet, label: "Credits", tone: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
  accounts: { icon: UserRound, label: "Account", tone: "bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300" },
  system: { icon: Info, label: "System", tone: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
};

function relativeTime(value) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotificationListItem({ item, base, action, isPreview, onArchive }) {
  const category = categories[item.category] || { icon: Bell, label: "Update", tone: "bg-muted text-muted-foreground" };
  const Icon = category.icon;
  const unread = !item.readAt && !item.archivedAt;
  return (
    <li className={`group relative flex items-start gap-3 border-t border-border/60 px-4 py-4 transition-colors sm:gap-4 sm:px-5 ${unread ? "bg-primary/[0.02]" : "bg-card"} hover:bg-muted/25`}>
      {unread && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary/70" aria-hidden="true" />}
      <span className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${category.tone}`}><Icon className="size-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground"><span>{category.label}</span><span aria-hidden="true">&middot;</span><time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>{relativeTime(item.createdAt)}</time>{unread && <span className="ml-1 inline-flex items-center gap-1 text-primary"><span className="size-1 rounded-full bg-current" />Unread</span>}</div>
        <Link to={item.href.startsWith(base + "/") ? item.href : base + "/notifications"} onClick={() => { if (!item.readAt && !isPreview) action.mutate({ id: item._id, read: true }); }} className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
          <div className="flex items-start gap-2"><p className={`min-w-0 break-words text-sm leading-5 text-foreground ${unread ? "font-semibold" : "font-medium"}`}>{item.title}</p><ArrowUpRight className="mt-0.5 hidden size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:block" /></div>
          <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">{item.body}</p>
        </Link>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1 sm:flex-row">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={item.readAt ? "Mark unread" : "Mark read"} title={item.readAt ? "Mark unread" : "Mark read"} disabled={action.isPending || isPreview} onClick={() => action.mutate({ id: item._id, read: !item.readAt })} className="text-muted-foreground hover:text-foreground">{item.readAt ? <MailOpen className="size-3.5" /> : <Check className="size-3.5" />}</Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={item.archivedAt ? "Restore notification" : "Archive notification"} title={item.archivedAt ? "Restore notification" : "Archive notification"} disabled={action.isPending || isPreview} onClick={() => { onArchive(); action.mutate({ id: item._id, archived: !item.archivedAt }); }} className="text-muted-foreground hover:text-foreground">{item.archivedAt ? <Undo2 className="size-3.5" /> : <Archive className="size-3.5" />}</Button>
      </div>
    </li>
  );
}
