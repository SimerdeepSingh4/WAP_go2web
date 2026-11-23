import useRecipientTracking from "../hooks/useRecipientTracking";
import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, Navigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isValidPhoneNumber } from "libphonenumber-js/max";
import { AlertTriangle, Lock, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import apiClient from "@/api/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { QueryState } from "@/features/dashboard/components/shared";
import { campaignEstimate, parseRecipients, splitRecipientInput } from "../lib/submission";

import CreateCampaignHeader from "../components/create/CreateCampaignHeader";
import CampaignDetailsSection from "../components/create/CampaignDetailsSection";
import CampaignMessageEditor, { CHARACTER_LIMIT } from "../components/create/CampaignMessageEditor";
import CampaignWhatsAppPreview from "../components/create/CampaignWhatsAppPreview";
import CampaignCtaFields from "../components/create/CampaignCtaFields";
import CampaignMediaUploader from "../components/create/CampaignMediaUploader";
import { mediaKindsForLimits, MB, formatFileSize } from "../lib/mediaKinds";
import useMediaUploadLimits from "../hooks/useMediaUploadLimits";
import CampaignRecipientsInput from "../components/create/CampaignRecipientsInput";
import CampaignCostSummary from "../components/create/CampaignCostSummary";
import CampaignReviewDialog from "../components/create/CampaignReviewDialog";
import { readCampaignDraft, removeCampaignDraft, writeCampaignDraft } from "../lib/draftStorage";
import { MAX_CAMPAIGN_MEDIA, SINGLE_MEDIA_MESSAGE } from "../../../../../shared/campaignMedia.js";
import { campaignLinkError, campaignNumberError, CTA_LABEL_LIMIT, DEFAULT_CALL_LABEL, DEFAULT_LINK_LABEL } from "../../../../../shared/campaignCta.js";
import "../components/create/create-campaign.css";

function htmlToText(html) {
  return String(html || "")
    .replace(/<\/(p|div|li|h\d|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default function CreateCampaignPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const uploadLimits = useMediaUploadLimits();
  const mediaKinds = mediaKindsForLimits(uploadLimits.effective);
  const queryClient = useQueryClient();

  const [reviewPayload, setReviewPayload] = useState(null);
  const submitting = useRef(false);
  const finished = useRef(false);
  const fileInputRef = useRef(null);
  const errorRef = useRef(null);

  const base = user?.role === "Super Admin" ? "/admin" : user?.role === "Reseller" ? "/reseller" : "/user";
  const parentCampaignsPath = `${base}/campaigns`;
  const isAdmin = user?.role === "Super Admin";
  const canAddCampaignNumber = isAdmin || user?.featureAccess?.campaignNumber === true;
  const canAddCampaignLink = isAdmin || user?.featureAccess?.campaignLink === true;
  const canShareProfileDp = isAdmin || user?.featureAccess?.campaignDp === true;
  const accountId = user?.id || user?._id;
  const draftKey = accountId ? `campaign-create:${user?.role}:${accountId}` : null;

  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignLink, setCampaignLink] = useState("");
  const [campaignLinkName, setCampaignLinkName] = useState(DEFAULT_LINK_LABEL);
  const [campaignNumber, setCampaignNumber] = useState("");
  const [campaignNumberName, setCampaignNumberName] = useState(DEFAULT_CALL_LABEL);
  const [shareProfileDp, setShareProfileDp] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const recipientTracking = useRecipientTracking();
  const { rawRecipients, change: setRawRecipients, audit: recipientAudit, restore: restoreRecipients } = recipientTracking;
  const [scheduleType, setScheduleType] = useState("now"); // "now" | "later"
  const [scheduledTime, setScheduledTime] = useState("");
  const [formError, setFormError] = useState("");
  const [validateRecipients, setValidateRecipients] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [draftReady, setDraftReady] = useState(() => !draftKey);
  const draftSaveTimer = useRef(null);

  // One uploaded attachment; profile photo sharing is independent.
  const [media, setMedia] = useState({ image: null, video: null, pdf: null });

  useEffect(() => {
    let active = true;
    if (!draftKey) {
      return () => { active = false; };
    }

    readCampaignDraft(draftKey).then((draft) => {
      if (!active) return;
      if (draft) {
        setCampaignTitle(draft.campaignTitle || "");
        setCampaignLink(draft.campaignLink || "");
        setCampaignLinkName(draft.ctaLabelsVersion === 1 ? draft.campaignLinkName ?? DEFAULT_LINK_LABEL : draft.campaignLinkName || DEFAULT_LINK_LABEL);
        setCampaignNumber(draft.campaignNumber || "");
        setCampaignNumberName(draft.campaignNumberName ?? DEFAULT_CALL_LABEL);
        setShareProfileDp(draft.shareProfileDp === true);
        setMessageBody(draft.messageBody || "");
        restoreRecipients(draft.rawRecipients || "", draft.recipientTracking);
        setScheduleType(draft.scheduleType || "now");
        setScheduledTime(draft.scheduledTime || "");
        const restoredMedia = { image: null, video: null, pdf: null };
        for (const kind of Object.keys(restoredMedia)) {
          const file = draft.media?.[kind];
          if (file) {
            restoredMedia[kind] = {
              file,
              name: file.name,
              size: file.size,
              preview: kind === "pdf" ? null : URL.createObjectURL(file),
            };
          }
        }
        setMedia(restoredMedia);
        toast.add({ title: "Unfinished campaign restored", description: "Your saved form is ready to continue.", type: "info" });
      }
      setDraftReady(true);
    }).catch(() => {
      if (active) setDraftReady(true);
    });

    return () => { active = false; };
  }, [draftKey, restoreRecipients]);

  // Revoke object URLs when replaced or on unmount
  useEffect(() => () => { if (media.image?.preview) URL.revokeObjectURL(media.image.preview); }, [media.image]);
  useEffect(() => () => { if (media.video?.preview) URL.revokeObjectURL(media.video.preview); }, [media.video]);

  const balanceQuery = useQuery({
    queryKey: ["myWalletBalance", user?.id || user?._id],
    queryFn: async () => (await apiClient.get("/credits/balance")).data,
  });

  const dailyUsageQuery = useQuery({
    queryKey: ["campaignDailyUsage", user?.id || user?._id],
    queryFn: async () => (await apiClient.get("/campaigns/daily-usage")).data,
  });
  const dailyUsage = dailyUsageQuery.data;
  const isDailyLimitReached = !isAdmin && Boolean(dailyUsage && !dailyUsage.isUnlimited && dailyUsage.remainingToday <= 0);

  const wallet = balanceQuery.data?.wallet || {};
  const currentBalance = wallet.creditBalances?.CAMPAIGN?.available ?? 0;
  const isLocked = !isAdmin && Boolean(wallet.isLocked);

  const messageText = useMemo(() => htmlToText(messageBody), [messageBody]);
  const charCount = messageText.length;
  const isOverCharacterLimit = charCount > CHARACTER_LIMIT;

  const { validRecipients, duplicatesCount, invalidCount, invalidEntries, enteredCount } = useMemo(() => parseRecipients(rawRecipients), [rawRecipients]);
  const totalRecipients = enteredCount;
  const estimate = campaignEstimate({ role: user?.role, recipients: totalRecipients, availableCredits: currentBalance });
  const estimatedCost = estimate.cost;
  const remainingBalance = estimate.remaining;
  const hasInsufficientCredits = estimate.insufficient;
  const totalMediaCount = Object.values(media).filter(Boolean).length;
  const hasSharedProfileDp = canShareProfileDp && shareProfileDp;
  const linkError = canAddCampaignLink ? campaignLinkError(campaignLink) : "";
  const phoneError = canAddCampaignNumber ? campaignNumberError(campaignNumber, isValidPhoneNumber) : "";

  const scheduleValid =
    scheduleType === "now" ||
    (scheduledTime && Number.isFinite(new Date(scheduledTime).getTime()) && new Date(scheduledTime) > new Date());

  // What's still missing before "Review campaign" works
  const checks = [
    { ok: Boolean(campaignTitle.trim()), target: "create-details", label: "Campaign name" },
    { ok: (Boolean(messageText) || totalMediaCount > 0 || hasSharedProfileDp) && !isOverCharacterLimit, target: "create-message", label: "Message or attachment" },
    ...(totalMediaCount > MAX_CAMPAIGN_MEDIA ? [{ ok: false, target: "create-media", label: "Keep only one media attachment" }] : []),
    ...(linkError ? [{ ok: false, target: "create-message", label: "Valid website URL" }] : []),
    ...(phoneError ? [{ ok: false, target: "create-message", label: "Valid call button number" }] : []),
    { ok: validRecipients.length > 0 && invalidCount === 0, target: "create-recipients", label: "Valid recipient numbers" },
    { ok: Boolean(scheduleValid), target: "create-timing", label: scheduleType === "later" ? "Future schedule time" : "Delivery timing" },
    { ok: !hasInsufficientCredits && !isLocked, target: "create-summary", label: "Enough credits" },
    ...(!isAdmin && dailyUsage && !dailyUsage.isUnlimited ? [{ ok: !isDailyLimitReached, target: "campaign-form-alerts", label: "Daily campaign limit" }] : []),
  ];

  const isDirty = Boolean(campaignTitle || campaignLink || campaignLinkName !== DEFAULT_LINK_LABEL || campaignNumber || campaignNumberName !== DEFAULT_CALL_LABEL || shareProfileDp || messageText || rawRecipients.trim() || totalMediaCount || scheduleType !== "now" || scheduledTime);

  useEffect(() => {
    if (!draftReady || !draftKey) return undefined;
    window.clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = window.setTimeout(() => {
      if (!isDirty) {
        removeCampaignDraft(draftKey).catch(() => {});
        return;
      }
      writeCampaignDraft(draftKey, {
        ctaLabelsVersion: 1,
        campaignTitle,
        campaignLink,
        campaignLinkName,
        campaignNumber,
        campaignNumberName,
        shareProfileDp,
        messageBody,
        rawRecipients,
        recipientTracking: recipientTracking.tracking,
        scheduleType,
        scheduledTime,
        media: {
          image: media.image?.file || null,
          video: media.video?.file || null,
          pdf: media.pdf?.file || null,
        },
      }).catch(() => {});
    }, 300);
    return () => window.clearTimeout(draftSaveTimer.current);
  }, [draftReady, draftKey, isDirty, campaignTitle, campaignLink, campaignLinkName, campaignNumber, campaignNumberName, shareProfileDp, messageBody, rawRecipients, recipientTracking.tracking, scheduleType, scheduledTime, media]);

  // Warn before leaving with unsent work
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e) => {
      if (finished.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (formError) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [formError]);

  /* ---- Media ---- */
  const selectMedia = (kind, file) => {
    if (uploadLimits.isPending || uploadLimits.isError) {
      toast.add({ title: "Upload limits are unavailable", description: "Please refresh and try again.", type: "error" });
      return;
    }
    const cfg = mediaKinds[kind];
    if (!cfg.types.includes(file.type) && !(kind === "pdf" && /\.pdf$/i.test(file.name))) {
      toast.add({ title: `Unsupported ${cfg.label.toLowerCase()} type`, description: `Allowed: ${cfg.hint}.`, type: "error" });
      return;
    }
    if (file.size > cfg.max) {
      toast.add({
        title: `${cfg.label} exceeds ${cfg.max / MB} MB`,
        description: `"${file.name}" is ${formatFileSize(file.size)}.`,
        type: "error",
      });
      return;
    }
    const attachment = {
      file,
      name: file.name,
      size: file.size,
      preview: kind === "pdf" ? null : URL.createObjectURL(file),
    };
    setMedia({
      image: null, video: null, pdf: null,
      [kind]: {
        ...attachment,
      },
    });
  };
  const removeMedia = (kind) => setMedia((m) => ({ ...m, [kind]: null }));
  const toggleShareProfileDp = (checked) => {
    if (checked && !user?.dp_img) return;
    setShareProfileDp(checked);
  };

  /* ---- Recipients file ---- */
  const readRecipientsFile = (file) => {
    if (!file) return;
    if (!/\.(csv|txt)$/i.test(file.name)) {
      toast.add({ title: "Use a .csv or .txt file", type: "error" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === "string") {
        setValidateRecipients(true);
        if (!recipientTracking.appendFile(content)) {
          toast.add({ title: "File not added", description: "Use digits only and no more than 12 digits per line. Your existing numbers are unchanged.", type: "error" });
          return;
        }
        toast.add({ title: "Recipients file loaded", description: file.name, type: "success" });
      }
    };
    reader.onerror = () => toast.add({ title: "Couldn't read that file", type: "error" });
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const createCampaignMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await apiClient.post("/campaigns", payload, {
        headers: payload instanceof FormData ? { "Content-Type": "multipart/form-data" } : undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      finished.current = true;
      window.clearTimeout(draftSaveTimer.current);
      if (draftKey) removeCampaignDraft(draftKey).catch(() => {});
      for (const key of ["campaigns", "reseller", "admin", "user", "myWalletBalance", "campaignDailyUsage"]) queryClient.invalidateQueries({ queryKey: [key] });
      toast.add({
        title: "Campaign submitted",
        description: data.message || `Campaign '${campaignTitle}' has been submitted for review.`,
        type: "success",
      });
      navigate(parentCampaignsPath);
    },
    onSettled: () => {
      submitting.current = false;
    },
    onError: (err) => {
      const msg = err?.response?.data?.message || err?.message || "Unable to submit campaign. Please verify your inputs.";
      toast.add({ title: "Campaign submission failed", description: msg, type: "error" });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError("");
    setValidateRecipients(true);
    if (submitting.current || createCampaignMutation.isPending) return;
    if (isDailyLimitReached) {
      const msg = `Daily campaign limit reached (${dailyUsage?.dailyLimit} per day). You cannot create more campaigns today.`;
      setFormError(msg);
      toast.add({ title: "Daily limit reached", description: msg, type: "error" });
      return;
    }
    if (user?.isPreview) return setFormError("Exit account preview to submit a campaign.");
    if (totalMediaCount > MAX_CAMPAIGN_MEDIA) return setFormError(SINGLE_MEDIA_MESSAGE);
    if (canShareProfileDp && shareProfileDp && !user?.dp_img) return setFormError("Add a profile photo in Settings before sharing it.");
    if (Object.values(media).some(Boolean) && !uploadLimits.isSuccess) return setFormError("Load the upload limits before continuing.");
    for (const [kind, attachment] of Object.entries(media)) {
      if (attachment && attachment.size > mediaKinds[kind].max) return setFormError(`${mediaKinds[kind].label} exceeds your ${mediaKinds[kind].max / MB} MB limit. Choose a smaller file.`);
    }
    if (!isAdmin && !balanceQuery.isSuccess) return setFormError("Load your credit balance before continuing.");
    if (scheduleType === "later" && !(new Date(scheduledTime) > new Date())) return setFormError("Choose a future date and time.");
    if (linkError || phoneError) return setFormError(linkError || phoneError);
    if (canAddCampaignLink && campaignLink.trim()) {
      if (!campaignLinkName.trim() || campaignLinkName.trim().length > CTA_LABEL_LIMIT) return setFormError(`Enter a link button label with 1 to ${CTA_LABEL_LIMIT} characters.`);
    }
    if (canAddCampaignNumber && campaignNumber.trim()) {
      if (!campaignNumberName.trim() || campaignNumberName.trim().length > CTA_LABEL_LIMIT) return setFormError(`Enter a call button label with 1 to ${CTA_LABEL_LIMIT} characters.`);
    }
    if (isLocked) return setFormError("Your wallet is locked. Please contact your administrator.");
    if (!campaignTitle.trim()) return setFormError("Please provide a campaign title.");
    if (!messageText && totalMediaCount === 0 && !hasSharedProfileDp) return setFormError("Please provide message content or attach media (image, video, or PDF).");
    if (isOverCharacterLimit) return setFormError(`Message exceeds the maximum limit of ${CHARACTER_LIMIT} characters (currently ${charCount}). Please shorten it.`);
    if (/\{\{[\s\S]*?\}\}/.test(messageBody)) return setFormError("Dynamic variables like {{...}} are not allowed. Please enter static text only.");
    if (invalidCount > 0) return setFormError(`Correct ${invalidCount} invalid recipient ${invalidCount === 1 ? "line" : "lines"}. Every number must contain 10 to 12 digits and be on its own line.`);
    if (validRecipients.length === 0) return setFormError("Add at least one recipient number with 10 to 12 digits.");
    if (hasInsufficientCredits) return setFormError(`Insufficient Campaign Credits. You need ${estimatedCost} credits but currently hold ${currentBalance}.`);

    const formData = new FormData();
    formData.append("category", "CAMPAIGN");
    formData.append("campaignTitle", campaignTitle.trim());
    if (canAddCampaignLink && campaignLink.trim()) {
      formData.append("campaignLink", campaignLink.trim());
      if (campaignLinkName.trim()) {
        formData.append("campaignLinkName", campaignLinkName.trim());
      }
    }
    if (canAddCampaignNumber && campaignNumber.trim()) {
      formData.append("campaignNumber", campaignNumber.trim());
      formData.append("campaignNumberName", campaignNumberName.trim());
    }
    if (canShareProfileDp && shareProfileDp) formData.append("shareProfileDp", "true");
    formData.append("messageBody", messageBody.trim());
    formData.append("recipients", JSON.stringify(splitRecipientInput(rawRecipients)));
    formData.append("recipientInputAudit", JSON.stringify(recipientAudit));
    formData.append("schedule", scheduleType);
    if (scheduleType === "later" && scheduledTime) formData.append("scheduledTime", new Date(scheduledTime).toISOString());
    if (media.image) formData.append("images", media.image.file);
    if (media.video) formData.append("video", media.video.file);
    if (media.pdf) formData.append("documents", media.pdf.file);

    setReviewPayload(formData);
  };

  // Redirect only after all hooks have run
  if (isAdmin) return <Navigate to="/admin/campaigns" replace />;

  const submitDisabled =
    Boolean(linkError || phoneError) ||
    createCampaignMutation.isPending ||
    totalMediaCount > MAX_CAMPAIGN_MEDIA ||
    user?.isPreview ||
    (!isAdmin && !balanceQuery.isSuccess) ||
    isLocked ||
    hasInsufficientCredits ||
    isOverCharacterLimit ||
    isDailyLimitReached;

  return (
    <div data-tour-loading={!draftReady} className="campaign-editor campaign-compose mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5 pb-8">
      {!isAdmin && (balanceQuery.isLoading || balanceQuery.isError) && (
        <QueryState query={balanceQuery}>
          <span className="sr-only">Credit balance loaded</span>
        </QueryState>
      )}
      {user?.isPreview && <p className="dashboard-note">Campaign submission is unavailable during account preview.</p>}

      {/* Header */}
      <CreateCampaignHeader
        checks={checks}
        availableCredits={balanceQuery.isSuccess ? currentBalance : null}
        isAdmin={isAdmin}
      />

      <div id="campaign-form-alerts" ref={errorRef} className={formError || isLocked || isDailyLimitReached ? "space-y-3" : "hidden"}>
        {isDailyLimitReached && (
          <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="flex-1 space-y-0.5">
              <p className="text-sm font-semibold">Daily campaign limit reached</p>
              <p className="text-xs">
                You have reached your limit of {dailyUsage?.dailyLimit} {dailyUsage?.dailyLimit === 1 ? "campaign" : "campaigns"} for today. Your daily limit resets at midnight.
              </p>
            </div>
          </div>
        )}
        {formError && (
          <div role="alert" className="flex items-start gap-3 p-4 rounded-xl bg-destructive/10 text-destructive border border-destructive/20">
            <AlertTriangle className="size-5 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-0.5">
              <p className="text-sm font-semibold">Can’t continue yet</p>
              <p className="text-xs">{formError}</p>
            </div>
            <button
              type="button"
              onClick={() => setFormError("")}
              className="p-1 rounded hover:bg-destructive/10 cursor-pointer"
              aria-label="Dismiss"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {isLocked && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-900 dark:text-red-200 border border-red-300 dark:border-red-900">
            <Lock className="size-5 shrink-0 text-red-600" />
            <div>
              <p className="text-sm font-semibold">Credit wallet locked</p>
              <p className="text-xs text-red-700 dark:text-red-300">
                Your wallet is locked. Contact your administrator to restore campaign access.
              </p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="campaign-compose-grid">
        {/* Campaign fields */}
        <div className="campaign-compose-workspace">
          <div className="campaign-compose-fields">
            <CampaignDetailsSection
              campaignTitle={campaignTitle}
              onCampaignTitleChange={setCampaignTitle}
              scheduleType={scheduleType}
              onScheduleTypeChange={setScheduleType}
              scheduledTime={scheduledTime}
              onScheduledTimeChange={setScheduledTime}
              scheduleValid={scheduleValid}
            />

            <CampaignMessageEditor
              messageBody={messageBody}
              onMessageBodyChange={setMessageBody}
              charCount={charCount}
              isOverCharacterLimit={isOverCharacterLimit}
            >
              {(canAddCampaignLink || canAddCampaignNumber) && <details className="campaign-optional-buttons" key={draftReady} open={draftReady && Boolean(campaignLink || campaignNumber) || undefined}>
                <summary>Message buttons <span>Optional</span></summary>
                <CampaignCtaFields
                  linkError={linkError} phoneError={phoneError}
                  campaignLink={campaignLink} onCampaignLinkChange={canAddCampaignLink ? setCampaignLink : undefined}
                  campaignLinkName={campaignLinkName} onCampaignLinkNameChange={setCampaignLinkName}
                  campaignNumber={campaignNumber} onCampaignNumberChange={canAddCampaignNumber ? setCampaignNumber : undefined}
                  campaignNumberName={campaignNumberName} onCampaignNumberNameChange={setCampaignNumberName}
                />
              </details>}
            </CampaignMessageEditor>
            <CampaignMediaUploader
              mediaKinds={mediaKinds}
              media={media}
              onSelectMedia={selectMedia}
              onRemoveMedia={removeMedia}
              canShareProfileDp={canShareProfileDp}
              shareProfileDp={shareProfileDp}
              onToggleShareProfileDp={toggleShareProfileDp}
              userProfileDp={user?.dp_img}
            />
          </div>
          <CampaignWhatsAppPreview
            messageBody={messageBody}
            messageText={messageText}
            media={media}
            shareProfileDp={canShareProfileDp && shareProfileDp}
            userProfileDp={user?.dp_img}
            campaignLink={canAddCampaignLink && !linkError ? campaignLink : ""}
            campaignLinkName={campaignLinkName}
            campaignNumber={canAddCampaignNumber && !phoneError ? campaignNumber : ""}
            campaignNumberName={campaignNumberName}
          />
        </div>

        <CampaignRecipientsInput
          title="Audience"
          description="Paste phone numbers below or import a CSV or TXT file."
          fileInputRef={fileInputRef}
          rawRecipients={rawRecipients}
          onRawRecipientsChange={setRawRecipients}
          onRecipientsPaste={(e) => {
              recipientTracking.onPaste(e);
              // Show validation after paste so invalid entries are highlighted (but paste is never blocked)
              setTimeout(() => setValidateRecipients(true), 0);
            }}
          onRecipientsBeforeInput={recipientTracking.onBeforeInput}
          dropActive={dropActive}
          onDragOver={(e) => {
            e.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropActive(false);
            readRecipientsFile(e.dataTransfer.files?.[0]);
          }}
          onReadFile={readRecipientsFile}
          totalRecipients={validRecipients.length}
          duplicatesCount={duplicatesCount}
          invalidCount={invalidCount}
          invalidEntries={invalidEntries}
          inputError={recipientTracking.inputError}
          onBlur={() => {
            recipientTracking.clearInputError?.();
            setValidateRecipients(true);
          }}
          showValidation={validateRecipients}
        />

        {/* Final summary and submission */}
        <aside className="campaign-compose-summary" aria-label="Campaign summary and review">
          <CampaignCostSummary
            enteredCount={enteredCount}
            totalRecipients={totalRecipients}
            estimatedCost={estimatedCost}
            hasInsufficientCredits={hasInsufficientCredits}
            isAdmin={isAdmin}
            currentBalance={currentBalance}
            remainingBalance={remainingBalance}
            checks={checks}
            submitDisabled={submitDisabled}
            isPending={createCampaignMutation.isPending}
            onCancel={() => navigate(parentCampaignsPath)}
          />
        </aside>
      </form>

      <CampaignReviewDialog
        isOpen={Boolean(reviewPayload)}
        onClose={() => {
          if (!createCampaignMutation.isPending) {
            setReviewPayload(null);
            createCampaignMutation.reset();
          }
        }}
        isPending={createCampaignMutation.isPending}
        campaignTitle={campaignTitle}
        campaignLink={canAddCampaignLink ? campaignLink : ""}
        campaignLinkName={canAddCampaignLink ? campaignLinkName : ""}
        campaignNumber={canAddCampaignNumber ? campaignNumber : ""}
        campaignNumberName={campaignNumberName}
        shareProfileDp={canShareProfileDp ? shareProfileDp : false}
        totalRecipients={totalRecipients}
        estimate={estimate}
        estimatedCost={estimatedCost}
        isAdmin={isAdmin}
        availableCredits={currentBalance}
        remainingBalance={remainingBalance}
        scheduleType={scheduleType}
        scheduledTime={scheduledTime}
        totalMediaCount={totalMediaCount}
        mediaName={Object.values(media).find(Boolean)?.name}
        duplicatesCount={duplicatesCount}
        error={createCampaignMutation.error}
        onSubmit={() => {
          if (submitting.current) return;
          submitting.current = true;
          createCampaignMutation.mutate(reviewPayload);
        }}
      />
    </div>
  );
}
