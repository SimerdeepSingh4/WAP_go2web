import "./campaign-detail-header.css";
import CampaignReference from "@/components/dashboard/CampaignReference";
import { Link, useNavigate } from "react-router";
import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  FileText,
  ChevronDown,
  Check,
  Loader2,
  SlidersHorizontal,
  Play,
  CalendarClock,
  XCircle,
  CalendarDays,
  Trash2,
} from "lucide-react";
import api from "@/api/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import CampaignDeleteDialog from "../CampaignDeleteDialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { dateTime, number, ownerName, statusLabels } from "@/features/admin/lib/format";
import { toast } from "@/components/ui/toast";
import UserAvatar from "@/components/dashboard/UserAvatar";
import SupportHelpButton from "@/features/support/components/SupportHelpButton";

const STATUS_OPTIONS = [
  { value: "ongoing", label: "Ongoing", description: "Currently active & dispatching", dot: "bg-blue-500" },
  { value: "completed", label: "Completed", description: "All messages finished", dot: "bg-emerald-500" },
  { value: "pending", label: "Pending", description: "Queued for processing", dot: "bg-amber-500" },
  { value: "paused", label: "Paused", description: "Temporarily pause execution", dot: "bg-amber-400" },
  { value: "scheduled", label: "Scheduled", description: "Waiting for dispatch time", dot: "bg-purple-500" },
  { value: "stopped", label: "Stopped", description: "Terminated / cancelled", dot: "bg-stone-500" },
  { value: "failed", label: "Failed", description: "Mark campaign as failed", dot: "bg-red-500" },
];

const STATUS_BUTTON_STYLES = {
  ongoing: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100/80 hover:text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 hover:text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  active: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 hover:text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  sent: "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/80 hover:text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  pending: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/80 hover:text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  paused: "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100/80 hover:text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  scheduled: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100/80 hover:text-purple-800 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  stopped: "border-stone-300 bg-stone-100 text-stone-800 hover:bg-stone-200/80 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
  failed: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100/80 hover:text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  blocked: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100/80 hover:text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
  expired: "border-red-200 bg-red-50 text-red-800 hover:bg-red-100/80 hover:text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300",
};

