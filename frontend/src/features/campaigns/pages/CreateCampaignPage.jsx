import { useState, useMemo, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Send,
  Calendar,
  Clock,
  Users,
  Coins,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Upload,
  FileText,
  Lock,
  Sparkles,
  X,
  HelpCircle,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import apiClient from "@/api/client";
import { number } from "@/features/admin/lib/format";

export default function CreateCampaignPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef(null);

  // Determine base path (e.g. /reseller or /admin)
  const isReseller = location.pathname.startsWith("/reseller");
  const parentCampaignsPath = isReseller ? "/reseller/campaigns" : "/admin/campaigns";

  // Form states
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [rawRecipients, setRawRecipients] = useState("");
  const [scheduleType, setScheduleType] = useState("now"); // "now" | "later"
  const [scheduledTime, setScheduledTime] = useState("");
  const [formError, setFormError] = useState("");

  // Fetch current user wallet balance
  const balanceQuery = useQuery({
    queryKey: ["myWalletBalance"],
    queryFn: async () => {
      const res = await apiClient.get("/credits/balance");
      return res.data;
    },
  });

  const wallet = balanceQuery.data?.wallet || {};
  const currentBalance = wallet.balance || 0;
  const isLocked = wallet.isLocked || false;

  // Real-time phone numbers parsing and sanitization
  const { validRecipients, duplicatesCount, invalidCount } = useMemo(() => {
    if (!rawRecipients.trim()) {
      return { validRecipients: [], duplicatesCount: 0, invalidCount: 0 };
    }

    const tokens = rawRecipients
      .split(/[\n,;\t]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const seen = new Set();
    const valid = [];
    let duplicates = 0;
    let invalid = 0;

    for (const token of tokens) {
      const cleaned = token.replace(/\D/g, "");
      if (cleaned.length < 8 || cleaned.length > 15) {
        invalid++;
      } else if (seen.has(cleaned)) {
        duplicates++;
      } else {
        seen.add(cleaned);
        valid.push(cleaned);
      }
    }

    return { validRecipients: valid, duplicatesCount: duplicates, invalidCount: invalid };
  }, [rawRecipients]);

  const totalRecipients = validRecipients.length;
  const estimatedCost = totalRecipients; // 1 credit per contact
  const remainingBalance = currentBalance - estimatedCost;
  const hasInsufficientCredits = !isLocked && currentBalance < estimatedCost && totalRecipients > 0;

  // Handle CSV/TXT file upload
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") {
        setRawRecipients((prev) => {
          const combined = prev ? `${prev}\n${content}` : content;
          return combined;
        });
        toast.add({
          title: "Numbers Imported",
          description: `Imported file: ${file.name}`,
          type: "success",
        });
      }
    };
    reader.readAsText(file);
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Insert variable into message body
  const insertVariable = (tag) => {
    setMessageBody((prev) => `${prev} {{${tag}}}`);
  };

  // Create Campaign Mutation
  const createCampaignMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiClient.post("/campaigns", payload);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(["campaigns"]);
      queryClient.invalidateQueries(["reseller"]);
      queryClient.invalidateQueries(["admin"]);
      queryClient.invalidateQueries(["myWalletBalance"]);

      toast.add({
        title: "Campaign Created Successfully!",
        description: data.message || `Campaign '${campaignTitle}' has been queued for execution.`,
        type: "success",
      });

      navigate(parentCampaignsPath);
    },
    onError: (err) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to launch campaign. Please verify your inputs.";
      setFormError(msg);
      toast.add({
        title: "Campaign Submission Failed",
        description: msg,
        type: "error",
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError("");

    if (isLocked) {
      setFormError("Your credit balance is expired and locked. Please contact your administrator.");
      return;
    }
    if (!campaignTitle.trim()) {
      setFormError("Please provide a campaign title.");
      return;
    }
    if (!campaignDescription.trim()) {
      setFormError("Please provide a brief campaign description.");
      return;
    }
    if (!messageBody.trim()) {
      setFormError("Please compose the message body to be sent.");
      return;
    }
    if (totalRecipients === 0) {
      setFormError("Please provide at least one valid recipient phone number.");
      return;
    }
    if (hasInsufficientCredits) {
      setFormError(`Insufficient credits. You need ${estimatedCost} credits but currently hold ${currentBalance}.`);
      return;
    }
    if (scheduleType === "later" && !scheduledTime) {
      setFormError("Please select a valid scheduled date and time.");
      return;
    }

    const payload = {
      campaignTitle: campaignTitle.trim(),
      campaignDescription: campaignDescription.trim(),
      messageBody: messageBody.trim(),
      recipients: validRecipients,
      schedule: scheduleType,
      scheduledTime: scheduleType === "later" ? new Date(scheduledTime).toISOString() : undefined,
    };

    createCampaignMutation.mutate(payload);
  };

  return (
    <div className="space-y-6 pb-12 max-w-7xl mx-auto">
      {/* Top Header with Breadcrumbs and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <Link to={parentCampaignsPath} className="hover:text-foreground transition-colors">
              Campaigns
            </Link>
            <span>/</span>
            <span className="text-foreground font-semibold">New Campaign</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Create Campaign
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure your message, upload target audience, and dispatch your WhatsApp broadcast.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(parentCampaignsPath)}
            disabled={createCampaignMutation.isPending}
          >
            <ArrowLeft className="size-4 mr-1.5" />
            Back to Campaigns
          </Button>

          <Button
            type="button"
            onClick={handleSubmit}
            disabled={createCampaignMutation.isPending || isLocked || hasInsufficientCredits}
            className="font-semibold shadow-xs"
          >
            {createCampaignMutation.isPending ? (
              <Loader2 className="size-4 mr-2 animate-spin" />
            ) : (
              <Send className="size-4 mr-2" />
            )}
            {scheduleType === "later" ? "Schedule Campaign" : "Launch Campaign"}
          </Button>
        </div>
      </div>

      {formError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Unable to submit campaign</p>
            <p className="text-xs">{formError}</p>
          </div>
        </div>
      )}

      {isLocked && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-900 dark:text-red-200 text-sm font-medium border border-red-300 dark:border-red-900">
          <Lock className="size-5 shrink-0 text-red-600" />
          <div>
            <p className="font-semibold">Credit Wallet Locked & Expired</p>
            <p className="text-xs text-red-700 dark:text-red-300">
              Your credit allocation has expired. Creating campaigns is disabled until renewed by Super Admin.
            </p>
          </div>
        </div>
      )}

      {/* Main 2-Column Responsive Workspace */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Form Fields (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Card 1: Campaign Details */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="size-4.5 text-primary" />
                Campaign Details
              </CardTitle>
              <CardDescription className="text-xs">
                Provide an internal name and description to track this broadcast.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs font-semibold">
                  Campaign Title <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. Diwali Fest Special Offer 2026"
                  value={campaignTitle}
                  onChange={(e) => setCampaignTitle(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-semibold">
                  Description / Purpose <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="description"
                  placeholder="e.g. 20% flat discount promotion blast to customer contacts"
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Message Content */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Sparkles className="size-4.5 text-primary" />
                    Message Composer
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Draft your WhatsApp message text with formatting and personalization tags.
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs tabular-nums">
                  {messageBody.length} chars
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-center gap-2 flex-wrap pb-1">
                <span className="text-xs font-medium text-muted-foreground mr-1">Insert Tags:</span>
                <button
                  type="button"
                  onClick={() => insertVariable("name")}
                  className="px-2.5 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 text-foreground font-mono transition-colors"
                >
                  &#123;&#123;name&#125;&#125;
                </button>
                <button
                  type="button"
                  onClick={() => insertVariable("phone")}
                  className="px-2.5 py-1 text-xs rounded-md bg-muted hover:bg-muted/80 text-foreground font-mono transition-colors"
                >
                  &#123;&#123;phone&#125;&#125;
                </button>
              </div>

              <Textarea
                id="message"
                rows={6}
                value={messageBody}
                onChange={(e) => setMessageBody(e.target.value)}
                placeholder="Hello {{name}}, we are thrilled to bring you our exclusive festival discounts! Visit our store or reply to claim your coupon code today."
                className="text-sm resize-y leading-relaxed"
                required
              />

              <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">WhatsApp formatting guide:</p>
                <div className="flex items-center gap-4 flex-wrap">
                  <span>*bold* &rarr; <b>bold</b></span>
                  <span>_italic_ &rarr; <i>italic</i></span>
                  <span>~strike~ &rarr; <del>strike</del></span>
                  <span>```mono``` &rarr; <code className="text-[10px]">mono</code></span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 3: Audience & Recipients */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <Users className="size-4.5 text-primary" />
                    Target Audience
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Paste recipient numbers or upload a contact file.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="file-upload"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="h-8 text-xs gap-1.5"
                  >
                    <Upload className="size-3.5" />
                    Upload CSV / TXT
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="recipients" className="text-xs font-semibold">
                    Phone Numbers <span className="text-destructive">*</span>
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    Separated by newline, comma, or space
                  </span>
                </div>

                <Textarea
                  id="recipients"
                  rows={5}
                  value={rawRecipients}
                  onChange={(e) => setRawRecipients(e.target.value)}
                  placeholder="Paste numbers with country code:&#10;919876543210&#10;919876543211&#10;919876543212"
                  className="text-xs font-mono resize-y"
                  required
                />
              </div>

              {/* Recipient breakdown chips */}
              <div className="flex items-center gap-2 flex-wrap pt-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="size-3.5" />
                  {totalRecipients} Valid Contacts
                </span>

                {duplicatesCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 text-xs font-medium border border-amber-200 dark:border-amber-800">
                    <AlertTriangle className="size-3.5" />
                    {duplicatesCount} Duplicates Skipped
                  </span>
                )}

                {invalidCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 text-xs font-medium border border-red-200 dark:border-red-800">
                    <X className="size-3.5" />
                    {invalidCount} Invalid Skipped
                  </span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 4: Execution Timing */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Clock className="size-4.5 text-primary" />
                Execution Timing
              </CardTitle>
              <CardDescription className="text-xs">
                Choose when the message queue should begin delivery.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setScheduleType("now")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                    scheduleType === "now"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card hover:bg-muted/30"
                  }`}
                >
                  <div
                    className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                      scheduleType === "now" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Send className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Send Immediately</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Messages are queued and dispatched right away.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setScheduleType("later")}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border text-left cursor-pointer transition-all ${
                    scheduleType === "later"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border bg-card hover:bg-muted/30"
                  }`}
                >
                  <div
                    className={`grid size-8 shrink-0 place-items-center rounded-lg ${
                      scheduleType === "later" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Calendar className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Schedule for Later</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Set a future date and time to trigger dispatch.
                    </p>
                  </div>
                </button>
              </div>

              {scheduleType === "later" && (
                <div className="space-y-1.5 pt-2 border-t">
                  <Label htmlFor="scheduledTime" className="text-xs font-semibold">
                    Scheduled Date & Time <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="scheduledTime"
                    type="datetime-local"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="text-sm max-w-sm"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Operating window rules configured in settings will be respected during execution.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Credits & Execution Summary (4 cols) */}
        <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-4">
          {/* Credits Summary Card */}
          <Card className="rounded-xl border shadow-xs">
            <CardHeader className="border-b pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Coins className="size-4.5 text-primary" />
                Credits & Execution Summary
              </CardTitle>
              <CardDescription className="text-xs">
                Live cost calculation based on validated contacts.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Target Recipients</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {number(totalRecipients)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Rate per Message</span>
                <span className="font-semibold tabular-nums text-foreground">1 Credit</span>
              </div>

              <div className="border-t pt-3 flex items-center justify-between">
                <span className="font-semibold text-foreground">Total Required Credits</span>
                <span className={`font-bold tabular-nums text-base ${hasInsufficientCredits ? "text-destructive" : "text-primary"}`}>
                  {number(estimatedCost)} Credits
                </span>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-muted-foreground">Available Wallet Balance</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {number(currentBalance)} Credits
                </span>
              </div>

              <div className="flex items-center justify-between text-xs border-t pt-2">
                <span className="text-muted-foreground">Balance After Launch</span>
                <span
                  className={`font-semibold tabular-nums ${
                    remainingBalance < 0 ? "text-destructive" : "text-emerald-600"
                  }`}
                >
                  {number(remainingBalance)} Credits
                </span>
              </div>

              {hasInsufficientCredits && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold border border-destructive/20 mt-2">
                  Insufficient balance! You need {number(estimatedCost - currentBalance)} more credits to dispatch this campaign.
                </div>
              )}
            </CardContent>

            <CardFooter className="border-t pt-4 flex flex-col gap-2">
              <Button
                type="submit"
                disabled={createCampaignMutation.isPending || isLocked || hasInsufficientCredits}
                className="w-full font-semibold h-10 shadow-xs"
              >
                {createCampaignMutation.isPending ? (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                ) : (
                  <Send className="size-4 mr-2" />
                )}
                {scheduleType === "later" ? "Schedule Campaign" : "Launch Campaign"}
              </Button>

              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(parentCampaignsPath)}
                className="w-full text-xs text-muted-foreground"
              >
                Cancel and Return
              </Button>
            </CardFooter>
          </Card>
        </div>
      </form>
    </div>
  );
}

