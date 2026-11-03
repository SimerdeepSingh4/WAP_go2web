import { CalendarClock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "../hooks/useAuth";

export default function ExpiredAccountPage() {
  const { user, logout, isLoggingOut } = useAuth();
  const expiryLabel = user?.expiresAt
    ? new Date(user.expiresAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-5 py-12">
      <section className="w-full max-w-md border-t-4 border-destructive bg-card p-7 shadow-sm sm:p-9">
        <div className="mb-5 grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          <CalendarClock className="size-6" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
          Account access paused
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          Your account has expired
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {user?.username ? `${user.username}, ` : ""}your account expiry date has passed.
          Contact the administrator to renew access.
        </p>
        {expiryLabel && (
          <p className="mt-5 border-y py-3 text-sm text-muted-foreground">
            Expired on <strong className="font-semibold text-foreground">{expiryLabel}</strong>
          </p>
        )}
        <Button
          className="mt-6 w-full"
          onClick={() => logout()}
          disabled={isLoggingOut}
        >
          <LogOut className="mr-2 size-4" />
          {isLoggingOut ? "Signing out…" : "Sign out"}
        </Button>
      </section>
    </main>
  );
}
