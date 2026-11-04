import { Link } from "react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  ChevronDown,
  Check,
  Loader2,
  SlidersHorizontal,
} from "lucide-react";
import api from "@/api/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/features/admin/components/shared";
import { dateTime, number, ownerName, statusLabels } from "@/features/admin/lib/format";
import { toast } from "@/components/ui/toast";

const STATUS_OPTIONS = [
  { value: "ongoing", label: "Ongoing", description: "Currently active & dispatching", dot: "bg-blue-500" },
  { value: "completed", label: "Completed", description: "All messages finished", dot: "bg-emerald-500" },
  { value: "pending", label: "Pending", description: "Queued for processing", dot: "bg-amber-500" },
  { value: "paused", label: "Paused", description: "Temporarily pause execution", dot: "bg-amber-400" },
  { value: "scheduled", label: "Scheduled", description: "Waiting for dispatch time", dot: "bg-stone-400" },
  { value: "stopped", label: "Stopped", description: "Terminated / cancelled", dot: "bg-stone-500" },
  { value: "failed", label: "Failed", description: "Mark campaign as failed", dot: "bg-red-500" },
];

export default function CampaignDetailHeader({ campaign, base, id }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [confirmFailure, setConfirmFailure] = useState(false);
  const remainingRefund = Math.max(0, (campaign.creditsDeducted || 0) - (campaign.campaignSummary?.creditsRefunded || 0));

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus) => {
      const res = await api.patch(`/campaigns/${id}/status`, { status: newStatus });
      return res.data;
    },
    onSuccess: (data, newStatus) => {
      setConfirmFailure(false);
      toast.add({
        title: `Campaign status updated to "${statusLabels[newStatus] || newStatus}"`,
        description: data.refundInfo ? `${number(data.refundInfo.amount)} credits returned to the campaign creator.` : undefined,
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["campaign-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign-report", id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["user-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["reseller-campaigns"] });
    },
    onError: (err) => {
      toast.add({
        title: err?.response?.data?.message || "Failed to update campaign status",
        type: "error",
      });
    },
  });

  const handleSelectStatus = (newStatus) => {
    if (newStatus === campaign.status) return;
    if (user?.isPreview) {
      toast.add({ title: "Action disabled in demo preview mode", type: "error" });
      return;
    }
    if (newStatus === "failed") { setConfirmFailure(true); return; }
    updateStatusMutation.mutate(newStatus);
  };

  const isUpdating = updateStatusMutation.isPending;

  return (
    <header className="space-y-4">
      {/* Left: Back button + Title & Status */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to={`${base}/campaigns`} />}
          className="-ml-2 h-7 gap-1.5 text-xs text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to campaigns
        </Button>

      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="min-w-0 text-xl font-semibold tracking-tight text-foreground break-words sm:text-2xl">
              {campaign.campaignTitle}
            </h1>
            <StatusBadge status={campaign.status} />
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{ownerName(campaign.userId)}</span>
            <span>Submitted {dateTime(campaign.createdAt)}</span>
          </div>
        </div>

      {/* Right: Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                disabled={isUpdating}
                className="h-8 gap-1.5 text-xs"
              >
                {isUpdating ? (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <SlidersHorizontal className="size-3.5 text-muted-foreground" />
                )}
                <span>Change status</span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-60 p-1.5 shadow-lg border border-border">
            <DropdownMenuLabel className="px-2 py-1 text-xs font-semibold text-foreground">
              Update Campaign Status
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STATUS_OPTIONS.map((opt) => {
              const isCurrent = campaign.status === opt.value;
              return (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleSelectStatus(opt.value)}
                  disabled={isUpdating || isCurrent}
                  className="flex items-center justify-between gap-2.5 py-2 px-2.5 rounded-md cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`size-2.5 shrink-0 rounded-full ${opt.dot}`} />
                    <div className="min-w-0">
                      <p
                        className={`text-xs ${
                          isCurrent ? "font-semibold text-foreground" : "font-medium text-foreground/90"
                        }`}
                      >
                        {opt.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate">{opt.description}</p>
                    </div>
                  </div>
                  {isCurrent && <Check className="size-3.5 text-emerald-600 shrink-0" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          nativeButton={false}
          render={<Link to={`${base}/campaigns/${id}/report/create`} />}
          size="sm"
          className="h-8 gap-1.5 text-xs"
        >
          <FileText className="size-3.5" />
          Create report
        </Button>
      </div>
      </div>
      <Dialog open={confirmFailure} onOpenChange={(open) => !isUpdating && setConfirmFailure(open)}>
        <DialogContent className="gap-5 rounded-2xl p-5 sm:max-w-sm">
          <DialogHeader className="gap-1.5 pr-6">
            <DialogTitle>Mark campaign as failed?</DialogTitle>
            <DialogDescription className="text-xs leading-5">This stops the campaign and returns all charged credits to its creator. Credits already refunded will not be refunded again.</DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <dl className="space-y-2 tabular-nums">
              <div className="flex justify-between gap-3"><dt>Original charge</dt><dd>{number(campaign.creditsDeducted || 0)} credits</dd></div>
              <div className="flex justify-between gap-3"><dt>Already refunded</dt><dd>{number(campaign.campaignSummary?.creditsRefunded || 0)} credits</dd></div>
              <div className="flex justify-between gap-3"><dt>Refund on confirmation</dt><dd className="font-semibold">{number(remainingRefund)} credits</dd></div>
              <div className="flex justify-between gap-3 border-t border-amber-200 pt-2 font-semibold dark:border-amber-800"><dt>Total refunded afterward</dt><dd>{number(Math.max(campaign.creditsDeducted || 0, campaign.campaignSummary?.creditsRefunded || 0))} credits</dd></div>
            </dl>
          </div>
          <DialogFooter className="m-0 flex-row justify-end rounded-none border-0 bg-transparent p-0">
            <Button type="button" variant="ghost" size="sm" disabled={isUpdating} onClick={() => setConfirmFailure(false)}>Cancel</Button>
            <Button type="button" variant="destructive" size="sm" disabled={isUpdating} onClick={() => updateStatusMutation.mutate("failed")}>{isUpdating && <Loader2 className="size-3.5 animate-spin" />}Mark failed &amp; refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
