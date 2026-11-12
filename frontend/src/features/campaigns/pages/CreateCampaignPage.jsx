import useRecipientTracking from "../hooks/useRecipientTracking";
import { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate, Navigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Lock, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import apiClient from "@/api/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { QueryState } from "@/features/admin/components/shared";
import { campaignEstimate, parseRecipients, splitRecipientInput } from "../lib/submission";

import CreateCampaignHeader from "../components/create/CreateCampaignHeader";
import CampaignDetailsSection from "../components/create/CampaignDetailsSection";
import CampaignMessageEditor, { CHARACTER_LIMIT } from "../components/create/CampaignMessageEditor";
import CampaignMediaUploader, { MEDIA_KINDS, MB, formatFileSize } from "../components/create/CampaignMediaUploader";
import CampaignRecipientsInput from "../components/create/CampaignRecipientsInput";
import CampaignDeliverySettings from "../components/create/CampaignDeliverySettings";
import CampaignCostSummary from "../components/create/CampaignCostSummary";
import CampaignReviewDialog from "../components/create/CampaignReviewDialog";
import { readCampaignDraft, removeCampaignDraft, writeCampaignDraft } from "../lib/draftStorage";
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
  const queryClient = useQueryClient();

  const [reviewPayload, setReviewPayload] = useState(null);
  const submitting = useRef(false);
  const finished = useRef(false);
  const quillRef = useRef(null);
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
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignLink, setCampaignLink] = useState("");
  const [campaignNumber, setCampaignNumber] = useState("");
  const [shareProfileDp, setShareProfileDp] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const recipientTracking = useRecipientTracking();
  const { rawRecipients, change: setRawRecipients, audit: recipientAudit } = recipientTracking;
  const [scheduleType, setScheduleType] = useState("now"); // "now" | "later"
  const [scheduledTime, setScheduledTime] = useState("");
  const [formError, setFormError] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [draftReady, setDraftReady] = useState(() => !draftKey);
  const draftSaveTimer = useRef(null);

  // Exactly one image, one video, one PDF
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
        setCampaignDescription(draft.campaignDescription || "");
        setCampaignLink(draft.campaignLink || "");
        setCampaignNumber(draft.campaignNumber || "");
        setShareProfileDp(draft.shareProfileDp === true);
        setMessageBody(draft.messageBody || "");
        recipientTracking.restore(draft.rawRecipients || "", draft.recipientTracking);
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
  }, [draftKey]);

  // Revoke object URLs when replaced or on unmount
  useEffect(() => () => { if (media.image?.preview) URL.revokeObjectURL(media.image.preview); }, [media.image]);
  useEffect(() => () => { if (media.video?.preview) URL.revokeObjectURL(media.video.preview); }, [media.video]);

  const balanceQuery = useQuery({
    queryKey: ["myWalletBalance", user?.id || user?._id],
    queryFn: async () => (await apiClient.get("/credits/balance")).data,
  });

  const wallet = balanceQuery.data?.wallet || {};
  const currentBalance = wallet.balance || 0;
  const isLocked = !isAdmin && Boolean(wallet.isLocked);

  const quillModules = useMemo(
    () => ({
      toolbar: [
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["blockquote", "code-block"],
        ["clean"],
      ],
    }),
    []
  );
  const quillFormats = ["bold", "italic", "underline", "strike", "list", "bullet", "blockquote", "code-block"];

  const messageText = useMemo(() => htmlToText(messageBody), [messageBody]);
  const charCount = messageText.length;
  const isOverCharacterLimit = charCount > CHARACTER_LIMIT;

  const { validRecipients, duplicatesCount, invalidCount, enteredCount } = useMemo(() => parseRecipients(rawRecipients), [rawRecipients]);
  const totalRecipients = enteredCount;
  const estimate = campaignEstimate({ role: user?.role, ratePerMsg: wallet.ratePerMsg, balance: currentBalance, recipients: totalRecipients });
  const estimatedCost = estimate.cost;
  const remainingBalance = estimate.remaining;
  const hasInsufficientCredits = estimate.insufficient;
  const totalMediaCount = Object.values(media).filter(Boolean).length + (canShareProfileDp && shareProfileDp ? 1 : 0);

  const scheduleValid =
    scheduleType === "now" ||
    (scheduledTime && Number.isFinite(new Date(scheduledTime).getTime()) && new Date(scheduledTime) > new Date());

  // What's still missing before "Review campaign" works
  const checks = [
    { ok: Boolean(campaignTitle.trim()), label: "Campaign title" },
    { ok: (Boolean(messageText) || totalMediaCount > 0) && !isOverCharacterLimit, label: "Message or attachment" },
    { ok: validRecipients.length > 0, label: isAdmin ? "At least one valid recipient" : "Recipient numbers added" },
    { ok: Boolean(scheduleValid), label: scheduleType === "later" ? "Future schedule time" : "Delivery timing" },
    { ok: !hasInsufficientCredits && !isLocked, label: "Enough credits" },
  ];

  const isDirty = Boolean(campaignTitle || campaignDescription || campaignLink || campaignNumber || shareProfileDp || messageText || rawRecipients.trim() || totalMediaCount || scheduleType !== "now" || scheduledTime);

  useEffect(() => {
    if (!draftReady || !draftKey) return undefined;
    window.clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = window.setTimeout(() => {
      if (!isDirty) {
        removeCampaignDraft(draftKey).catch(() => {});
        return;
      }
      writeCampaignDraft(draftKey, {
        campaignTitle,
        campaignDescription,
        campaignLink,
        campaignNumber,
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
  }, [draftReady, draftKey, isDirty, campaignTitle, campaignDescription, campaignLink, campaignNumber, shareProfileDp, messageBody, rawRecipients, recipientTracking.tracking, scheduleType, scheduledTime, media]);

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
    const cfg = MEDIA_KINDS[kind];
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
    setMedia((m) => ({
      ...m,
      [kind]: {
        file,
        name: file.name,
        size: file.size,
        preview: kind === "pdf" ? null : URL.createObjectURL(file),
      },
    }));
  };
  const removeMedia = (kind) => setMedia((m) => ({ ...m, [kind]: null }));

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
        recipientTracking.appendFile(content);
        toast.add({ title: "Numbers imported", description: file.name, type: "success" });
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
      for (const key of ["campaigns", "reseller", "admin", "user", "myWalletBalance"]) queryClient.invalidateQueries({ queryKey: [key] });
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
      setFormError(msg);
      setReviewPayload(null);
      toast.add({ title: "Campaign submission failed", description: msg, type: "error" });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError("");
    if (submitting.current || createCampaignMutation.isPending) return;
    if (user?.isPreview) return setFormError("Exit account preview to submit a campaign.");
    if (!isAdmin && !balanceQuery.isSuccess) return setFormError("Load your credit balance before continuing.");
    if (scheduleType === "later" && !scheduleValid) return setFormError("Choose a future date and time.");
    if (canAddCampaignLink && campaignLink.trim()) {
      try {
        const parsedLink = new URL(campaignLink.trim());
        if (!["http:", "https:"].includes(parsedLink.protocol)) throw new Error("unsupported protocol");
      } catch {
        return setFormError("Enter a valid HTTP or HTTPS campaign link.");
      }
    }
    if (canAddCampaignNumber && campaignNumber.trim()) {
      const campaignNumberDigits = campaignNumber.replace(/\D/g, "");
      if (!/^\+?[\d\s().-]+$/.test(campaignNumber.trim()) || campaignNumberDigits.length < 7 || campaignNumberDigits.length > 15) {
        return setFormError("Enter a valid campaign number with 7 to 15 digits.");
      }
    }
    if (isLocked) return setFormError("Your credit balance is expired and locked. Please contact your administrator.");
    if (!campaignTitle.trim()) return setFormError("Please provide a campaign title.");
    if (!messageText && totalMediaCount === 0) return setFormError("Please provide message content or attach media (image, video, or PDF).");
    if (isOverCharacterLimit) return setFormError(`Message exceeds the maximum limit of ${CHARACTER_LIMIT} characters (currently ${charCount}). Please shorten it.`);
    if (/\{\{[\s\S]*?\}\}/.test(messageBody)) return setFormError("Dynamic variables like {{...}} are not allowed. Please enter static text only.");
    if (validRecipients.length === 0) return setFormError("Please provide at least one valid recipient phone number.");
    if (hasInsufficientCredits) return setFormError(`Insufficient credits. You need ${estimatedCost} credits but currently hold ${currentBalance}.`);

    const formData = new FormData();
    formData.append("campaignTitle", campaignTitle.trim());
    formData.append("campaignDescription", campaignDescription.trim());
    if (canAddCampaignLink && campaignLink.trim()) formData.append("campaignLink", campaignLink.trim());
    if (canAddCampaignNumber && campaignNumber.trim()) formData.append("campaignNumber", campaignNumber.trim());
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

  const previewText = messageText;
  const submitDisabled =
    createCampaignMutation.isPending ||
    user?.isPreview ||
    (!isAdmin && !balanceQuery.isSuccess) ||
    isLocked ||
    hasInsufficientCredits ||
    isOverCharacterLimit;

  return (
    <div data-tour-loading={!draftReady} className="campaign-editor campaign-compose mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-5 pb-8">
      <style>{`
        .quill-editor-container .ql-toolbar.ql-snow { border-top-left-radius:.75rem; border-top-right-radius:.75rem; border-color:var(--border); background-color:var(--muted); padding:.5rem .75rem; }
        .quill-editor-container .ql-container.ql-snow { border-bottom-left-radius:.75rem; border-bottom-right-radius:.75rem; border-color:var(--border); background-color:var(--card); font-family:inherit; font-size:.875rem; min-height:180px; }
        .quill-editor-container .ql-editor { min-height:160px; font-size:.875rem; line-height:1.6; color:var(--foreground); }
        .quill-editor-container .ql-editor.ql-blank::before { color:var(--muted-foreground); font-style:normal; }
        .quill-editor-container:focus-within .ql-container.ql-snow, .quill-editor-container:focus-within .ql-toolbar.ql-snow { border-color:var(--ring); }
        .dark .quill-editor-container .ql-snow .ql-stroke { stroke:var(--foreground); }
        .dark .quill-editor-container .ql-snow .ql-fill { fill:var(--foreground); }
        .dark .quill-editor-container .ql-snow .ql-picker { color:var(--foreground); }
      `}</style>

      {!isAdmin && (balanceQuery.isLoading || balanceQuery.isError) && (
        <QueryState query={balanceQuery}>
          <span className="sr-only">Credit balance loaded</span>
        </QueryState>
      )}
      {user?.isPreview && <p className="dashboard-note">Campaign submission is unavailable during account preview.</p>}

      {/* Header */}
      <CreateCampaignHeader
        checks={checks}
        onNavigateBack={() => navigate(parentCampaignsPath)}
        isPending={createCampaignMutation.isPending}
      />

      <div ref={errorRef} className={formError || isLocked ? "space-y-3" : "hidden"}>
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
                Your credit allocation has expired. Campaigns are disabled until the Super Admin renews it.
              </p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="campaign-compose-grid">
        {/* Campaign fields */}
        <div className="campaign-compose-fields">
          <CampaignDetailsSection
            campaignTitle={campaignTitle}
            onCampaignTitleChange={setCampaignTitle}
            campaignDescription={campaignDescription}
            onCampaignDescriptionChange={setCampaignDescription}
            campaignLink={campaignLink}
            onCampaignLinkChange={canAddCampaignLink ? setCampaignLink : undefined}
            campaignNumber={campaignNumber}
            onCampaignNumberChange={canAddCampaignNumber ? setCampaignNumber : undefined}
          />

          <CampaignMessageEditor
            quillRef={quillRef}
            messageBody={messageBody}
            onMessageBodyChange={setMessageBody}

            charCount={charCount}
            isOverCharacterLimit={isOverCharacterLimit}
            quillModules={quillModules}
            quillFormats={quillFormats}
          />

          <CampaignMediaUploader
            media={media}
            onSelectMedia={selectMedia}
            onRemoveMedia={removeMedia}
            canShareProfileDp={canShareProfileDp}
            shareProfileDp={shareProfileDp}
            onToggleShareProfileDp={setShareProfileDp}
            userProfileDp={user?.dp_img}
          />

          <CampaignRecipientsInput
            fileInputRef={fileInputRef}
            rawRecipients={rawRecipients}
            onRawRecipientsChange={setRawRecipients}
            onRecipientsPaste={recipientTracking.onPaste}
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
            totalRecipients={totalRecipients}
            duplicatesCount={duplicatesCount}
            invalidCount={invalidCount}
            showValidation={isAdmin}
          />
          <CampaignDeliverySettings
            scheduleType={scheduleType}
            onScheduleTypeChange={setScheduleType}
            scheduledTime={scheduledTime}
            onScheduledTimeChange={setScheduledTime}
            scheduleValid={scheduleValid}
          />
        </div>

        {/* Final summary and submission */}
        <aside className="campaign-compose-summary" aria-label="Campaign summary and review">


          <CampaignCostSummary
            enteredCount={enteredCount}
            totalRecipients={totalRecipients}
            estimate={estimate}
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
          if (!createCampaignMutation.isPending) setReviewPayload(null);
        }}
        isPending={createCampaignMutation.isPending}
        campaignTitle={campaignTitle}
        campaignLink={canAddCampaignLink ? campaignLink : ""}
        campaignNumber={canAddCampaignNumber ? campaignNumber : ""}
        shareProfileDp={canShareProfileDp ? shareProfileDp : false}
        totalRecipients={totalRecipients}
        estimate={estimate}
        estimatedCost={estimatedCost}
        isAdmin={isAdmin}
        remainingBalance={remainingBalance}
        scheduleType={scheduleType}
        scheduledTime={scheduledTime}
        totalMediaCount={totalMediaCount}
        previewText={previewText}
        invalidCount={invalidCount}
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
