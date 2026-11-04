import { Link } from "react-router";
import { AlertCircle, ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ReportLoadError({ error, base, onRetry, isRetrying }) {
  const status = error?.response?.status;
  const canRetry = ![401, 403, 404].includes(status);
  const [title, message] = status === 404
    ? ["Report not found", "This campaign may have been removed. You can find your other reports in Campaigns."]
    : status === 403
      ? ["Report unavailable", "Your account doesn't have access to this campaign report."]
      : status === 401
        ? ["Please sign in again", "Your session has expired. Sign in again to view your campaign report."]
        : error && !error.response
          ? ["Couldn't connect", "We couldn't reach the server to load your report. Please try again in a moment."]
          : ["Couldn't load this report", "The report is temporarily unavailable. Please try again."];

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-2 py-10 sm:px-4">
      <section aria-labelledby="report-error-title" className="w-full max-w-md rounded-2xl border border-border bg-card p-6 text-center sm:p-8">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-muted/60 text-muted-foreground"><AlertCircle className="size-5" /></div>
        <h1 id="report-error-title" className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
        <p role="status" className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{message}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" nativeButton={false} render={<Link to={`${base}/campaigns`} />}><ArrowLeft className="size-3.5" /> Campaigns</Button>
          {status === 401 ? <Button size="sm" nativeButton={false} render={<Link to="/login" />}>Sign in</Button> : canRetry && <Button type="button" size="sm" onClick={onRetry} disabled={isRetrying}>{isRetrying ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}{isRetrying ? "Trying again..." : "Try again"}</Button>}
        </div>
      </section>
    </div>
  );
}
