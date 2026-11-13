import { BellOff } from "lucide-react";

export default function RestrictedNotifications({ restriction }) {
  return <div className="flex min-h-64 flex-col items-center justify-center px-6 py-12 text-center" role="status">
    <span className="mb-4 grid size-12 place-items-center rounded-2xl border border-border bg-background"><BellOff className="size-5 text-muted-foreground" aria-hidden="true" /></span>
    <p className="text-sm font-semibold">No notifications</p>
    <p className="mt-2 max-w-64 text-xs leading-5 text-muted-foreground">Your account is {restriction}. Contact your admin to restore access.</p>
  </div>;
}
