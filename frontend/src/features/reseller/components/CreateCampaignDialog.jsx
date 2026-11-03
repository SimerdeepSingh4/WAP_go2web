import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Calendar,
  Users,
  Coins,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import apiClient from "@/api/client";
import { useResellerQuery } from "../hooks/useReseller";
import { number } from "@/features/admin/lib/format";

export default function CreateCampaignDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const myBalance = useResellerQuery("myBalance");
  const wallet = myBalance.data?.wallet || {};
  const currentBalance = wallet.balance || 0;
  const isLocked = wallet.isLocked || false;

  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [rawRecipients, setRawRecipients] = useState("");
  const [scheduleType, setScheduleType] = useState("now"); // "now" | "later"
  const [scheduledTime, setScheduledTime] = useState("");
  const [formError, setFormError] = useState("");

  // Extract phone numbers from raw text
  const parseRecipients = () => {
    if (!rawRecipients.trim()) return [];
    return rawRecipients
      .split(/[\n,;\t]+/)
      .map((item) => item.replace(/\D/g, "").trim())
      .filter((item) => item.length >= 8); // At least 8 digits for valid phone
  };

  const recipientList = parseRecipients();
  const totalRecipients = recipientList.length;
  const estimatedCredits = totalRecipients; // 1 credit per recipient
  const hasInsufficientCredits = !isLocked && currentBalance < estimatedCredits && totalRecipients > 0;

  const createCampaignMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await apiClient.post("/campaigns", payload);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(["reseller"]);
      queryClient.invalidateQueries(["campaigns"]);
      toast.add({
        title: "Campaign Launched!",
        description: data.message || `Campaign '${campaignTitle}' submitted successfully.`,
        type: "success",
      });
      // Reset form
      setCampaignTitle("");
      setCampaignDescription("");
      setMessageBody("");
      setRawRecipients("");
      setScheduleType("now");
      setScheduledTime("");
      setFormError("");
      onOpenChange(false);
    },
    onError: (err) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to create campaign. Please check inputs.";
      setFormError(msg);
      toast.add({
        title: "Failed to Create Campaign",
        description: msg,
        type: "error",
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError("");

    if (isLocked) {
      setFormError("Your credit wallet is locked. Please contact Super Admin to unlock or renew credits.");
      return;
    }

    if (!campaignTitle.trim()) {
      setFormError("Please enter a campaign title.");
      return;
    }
    if (!campaignDescription.trim()) {
      setFormError("Please enter a short description.");
      return;
    }
    if (!messageBody.trim()) {
      setFormError("Please provide the message text to be delivered.");
      return;
    }
    if (recipientList.length === 0) {
      setFormError("Please enter at least one recipient phone number.");
      return;
    }
    if (currentBalance < estimatedCredits) {
      setFormError(`Insufficient credits. You need ${estimatedCredits} credits but currently have ${currentBalance}.`);
      return;
    }
    if (scheduleType === "later" && !scheduledTime) {
      setFormError("Please choose a future date and time for scheduled execution.");
      return;
    }

    const payload = {
      campaignTitle: campaignTitle.trim(),
      campaignDescription: campaignDescription.trim(),
      messageBody: messageBody.trim(),
      recipients: recipientList,
      schedule: scheduleType,
      scheduledTime: scheduleType === "later" ? new Date(scheduledTime).toISOString() : undefined,
    };

    createCampaignMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto p-5">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Send className="size-4.5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Create Campaign</DialogTitle>
              <DialogDescription className="text-xs">
                Draft and dispatch a new WhatsApp broadcast campaign.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {formError && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20 font-medium">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {isLocked && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-100 text-red-800 text-xs font-semibold border border-red-300">
              <Lock className="size-4 shrink-0" />
              <span>Credits are expired and locked. Campaign dispatch is currently paused.</span>
            </div>
          )}

          {/* Title & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="camp-title" className="text-xs font-semibold">
                Campaign Title *
              </Label>
              <Input
                id="camp-title"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder="e.g. Diwali Fest Promotion"
                className="text-sm"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="camp-desc" className="text-xs font-semibold">
                Campaign Description *
              </Label>
              <Input
                id="camp-desc"
                value={campaignDescription}
                onChange={(e) => setCampaignDescription(e.target.value)}
                placeholder="e.g. Festival discounts blast"
                className="text-sm"
                required
              />
            </div>
          </div>

          {/* Message Content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="camp-msg" className="text-xs font-semibold">
                Message Content *
              </Label>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {messageBody.length} characters
              </span>
            </div>
            <Textarea
              id="camp-msg"
              rows={4}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder="Type your WhatsApp broadcast message here..."
              className="text-sm resize-y"
              required
            />
          </div>

          {/* Recipients Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="camp-recipients" className="text-xs font-semibold">
                Recipients (Phone Numbers) *
              </Label>
              <span className="text-[11px] font-medium text-primary flex items-center gap-1">
                <Users className="size-3" />
                {totalRecipients} {totalRecipients === 1 ? "contact" : "contacts"} detected
              </span>
            </div>
            <Textarea
              id="camp-recipients"
              rows={4}
              value={rawRecipients}
              onChange={(e) => setRawRecipients(e.target.value)}
              placeholder="Paste numbers separated by comma, line break, or spaces&#10;e.g.&#10;919876543210&#10;919876543211"
              className="text-xs font-mono resize-y"
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Supports international format with country code (e.g. 91 for India). Duplicates are sanitized automatically.
            </p>
          </div>

          {/* Schedule Options */}
          <div className="space-y-2 border-t pt-3">
            <Label className="text-xs font-semibold">Execution Timing</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScheduleType("now")}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                  scheduleType === "now"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <Clock className="size-3.5" />
                Send Immediately
              </button>
              <button
                type="button"
                onClick={() => setScheduleType("later")}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                  scheduleType === "later"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <Calendar className="size-3.5" />
                Schedule for Later
              </button>
            </div>

            {scheduleType === "later" && (
              <div className="space-y-1.5 pt-1">
                <Label htmlFor="camp-schedule-time" className="text-xs font-semibold">
                  Scheduled Date & Time
                </Label>
                <Input
                  id="camp-schedule-time"
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>
            )}
          </div>

          {/* Credits Summary Banner */}
          <div className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
            hasInsufficientCredits ? "bg-red-50 border-red-200 text-red-700" : "bg-muted/40 border-border"
          }`}>
            <div className="flex items-center gap-2">
              <Coins className="size-4 text-primary" />
              <div>
                <span className="font-semibold text-foreground">Available Credits: </span>
                <span className="font-bold tabular-nums text-foreground">{number(currentBalance)}</span>
              </div>
            </div>
            <div>
              <span className="font-semibold text-foreground">Est. Cost: </span>
              <span className={`font-bold tabular-nums ${hasInsufficientCredits ? "text-destructive" : "text-primary"}`}>
                {number(estimatedCredits)} credits
              </span>
            </div>
          </div>

          <DialogFooter className="border-t pt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={createCampaignMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={createCampaignMutation.isPending || isLocked || hasInsufficientCredits}
              className="font-semibold"
            >
              {createCampaignMutation.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {scheduleType === "later" ? "Schedule Campaign" : "Launch Campaign"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
