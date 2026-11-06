import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthConnectionNotice({ fullPage, retrying, onRetry }) {
  const content = <div role="alert" className="flex max-w-lg flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5 text-foreground shadow-sm">
    <CloudOff className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
    <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Unable to verify your connection</h2><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{fullPage ? "We couldn't check your session. Check your connection and try again." : "Your session is being kept. Some information may be unavailable until the connection recovers."}</p></div>
    <Button type="button" variant="outline" disabled={retrying} onClick={onRetry}>{retrying ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}{retrying ? "Retrying..." : "Retry connection"}</Button>
  </div>;
  return fullPage ? <main className="grid min-h-svh place-items-center bg-background p-5">{content}</main> : <div className="fixed bottom-4 left-4 right-4 z-[100] flex justify-center sm:left-auto">{content}</div>;
}
