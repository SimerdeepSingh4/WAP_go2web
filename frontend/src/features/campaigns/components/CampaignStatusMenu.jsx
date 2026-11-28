import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/features/dashboard/components/shared";
import { published, statusLabels } from "@/lib/format";

const CAMPAIGN_STATUS_OPTIONS = [
  { value: "pending", label: "Pending", description: "Queued for processing", dot: "bg-amber-500" },
  { value: "ongoing", label: "Ongoing", description: "Currently active & dispatching", dot: "bg-blue-500" },
  { value: "completed", label: "Completed", description: "All messages finished", dot: "bg-emerald-500" },
  { value: "paused", label: "Paused", description: "Temporarily pause execution", dot: "bg-amber-400" },
  { value: "scheduled", label: "Scheduled", description: "Waiting for dispatch time", dot: "bg-purple-500" },
  { value: "stopped", label: "Stopped", description: "Terminated / cancelled", dot: "bg-stone-500" },
  { value: "failed", label: "Failed", description: "Mark campaign as failed", dot: "bg-red-500" },
];

const CAMPAIGN_STATUS_PILL_STYLES = {
  ongoing: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100/80 hover:text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 hover:text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  sent: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 hover:text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  pending: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/80 hover:text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  paused: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/80 hover:text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  scheduled: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100/80 hover:text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  stopped: "border-stone-300 bg-stone-100 text-stone-800 hover:bg-stone-200/80 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
  failed: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100/80 hover:text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
};

export default function CampaignStatusMenu({ campaign, onSelect, isUpdating = false, disabled = false }) {
  const { user } = useAuth();
  const isFinalizedFailure = published(campaign) && campaign.status === "failed";
  const canEdit = user?.role === "Super Admin" && !user?.isPreview && !isFinalizedFailure;

  if (!canEdit) {
    return <StatusBadge status={campaign.status} />;
  }

  const normalizedStatus = campaign.status === "sent" ? "completed" : campaign.status;
  const currentOption = CAMPAIGN_STATUS_OPTIONS.find((opt) => opt.value === normalizedStatus);
  const label = statusLabels[campaign.status] || campaign.status;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={disabled || isUpdating}
            style={{ minHeight: 28 }}
            aria-label={`Change status for ${campaign.campaignTitle}, currently ${label}`}
            className={`h-7 gap-1.5 rounded-full px-2.5 text-xs font-medium shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 ${
              CAMPAIGN_STATUS_PILL_STYLES[campaign.status] || "border-border bg-background text-foreground hover:bg-muted"
            }`}
          />
        }
      >
        {isUpdating ? (
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        ) : (
          <span className={`size-1.5 shrink-0 rounded-full ${currentOption?.dot || "bg-stone-500"}`} aria-hidden="true" />
        )}
        <span>{label}</span>
        <ChevronDown className="size-3 opacity-70" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 p-1.5 shadow-lg border border-border">
        <DropdownMenuLabel className="px-2 py-1 text-xs font-semibold text-foreground">
          Update campaign status
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {CAMPAIGN_STATUS_OPTIONS.map((opt) => {
          const isCurrent = normalizedStatus === opt.value;
          return (
            <DropdownMenuItem
              key={opt.value}
              disabled={disabled || isUpdating || isCurrent}
              onClick={() => onSelect(opt.value)}
              className="flex items-center justify-between gap-2.5 py-2 px-2.5 rounded-md cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`size-2 shrink-0 rounded-full ${opt.dot}`} aria-hidden="true" />
                <div className="min-w-0">
                  <p className={`text-xs ${isCurrent ? "font-semibold text-foreground" : "font-medium text-foreground/90"}`}>
                    {opt.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground truncate">{opt.description}</p>
                </div>
              </div>
              {isCurrent && <Check className="size-3.5 text-emerald-600 shrink-0" aria-hidden="true" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
