import { Link } from "react-router";
import { AlertCircle, ArrowLeft, FileQuestion, Loader2, LockKeyhole, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CampaignLoadError({ error, base, onRetry, isRetrying }) {
  const status = error?.response?.status;
  const connectionError = Boolean(error && !error.response);
  const canRetry = ![401, 403, 404].includes(status) && Boolean(error);
  const [Icon, title, description] = status === 404 || !error
    ? [FileQuestion, "Campaign not found", "This campaign may have been removed. Head back to Campaigns to find your other campaigns."]
    : status === 403
      ? [LockKeyhole, "This campaign isn't available", "Your account doesn't have access to this campaign. You can still view the campaigns available to you."]
      : status === 401
        ? [LockKeyhole, "Please sign in again", "Your session has expired. Sign in again to view this campaign."]
        : connectionError
          ? [WifiOff, "Couldn't connect to the server", "We couldn't load your campaign. Check your internet connection and try again in a moment."]
          : [AlertCircle, "Couldn't load this campaign", "Something went wrong while loading your campaign. Please try again in a moment."];

  return (
    <div className="flex min-h-[60svh] w-full items-center justify-center py-8 sm:py-12">
      <section aria-labelledby="campaign-error-title" className="w-full max-w-lg rounded-2xl border border-border bg-card px-6 py-8 text-center shadow-sm sm:px-10 sm:py-10">
        <div className="relative mx-auto mb-6 grid size-20 place-items-center rounded-full border border-border/60 bg-muted/30">
          <span className="grid size-14 place-items-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm"><Icon className="size-6" aria-hidden="true" /></span>
        </div>
        <h1 id="campaign-error-title" className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p role="status" className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
        <div className="mt-7 flex flex-col items-stretch justify-center gap-2.5 sm:flex-row sm:items-center">
          {status === 401 ? (
            <Button nativeButton={false} render={<Link to="/login" />} className="h-9 px-4">Sign in</Button>
          ) : canRetry && (
            <Button type="button" onClick={onRetry} disabled={isRetrying} className="h-9 gap-2 px-4">
              {isRetrying ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {isRetrying ? "Trying again..." : "Try again"}
            </Button>
          )}
          <Button variant="outline" nativeButton={false} render={<Link to={`${base}/campaigns`} />} className="h-9 gap-2 px-4"><ArrowLeft className="size-4" />Back to campaigns</Button>
        </div>
        {canRetry && <p className="mt-5 text-xs leading-5 text-muted-foreground">Your campaign details will appear here once the connection is restored.</p>}
      </section>
    </div>
  );
}