export default function CampaignDetailHeader({ campaign, base, id }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "Super Admin";
  const isReseller = user?.role === "Reseller";
  const canManageCampaign = isAdmin || user?.role === "User";

  const [confirmFailure, setConfirmFailure] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const navigate = useNavigate();

  const deleteCampaignMutation = useMutation({
    mutationFn: async () => {
      return (await api.delete(`/campaigns/${campaign._id}`)).data;
    },
    onSuccess: (data) => {
      toast.add({ title: "Campaign deleted", description: data?.message, type: "success" });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["reseller"] });
      queryClient.invalidateQueries({ queryKey: ["user"] });
      const returnPath = isAdmin ? "/admin/campaigns" : isReseller ? "/reseller/campaigns" : "/user/campaigns";
      navigate(returnPath);
    },
    onError: (error) => {
      toast.add({ title: "Delete failed", description: error?.response?.data?.message || error.message, type: "error" });
    },
  });
  const [editScheduleOpen, setEditScheduleOpen] = useState(false);
  const [newScheduledTime, setNewScheduledTime] = useState(() => {
    if (campaign.scheduledTime) {
      const d = new Date(campaign.scheduledTime);
      d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
      return d.toISOString().slice(0, 16);
    }
    const d = new Date(Date.now() + 10 * 60_000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });

  const isScheduledCampaign = campaign.schedule === "later" && Boolean(campaign.scheduledTime);
  const isApprovalPending = isScheduledCampaign && campaign.status === "pending";
  const displayStatusLabel = isApprovalPending
    ? "Approval Pending"
    : statusLabels[campaign.status] || campaign.status;

  const settledRefund = campaign.refundAccounting?.settled || 0;
  const remainingRefund = campaign.refundAccounting?.remaining ?? campaign.creditsDeducted ?? 0;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["campaign-detail", id] });
    queryClient.invalidateQueries({ queryKey: ["campaign-report", id] });
    queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["user-campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["reseller-campaigns"] });
    queryClient.invalidateQueries({ queryKey: ["wallet"] });
  };

  // Status mutation for admin
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus) => {
      const res = await api.patch(`/campaigns/${id}/status`, { status: newStatus });
      return res.data;
    },
    onSuccess: (data, newStatus) => {
      setConfirmFailure(false);
      toast.add({
        title: `Campaign status updated to "${statusLabels[newStatus] || newStatus}"`,
        description: data.refundInfo ? `${number(data.refundInfo.amount)} credits returned to creator.` : undefined,
        type: "success",
      });
      invalidateAll();
    },
    onError: (err) => {
      toast.add({
        title: err?.response?.data?.message || "Failed to update campaign status",
        type: "error",
      });
    },
  });

  // Cancel campaign mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/campaigns/${id}/cancel`);
      return res.data;
    },
    onSuccess: (data) => {
      setConfirmCancelOpen(false);
      toast.add({
        title: "Campaign cancelled",
        description: data.refundInfo
          ? `${number(data.refundInfo.amount)} credits returned to ${isAdmin ? "the creator's" : "your"} wallet.`
          : data.message,
        type: "success",
      });
      invalidateAll();
    },
    onError: (err) => {
      toast.add({
        title: err?.response?.data?.message || "Failed to cancel campaign",
        type: "error",
      });
    },
  });

  // Reschedule mutation
  const rescheduleMutation = useMutation({
    mutationFn: async (scheduledTime) => {
      const res = await api.patch(`/campaigns/${id}/schedule`, { scheduledTime });
      return res.data;
    },
    onSuccess: () => {
      setEditScheduleOpen(false);
      toast.add({
        title: "Schedule updated",
        description: "Campaign dispatch timer has been updated.",
        type: "success",
      });
      invalidateAll();
    },
    onError: (err) => {
      toast.add({
        title: err?.response?.data?.message || "Failed to reschedule campaign",
        type: "error",
      });
    },
  });

  // Launch now mutation
  const launchNowMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/campaigns/${id}/launch-now`);
      return res.data;
    },
    onSuccess: () => {
      toast.add({
        title: "Campaign launched",
        description: "Message dispatch is now active.",
        type: "success",
      });
      invalidateAll();
    },
    onError: (err) => {
      toast.add({
        title: err?.response?.data?.message || "Failed to launch campaign",
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
    if (newStatus === "failed") {
      setConfirmFailure(true);
      return;
    }
    updateStatusMutation.mutate(newStatus);
  };

  // Admin status choices tailored to current campaign state
  const statusOptions = useMemo(() => {
    // Only scheduled campaigns awaiting Super Admin review get the approval workflow
    if (isApprovalPending) {
      return [
        {
          value: "scheduled",
          label: "Approve Schedule",
          description: `Schedule for ${dateTime(campaign.scheduledTime)}`,
          dot: "bg-purple-500",
        },
        {
          value: "ongoing",
          label: "Launch Now",
          description: "Bypass schedule and start dispatch immediately",
          dot: "bg-blue-500",
        },
        {
          value: "failed",
          label: "Reject / Fail",
          description: "Reject campaign and refund 100% credits",
          dot: "bg-red-500",
        },
      ];
    }

    if (isScheduledCampaign && campaign.status === "scheduled") {
      return [
        {
          value: "ongoing",
          label: "Launch Now",
          description: "Trigger dispatch immediately",
          dot: "bg-blue-500",
        },
        {
          value: "paused",
          label: "Pause Schedule",
          description: "Temporarily pause execution",
          dot: "bg-amber-400",
        },
        {
          value: "failed",
          label: "Cancel & Fail",
          description: "Terminate campaign and refund remaining credits",
          dot: "bg-red-500",
        },
      ];
    }

    // Standard statuses for Send Now campaigns or general state management:
    // Pending, Ongoing, Completed, Paused, Stopped, Failed
    return [
      { value: "pending", label: "Pending", description: "Queued for processing", dot: "bg-amber-500" },
      { value: "ongoing", label: "Ongoing", description: "Currently active & dispatching", dot: "bg-blue-500" },
      { value: "completed", label: "Completed", description: "All messages finished", dot: "bg-emerald-500" },
      { value: "paused", label: "Paused", description: "Temporarily pause execution", dot: "bg-amber-400" },
      { value: "stopped", label: "Stopped", description: "Terminated / cancelled", dot: "bg-stone-500" },
      { value: "failed", label: "Failed", description: "Mark campaign as failed and refund", dot: "bg-red-500" },
    ];
  }, [campaign.status, isApprovalPending, isScheduledCampaign, campaign.scheduledTime]);

  const isUpdating = updateStatusMutation.isPending || launchNowMutation.isPending || cancelMutation.isPending;
  const isPendingOrScheduled = ["pending", "scheduled"].includes(campaign.status);

  return (
    <header data-tour="campaign-header" className="campaign-detail-heading">
      {/* Back button */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to={`${base}/campaigns`} />}
          className="campaign-detail-back gap-1.5 text-xs text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to campaigns
        </Button>
      </div>

      <div className="campaign-detail-heading-layout">
        {/* Title & Metadata */}
        <div className="campaign-detail-heading-copy">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {campaign.campaignTitle}
            </h1>
          <div className="campaign-detail-reference"><span>Campaign ID</span><CampaignReference campaign={campaign} /><SupportHelpButton campaign={campaign} area="this campaign" inline label="Get help" /></div>
          <div className="campaign-detail-metadata text-xs text-muted-foreground">
            <span className="campaign-detail-owner"><UserAvatar user={campaign.userId} className="size-7" /><span>{ownerName(campaign.userId)}</span></span>
            <span className="campaign-detail-date"><CalendarDays aria-hidden="true" /><span>Submitted {dateTime(campaign.createdAt)}</span></span>
            {campaign.scheduledTime && (
              <span className="campaign-detail-date font-medium text-purple-700 dark:text-purple-300">
                <CalendarDays className="size-3.5" />
                Scheduled for {dateTime(campaign.scheduledTime)}
              </span>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Creator / Admin Action: Launch Now */}
          {canManageCampaign && ((campaign.status === "scheduled") || (isAdmin && isApprovalPending)) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => launchNowMutation.mutate()}
              disabled={isUpdating}
              className="h-8 gap-1.5 text-xs font-medium border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-700 dark:text-blue-300"
            >
              {launchNowMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              <span>Launch Now</span>
            </Button>
          )}

          {/* Creator / Admin Action: Edit Schedule */}
          {canManageCampaign && isScheduledCampaign && isPendingOrScheduled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditScheduleOpen(true)}
              disabled={isUpdating}
              className="h-8 gap-1.5 text-xs font-medium"
            >
              <CalendarClock className="size-3.5" />
              <span>Edit Schedule</span>
            </Button>
          )}

          {/* Creator / Admin Action: Cancel Campaign with 100% Refund */}
          {canManageCampaign && isPendingOrScheduled && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmCancelOpen(true)}
              disabled={isUpdating}
              className="h-8 gap-1.5 text-xs font-medium border-rose-300 text-rose-700 hover:bg-rose-50 hover:text-rose-800 dark:border-rose-800 dark:text-rose-300"
            >
              <XCircle className="size-3.5" />
              <span>Cancel Campaign</span>
            </Button>
          )}

          {/* Admin Status Dropdown */}
          {isAdmin ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isUpdating}
                      aria-label={`Change campaign status, current status: ${displayStatusLabel}`}
                      className={`h-8 gap-1.5 text-xs font-medium border shadow-none transition-colors ${
                        isApprovalPending
                          ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100/80 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                          : STATUS_BUTTON_STYLES[campaign.status] || "border-border bg-background text-foreground hover:bg-muted"
                      }`}
                    >
                      {updateStatusMutation.isPending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <SlidersHorizontal className="size-3.5 opacity-80" />
                      )}
                      <span>{displayStatusLabel}</span>
                      <ChevronDown className="size-3 opacity-70" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-64 p-1.5 shadow-lg border border-border">
                  <DropdownMenuLabel className="px-2 py-1 text-xs font-semibold text-foreground">
                    {isApprovalPending ? "Approve or Reject Campaign" : "Update Campaign Status"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {statusOptions.map((opt) => {
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
            </>
          ) : (
            <>
              <span
                className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium border shadow-none ${
                  isApprovalPending
                    ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    : STATUS_BUTTON_STYLES[campaign.status] || "border-border bg-background text-foreground"
                }`}
              >
                <span
                  className={`size-2 rounded-full ${
                    isApprovalPending ? "bg-amber-500" : (STATUS_OPTIONS.find((o) => o.value === campaign.status)?.dot || "bg-stone-500")
                  }`}
                />
                <span>{displayStatusLabel}</span>
              </span>

              {(campaign.publishedSpreadsheet?.publishedAt || campaign.recipientReport?.uploadedAt) && (
                <Button
                  nativeButton={false}
                  render={<Link to={`${base}/campaigns/${id}/report`} />}
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                >
                  <FileText className="size-3.5" />
                  View report
                </Button>
              )}
            </>
          )}

          {/* Delete Campaign Button */}
          {canManageCampaign && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={isUpdating || deleteCampaignMutation.isPending}
            className="h-8 gap-1.5 text-xs font-medium text-destructive border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900/60 dark:hover:bg-red-950/40"
          >
            <Trash2 className="size-3.5" />
            <span>Delete</span>
          </Button>
          )}
        </div>
      </div>

      {/* Super Admin Mark as Failed / Reject Dialog */}
      <Dialog open={isAdmin && confirmFailure} onOpenChange={(open) => !isUpdating && setConfirmFailure(open)}>
        <DialogContent className="gap-5 rounded-2xl p-5 sm:max-w-sm">
          <DialogHeader className="gap-1.5 pr-6">
            <DialogTitle>Mark campaign as failed?</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              This will reject/fail the campaign and return 100% of remaining deducted credits ({number(remainingRefund)} credits) to the creator's wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
            <dl className="space-y-2 tabular-nums">
              <div className="flex justify-between gap-3">
                <dt>Original charge</dt>
                <dd>{number(campaign.creditsDeducted || 0)} credits</dd>
              </div>
              {settledRefund > 0 && (
                <div className="flex justify-between gap-3">
                  <dt>Already returned</dt>
                  <dd>{number(settledRefund)} credits</dd>
                </div>
              )}
              <div className="flex justify-between gap-3 font-semibold border-t border-amber-200 pt-1.5 dark:border-amber-800">
                <dt>Refund on rejection</dt>
                <dd>{number(remainingRefund)} credits</dd>
              </div>
            </dl>
          </div>
          <DialogFooter className="m-0 flex-row justify-end rounded-none border-0 bg-transparent p-0">
            <Button type="button" variant="ghost" size="sm" disabled={isUpdating} onClick={() => setConfirmFailure(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isUpdating}
              onClick={() => updateStatusMutation.mutate("failed")}
            >
              {updateStatusMutation.isPending && <Loader2 className="size-3.5 animate-spin mr-1" />}
              Reject &amp; Refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Creator Cancel Scheduled Campaign Dialog */}
      <Dialog open={canManageCampaign && confirmCancelOpen} onOpenChange={(open) => !isUpdating && setConfirmCancelOpen(open)}>
        <DialogContent className="gap-5 rounded-2xl p-5 sm:max-w-sm">
          <DialogHeader className="gap-1.5 pr-6">
            <DialogTitle>Cancel campaign?</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              Cancelling will abort this campaign before dispatch. The remaining {number(remainingRefund)} reserved credits will be returned to {isAdmin ? "the creator's" : "your"} wallet immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
            <div className="flex justify-between items-center tabular-nums">
              <span className="font-medium">Credits to be refunded:</span>
              <span className="text-sm font-semibold">{number(remainingRefund)} credits</span>
            </div>
          </div>
          <DialogFooter className="m-0 flex-row justify-end rounded-none border-0 bg-transparent p-0">
            <Button type="button" variant="ghost" size="sm" disabled={cancelMutation.isPending} onClick={() => setConfirmCancelOpen(false)}>
              Keep Campaign
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending && <Loader2 className="size-3.5 animate-spin mr-1" />}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Warning Dialog */}
      <CampaignDeleteDialog campaign={campaign} mutation={deleteCampaignMutation} open={canManageCampaign && confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} />

      {/* Edit Schedule Dialog */}
      <Dialog open={canManageCampaign && editScheduleOpen} onOpenChange={setEditScheduleOpen}>
        <DialogContent className="gap-5 rounded-2xl p-5 sm:max-w-sm">
          <DialogHeader className="gap-1.5 pr-6">
            <DialogTitle>Edit scheduled dispatch time</DialogTitle>
            <DialogDescription className="text-xs leading-5">
              Select a new date and time for this campaign to automatically start sending.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="newScheduleInput" className="text-xs font-medium text-foreground">
              New date &amp; time:
            </label>
            <Input
              id="newScheduleInput"
              type="datetime-local"
              value={newScheduledTime}
              min={new Date().toISOString().slice(0, 16)}
              onChange={(e) => setNewScheduledTime(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <DialogFooter className="m-0 flex-row justify-end rounded-none border-0 bg-transparent p-0">
            <Button type="button" variant="ghost" size="sm" disabled={rescheduleMutation.isPending} onClick={() => setEditScheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={rescheduleMutation.isPending || !newScheduledTime}
              onClick={() => rescheduleMutation.mutate(new Date(newScheduledTime).toISOString())}
            >
              {rescheduleMutation.isPending && <Loader2 className="size-3.5 animate-spin mr-1" />}
              Save Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
