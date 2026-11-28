import { useState, useMemo, useEffect, useRef } from "react";
import {
  Users,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Plus,
  Trash2,
  FileSpreadsheet,
  Download,
  Play,
  Loader2,
  Pencil,
  FolderPlus,
  RotateCcw,
  Wallet,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import api from "@/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { initialCampaignReportRows } from "../../../../../../shared/campaignContacts.js";
import { normalizeDuplicateRows } from "@campaign-sheet";
import { number } from "@/lib/format";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { readCampaignDraft, removeCampaignDraft, writeCampaignDraft } from "../../lib/draftStorage";
import OriginalUploadPreview from "../report/OriginalUploadPreview";

const digits = (v) => String(v ?? "").replace(/\D/g, "") || String(v ?? "").trim();

const DEFAULT_CARDS = [
  {
    key: "delivered",
    label: "Delivered / Valid Numbers",
    description: "Successfully delivered messages to recipient",
    defaultBilling: "keep",
    defaultStatus: "delivered",
  },
  {
    key: "duplicate",
    label: "Duplicate Numbers",
    description: "Duplicate numbers detected in submission",
    defaultBilling: "refund",
    defaultStatus: "failed",
  },
  {
    key: "wrong",
    label: "Wrong Numbers",
    description: "Invalid format, wrong country code or wrong number",
    defaultBilling: "refund",
    defaultStatus: "failed",
  },
  {
    key: "non_whatsapp",
    label: "Not on WhatsApp Numbers",
    description: "Numbers not registered on WhatsApp",
    defaultBilling: "refund",
    defaultStatus: "failed",
  },
];

export default function CampaignCategoryCards({ campaign }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const adminId = user?.id || user?._id;
  const draftKey = `admin-report-cards:${adminId}:${campaign._id}`;
  const [draftReady, setDraftReady] = useState(false);
  const draftSaveTimer = useRef(null);

  const isCategorized = Boolean(campaign.campaignCreditCharge || campaign.category === "CAMPAIGN");
  const rate = isCategorized
    ? 1
    : campaign.rateSnapshot ||
      (campaign.userId?.ratePerMsg > 0 ? campaign.userId.ratePerMsg : 12);

  /* ---------------- 1. Extract Original Upload Sequence ---------------- */
  // Preserves the EXACT sequence in which the user uploaded their phone numbers
  const originalUploadedNumbers = useMemo(() => {
    const rows = campaign.recipientEntries?.length ? campaign.recipientEntries : initialCampaignReportRows(campaign);
    const sorted = [...rows].sort((a, b) => Number(a.rowNumber) - Number(b.rowNumber));
    return normalizeDuplicateRows(sorted).map((entry) => ({
      ...entry,
      rowNumber: Number(entry.rowNumber),
      phoneNumber: digits(entry.phoneNumber),
      initialTab: entry.tabKey || (entry.status === "failed" ? "wrong" : "delivered"),
      initialBilling: entry.billingAction || "keep",
      initialStatus: entry.status === "delivered" || entry.status === "read" ? "delivered" : entry.status === "failed" ? "failed" : undefined,
    }));
  }, [campaign]);

  /* ---------------- 2. Custom Categories State ---------------- */
  const [customCards, setCustomCards] = useState(
    campaign.customRecipientTabs || []
  );

  const [cardLabels, setCardLabels] = useState(campaign.recipientCategoryLabels || {});
  const [maskNumbers, setMaskNumbers] = useState(campaign.maskReportNumbers !== false);
  const [savedRevision, setSavedRevision] = useState(campaign.spreadsheetRevision || 0);
  const [renameCard, setRenameCard] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const allCards = useMemo(() => {
    return [...DEFAULT_CARDS, ...customCards].map((card) => ({
      ...card,
      label: cardLabels[card.key] || card.label,
      defaultStatus: card.defaultStatus || card.deliveryStatus || ((card.defaultBilling || card.billingAction) === "refund" ? "failed" : "delivered"),
    }));
  }, [customCards, cardLabels]);
  const handleRenameCard = () => {
    const label = renameValue.trim();
    if (!label || !renameCard) return;
    if (allCards.some((card) => card.key !== renameCard && card.label.toLowerCase() === label.toLowerCase())) {
      toast.add({ title: "A category with this name already exists", type: "error" });
      return;
    }
    setCardLabels((previous) => ({ ...previous, [renameCard]: label }));
    setRenameCard(null);
  };

  /* ---------------- 3. Card Billing & Delivery Status State ---------------- */
  const [cardBillings, setCardBillings] = useState(() => {
    const billings = {
      delivered: "keep",
      duplicate: "refund",
      wrong: "refund",
      non_whatsapp: "refund",
    };
    for (const c of campaign.customRecipientTabs || []) {
      billings[c.key] = c.defaultBilling || c.billingAction || "refund";
    }
    for (const entry of campaign.recipientEntries || []) {
      if (entry.tabKey in billings && entry.billingAction) {
        billings[entry.tabKey] = entry.billingAction === "refund" ? "refund" : "keep";
      }
    }
    return billings;
  });

  const [cardStatuses, setCardStatuses] = useState(() => {
    const statuses = {
      delivered: "delivered",
      duplicate: "failed",
      wrong: "failed",
      non_whatsapp: "failed",
    };
    for (const c of campaign.customRecipientTabs || []) {
      const billing = c.defaultBilling || c.billingAction || "refund";
      statuses[c.key] = c.deliveryStatus || c.defaultStatus || (billing === "refund" ? "failed" : "delivered");
    }
    for (const entry of campaign.recipientEntries || []) {
      if (entry.tabKey in statuses && (entry.status === "delivered" || entry.status === "failed")) {
        statuses[entry.tabKey] = entry.status;
      }
    }
    return statuses;
  });

  /* ---------------- 4. Direct Textarea Text State per Card ---------------- */
  // Each card maintains its plain multiline string: "919876543210\n919876543211..."
  const [cardTexts, setCardTexts] = useState(() => {
    const buckets = {
      delivered: [],
      duplicate: [],
      wrong: [],
      non_whatsapp: [],
    };
    for (const c of campaign.customRecipientTabs || []) {
      buckets[c.key] = [];
    }

    for (const item of originalUploadedNumbers) {
      const target = buckets[item.initialTab] ? item.initialTab : "delivered";
      buckets[target].push(item.phoneNumber);
    }

    const texts = {};
    for (const [key, nums] of Object.entries(buckets)) {
      texts[key] = nums.join("\n");
    }
    return texts;
  });

  const editorSnapshot = () => JSON.stringify({ customCards, cardLabels, cardBillings, cardStatuses, cardTexts, maskNumbers });
  const [serverSnapshot, setServerSnapshot] = useState(() => editorSnapshot());
  const currentSnapshot = editorSnapshot();
  const hasLocalEdits = currentSnapshot !== serverSnapshot;

  useEffect(() => {
    let active = true;
    readCampaignDraft(draftKey).then((draft) => {
      if (!active) return;
      if (draft) {
        setCustomCards(draft.customCards || campaign.customRecipientTabs || []);
        setCardLabels(draft.cardLabels || campaign.recipientCategoryLabels || {});
        setCardBillings(draft.cardBillings || {});
        if (draft.cardStatuses) setCardStatuses((prev) => ({ ...prev, ...draft.cardStatuses }));
        setCardTexts(draft.cardTexts || {});
        if (typeof draft.maskNumbers === "boolean") setMaskNumbers(draft.maskNumbers);
        toast.add({ title: "Unfinished report edits restored", description: "Your category changes are ready to continue.", type: "info" });
      }
      setDraftReady(true);
    }).catch(() => {
      if (active) setDraftReady(true);
    });
    return () => { active = false; };
  }, [draftKey, campaign.customRecipientTabs, campaign.recipientCategoryLabels]);

  useEffect(() => {
    if (!draftReady) return undefined;
    window.clearTimeout(draftSaveTimer.current);
    if (!hasLocalEdits) {
      removeCampaignDraft(draftKey).catch(() => {});
      return undefined;
    }
    draftSaveTimer.current = window.setTimeout(() => {
      writeCampaignDraft(draftKey, { customCards, cardLabels, cardBillings, cardStatuses, cardTexts, maskNumbers }).catch(() => {});
    }, 250);
    return () => window.clearTimeout(draftSaveTimer.current);
  }, [draftReady, draftKey, hasLocalEdits, customCards, cardLabels, cardBillings, cardStatuses, cardTexts, maskNumbers]);

  // Read-only all contacts text
  const allContactsText = useMemo(() => {
    return originalUploadedNumbers.map((item) => item.phoneNumber).join("\n");
  }, [originalUploadedNumbers]);

  /* ---------------- 5. Parse Number Counts per Card ---------------- */
  const cardStats = useMemo(() => {
    const stats = {};
    for (const card of allCards) {
      const text = cardTexts[card.key] || "";
      const lines = text
        .split(/\r?\n/)
        .map(digits)
        .filter((p) => p.length >= 7);
      const billing = cardBillings[card.key] || card.defaultBilling || "keep";
      stats[card.key] = {
        count: lines.length,
        billing,
        status: cardStatuses[card.key] || card.defaultStatus || (billing === "refund" ? "failed" : "delivered"),
      };
    }
    return stats;
  }, [cardTexts, cardBillings, cardStatuses, allCards]);

  /* ---------------- 6. Live Financial Breakdown ---------------- */
  const liveFinancials = useMemo(() => {
    let refundCount = 0;
    let keepChargedCount = 0;

    for (const stat of Object.values(cardStats)) {
      if (stat.billing === "refund") {
        refundCount += stat.count;
      } else {
        keepChargedCount += stat.count;
      }
    }

    const totalAudience = originalUploadedNumbers.length;
    const isFailedCampaign = campaign.status === "failed";
    const refundAmount = isFailedCampaign ? campaign.creditsDeducted || 0 : refundCount * rate;
    const chargedAmount = isFailedCampaign ? 0 : keepChargedCount * rate;

    return {
      totalAudience,
      refundCount,
      keepChargedCount,
      refundAmount,
      chargedAmount,
    };
  }, [cardStats, originalUploadedNumbers, rate, campaign.status, campaign.creditsDeducted]);

  /* ---------------- 7. Auto-Sync Textarea Handler ---------------- */
  // When admin pastes/types into cardKey:
  // Removes those numbers from other cards so each number is in exactly one bucket
  const handleCardTextChange = (cardKey, newText) => {
    const pastedNumbers = new Set(
      newText
        .split(/\r?\n/)
        .map(digits)
        .filter((p) => p.length >= 7)
    );

    setCardTexts((prev) => {
      const next = { ...prev, [cardKey]: newText };

      // Auto-sync: remove any of these numbers from other cards
      for (const otherKey of Object.keys(prev)) {
        if (otherKey === cardKey || otherKey === "duplicate" || cardKey === "duplicate") continue;
        const currentOtherText = prev[otherKey] || "";
        if (!currentOtherText.trim()) continue;

        const filteredLines = currentOtherText
          .split(/\r?\n/)
          .filter((line) => {
            const clean = digits(line);
            return !pastedNumbers.has(clean);
          });

        next[otherKey] = filteredLines.join("\n");
      }
      return next;
    });
  };

  /* ---------------- 8. Card Billing & Status Controls ---------------- */
  const handleToggleCardBilling = (cardKey) => {
    const nextBilling = cardBillings[cardKey] === "refund" ? "keep" : "refund";
    setCardBillings((prev) => ({
      ...prev,
      [cardKey]: nextBilling,
    }));
    setCustomCards((prev) =>
      prev.map((card) => (card.key === cardKey ? { ...card, defaultBilling: nextBilling } : card))
    );
  };

  const handleChangeCardStatus = (cardKey, nextStatus) => {
    if (nextStatus !== "delivered" && nextStatus !== "failed") return;
    setCardStatuses((prev) => ({
      ...prev,
      [cardKey]: nextStatus,
    }));
    setCustomCards((prev) =>
      prev.map((card) => (card.key === cardKey ? { ...card, deliveryStatus: nextStatus } : card))
    );
  };

  /* ---------------- 9. Copy Text to Clipboard (for Excel) ---------------- */
  const [copiedCard, setCopiedCard] = useState(null);
  const handleCopyText = async (cardKey, text, label) => {
    if (!text.trim()) {
      toast.add({ title: `No numbers in ${label}`, type: "info" });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCard(cardKey);
      toast.add({
        title: `Copied ${label} for Excel`,
        description: "Formatted one number per line. Paste directly into any Excel column.",
        type: "success",
      });
      setTimeout(() => setCopiedCard(null), 2000);
    } catch {
      toast.add({ title: "Failed to copy to clipboard", type: "error" });
    }
  };

  /* ---------------- 10. Modals State ---------------- */
  const [createCategoryModalOpen, setCreateCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatBilling, setNewCatBilling] = useState("refund");
  const [newCatStatus, setNewCatStatus] = useState("failed");
  const [newCatStatusTouched, setNewCatStatusTouched] = useState(false);

  const handleOpenCreateCategory = () => {
    setNewCatName("");
    setNewCatBilling("refund");
    setNewCatStatus("failed");
    setNewCatStatusTouched(false);
    setCreateCategoryModalOpen(true);
  };

  const [isSaving, setIsSaving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  /* ---------------- 11. Create New Category ---------------- */
  const handleCreateCategory = () => {
    const trimmed = newCatName.trim();
    if (!trimmed) {
      toast.add({ title: "Please enter a category name", type: "error" });
      return;
    }
    const key = `custom_${Date.now()}`;
    const newCard = {
      key,
      label: trimmed,
      description: `Custom category with ${newCatStatus === "delivered" ? "Delivered" : "Failed"} status and ${newCatBilling === "refund" ? "Refund" : "Keep Charged"} rule`,
      defaultBilling: newCatBilling,
      deliveryStatus: newCatStatus,
    };
    setCustomCards((prev) => [...prev, newCard]);
    setCardBillings((prev) => ({ ...prev, [key]: newCatBilling }));
    setCardStatuses((prev) => ({ ...prev, [key]: newCatStatus }));
    setCardTexts((prev) => ({ ...prev, [key]: "" }));
    setNewCatName("");
    setNewCatBilling("refund");
    setNewCatStatus("failed");
    setNewCatStatusTouched(false);
    setCreateCategoryModalOpen(false);
    toast.add({
      title: `Created category "${trimmed}"`,
      description: `Message status: ${newCatStatus === "delivered" ? "Delivered" : "Failed"} · Billing: ${newCatBilling === "refund" ? "Refund Credit" : "Keep Charged"}.`,
      type: "success",
    });
  };

  /* ---------------- 12. Delete Custom Category ---------------- */
  const handleDeleteCategory = (catKey, catLabel) => {
    // Return any numbers in this card to "delivered"
    const numbersToReturn = (cardTexts[catKey] || "").trim();
    if (numbersToReturn) {
      setCardTexts((prev) => ({
        ...prev,
        delivered: prev.delivered
          ? `${prev.delivered}\n${numbersToReturn}`
          : numbersToReturn,
        [catKey]: "",
      }));
    }
    setCustomCards((prev) => prev.filter((c) => c.key !== catKey));
    toast.add({
      title: `Removed "${catLabel}"`,
      description: "Any numbers were returned to Delivered.",
      type: "info",
    });
  };

  /* ---------------- 13. Campaign Status Transition: Start Campaign ---------------- */
  const handleStartCampaign = async () => {
    try {
      setIsStarting(true);
      await api.patch(`/campaigns/${campaign._id}/status`, { status: "ongoing" });
      toast.add({
        title: "Campaign started",
        description: "Status is now Ongoing. Verification and categorization active.",
        type: "success",
      });
      queryClient.invalidateQueries({ queryKey: ["campaign-detail", campaign._id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
    } catch (err) {
      toast.add({
        title: err?.response?.data?.message || "Failed to start campaign",
        type: "error",
      });
    } finally {
      setIsStarting(false);
    }
  };

  /* ---------------- 14. Save Draft or Publish Report ---------------- */
  // CRITICAL: Builds entries in the EXACT original sequence uploaded by the user!
  const [isDownloading, setIsDownloading] = useState(false);
  const buildCurrentEntries = () => {
      // Build a reverse map from phoneNumber -> { cardKey, cardLabel, billingAction, status }
      const phoneToCardMap = new Map();
      const cardDefaults = new Map();
      for (const card of allCards) {
        const text = cardTexts[card.key] || "";
        const billing = cardBillings[card.key] || card.defaultBilling || "keep";
        const status = cardStatuses[card.key] || card.defaultStatus || (billing === "refund" ? "failed" : "delivered");
        cardDefaults.set(card.key, {
          cardKey: card.key,
          cardLabel: card.label,
          billingAction: billing,
          status,
        });
        const lines = text
          .split(/\r?\n/)
          .map(digits)
          .filter((p) => p.length >= 7);

        for (const phone of lines) {
          if (card.key === "duplicate" && phoneToCardMap.has(phone)) continue;
          phoneToCardMap.set(phone, {
            cardKey: card.key,
            cardLabel: card.label,
            billingAction: billing,
            status,
          });
        }
      }

      const fallbackCard = cardDefaults.get("delivered") || {
        cardKey: "delivered",
        cardLabel: "Delivered / Valid Numbers",
        billingAction: "keep",
        status: "delivered",
      };

      // Reconstruct final entries in the EXACT uploaded sequence
      const finalEntries = [];
      const accountedPhones = new Set();

      for (const item of originalUploadedNumbers) {
        const phone = item.phoneNumber;
        accountedPhones.add(phone);
        const cardInfo = phoneToCardMap.get(phone) || fallbackCard;

        finalEntries.push({
          notes: item.notes || "",
          cells: item.cells || {},
          rowNumber: item.rowNumber,
          phoneNumber: phone,
          status: cardInfo.status,
          classification: cardInfo.cardKey,
          category: cardInfo.cardLabel,
          tabKey: cardInfo.cardKey,
          billingAction: cardInfo.billingAction,
        });
      }

      // If admin pasted extra new numbers that weren't in the original upload, append them
      let nextRow = finalEntries.reduce((max, row) => Math.max(max, row.rowNumber), 0) + 1;
      for (const [phone, cardInfo] of phoneToCardMap.entries()) {
        if (!accountedPhones.has(phone)) {
          finalEntries.push({
            rowNumber: nextRow++,
            phoneNumber: phone,
            status: cardInfo.status,
            classification: cardInfo.cardKey,
            category: cardInfo.cardLabel,
            tabKey: cardInfo.cardKey,
            billingAction: cardInfo.billingAction,
          });
        }
      }

    const duplicateCard = cardDefaults.get("duplicate");
    return normalizeDuplicateRows(finalEntries, {
      status: duplicateCard?.status,
      billingAction: duplicateCard?.billingAction,
    });
  };

  const handleDownloadExcel = async () => {
    setIsDownloading(true);
    try {
      const response = await api.post(`/campaigns/${campaign._id}/recipient-report/export`, {
        entries: buildCurrentEntries(), spreadsheetColumns: campaign.spreadsheetColumns,
        originalEntries: originalUploadedNumbers.map(({ rowNumber, phoneNumber }) => ({ rowNumber, phoneNumber })),
        cards: allCards.map((card) => {
          const billingAction = cardBillings[card.key] || card.defaultBilling || "keep";
          return {
            key: card.key,
            label: cardLabels[card.key] || card.label,
            billingAction,
            deliveryStatus: cardStatuses[card.key] || card.defaultStatus || (billingAction === "refund" ? "failed" : "delivered"),
          };
        }),
      }, { responseType: "blob" });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "campaign-recipients.xlsx";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      let message = "Could not download Excel. Please try again.";
      try {
        const data = error.response?.data;
        const payload = typeof data?.text === "function" ? JSON.parse(await data.text()) : data;
        message = payload?.message || message;
      } catch { /* Use the default message if the response is not JSON. */ }
      toast.add({ title: message, type: "error" });
    } finally { setIsDownloading(false); }
  };

  const handleSave = async (saveMode = "draft", reviewAfterSave = false) => {
    try {
      setIsSaving(true);

      const finalEntries = buildCurrentEntries();

      const response = await api.put(`/campaigns/${campaign._id}/recipients-management`, {
        entries: finalEntries,
        customTabs: customCards,
        recipientCategoryLabels: cardLabels,
        maskReportNumbers: maskNumbers,
        saveMode,
        spreadsheetRevision: savedRevision,
        spreadsheetColumns: campaign.spreadsheetColumns,
        status: saveMode === "publish" ? "completed" : undefined,
      });
      setSavedRevision(response.data.data.spreadsheetRevision);
      setServerSnapshot(editorSnapshot());
      window.clearTimeout(draftSaveTimer.current);
      removeCampaignDraft(draftKey).catch(() => {});

      if (saveMode === "publish") {
        toast.add({
          title: "Report published & Campaign completed",
          description: `Processed ${number(
            liveFinancials.refundCount
          )} refunds (+${number(liveFinancials.refundAmount)} credits) to creator wallet.`,
          type: "success",
        });

      } else {
        toast.add({
          title: "Draft saved successfully",
          description: "All categories and numbers are saved.",
          type: "success",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["campaign-detail", campaign._id] });
      queryClient.setQueryData(["campaign-report", campaign._id], response.data.data);
      queryClient.invalidateQueries({ queryKey: ["campaign-report", campaign._id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });
      if (reviewAfterSave) navigate(`/admin/campaigns/${campaign._id}/report`);
    } catch (err) {
      toast.add({
        title: err?.response?.data?.message || "Failed to save recipient management data",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form data-tour="report-editor" id="campaign-recipient-report" className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!isSaving && !isStarting) handleSave("draft", true); }}>
      <section data-tour="report-editor-actions" className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Report controls">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">Recipient report</h2>
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground select-none"><span>{maskNumbers ? "Encrypted numbers" : "Decrypted numbers"}</span><input type="checkbox" role="switch" checked={maskNumbers} disabled={isSaving} onChange={(event) => setMaskNumbers(event.target.checked)} title="Show numbers as 9198XXXXXX10 or 98XXXXXX10 in the campaign creator's report" className="portal-toggle !mt-0" /></label>
          </div>
          <div className="flex flex-wrap items-center gap-2">

            <Button type="button" variant="outline" size="sm" onClick={handleDownloadExcel} disabled={isDownloading || isSaving || isStarting || originalUploadedNumbers.length === 0}>{isDownloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download Excel</Button>
            <Button type="button" variant="outline" size="sm" onClick={handleOpenCreateCategory} disabled={isSaving}><Plus className="size-3.5" /> Add category</Button>
            {campaign.status === "pending" && <Button type="button" variant="outline" size="sm" onClick={handleStartCampaign} disabled={isStarting || isSaving}>{isStarting ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Start campaign</Button>}
            <Button type="button" variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={isSaving || isStarting}>{isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />} Save draft</Button>
            <Button type="button" size="sm" onClick={() => handleSave("draft", true)} disabled={isSaving || isStarting || originalUploadedNumbers.length === 0}><CheckCircle2 className="size-3.5" /> Save &amp; review report</Button>
          </div>
        </div>
        <div data-tour="report-editor-summary" className="border-t border-border bg-muted/15 p-3">
          <OverviewMetricCards columns={3} className="overview-metrics-compact" label="Report editor summary" items={[
            { label: "Audience", value: liveFinancials.totalAudience, caption: "Submitted recipients", icon: Users, accent: true },
            { label: "Keep charged", value: liveFinancials.chargedAmount, caption: "Credits", icon: Wallet },
            { label: "Refund", value: liveFinancials.refundAmount, caption: "Credits", icon: RotateCcw },
          ]} />
        </div>
      </section>

      <OriginalUploadPreview numbers={allContactsText} count={originalUploadedNumbers.length} actions={
        <Button type="button" variant="ghost" size="xs" onClick={() => handleCopyText("all", allContactsText, "All Contacts")} disabled={!allContactsText}>
          {copiedCard === "all" ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copiedCard === "all" ? "Copied" : "Copy list"}
        </Button>
      } />

      <div data-tour="report-categories" className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {allCards.map((card) => {
          const stat = cardStats[card.key] || {
            count: 0,
            billing: card.defaultBilling || "keep",
            status: card.defaultStatus || "delivered",
          };
          const isRefund = stat.billing === "refund";
          const isDelivered = stat.status === "delivered";
          const text = cardTexts[card.key] || "";
          const isCustom = card.key.startsWith("custom_");
          const title = cardLabels[card.key] || { delivered: "Delivered / valid", duplicate: "Duplicates", wrong: "Wrong numbers", non_whatsapp: "Not on WhatsApp" }[card.key] || card.label;
          return <section key={card.key} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2"><Button type="button" variant="ghost" size="icon-xs" disabled={isSaving} aria-label={"Rename " + title} title="Rename category" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => { setRenameCard(card.key); setRenameValue(title); }}><Pencil className="size-3" /></Button><h3 className="text-sm font-medium text-foreground" title={card.description}>{title}</h3><span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">{number(stat.count)}</span></div>
              <div className="flex items-center gap-1"><Button type="button" variant="ghost" size="xs" onClick={() => handleCopyText(card.key, text, card.label)} disabled={!text.trim()} aria-label={"Copy " + title + " for Excel"}>{copiedCard === card.key ? <Check className="size-3" /> : <Copy className="size-3" />}{copiedCard === card.key ? "Copied" : "Copy"}</Button>{isCustom && <Button type="button" variant="ghost" size="icon-xs" onClick={() => handleDeleteCategory(card.key, card.label)} disabled={isSaving} aria-label={"Delete " + title} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></Button>}</div>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={"numbers-" + card.key} className="text-[11px] text-muted-foreground">Phone numbers</label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={stat.status}
                    items={[
                      { value: "delivered", label: "Status: Delivered" },
                      { value: "failed", label: "Status: Failed" },
                    ]}
                    onValueChange={(nextValue) => {
                      if (nextValue && nextValue !== stat.status) handleChangeCardStatus(card.key, nextValue);
                    }}
                    disabled={isSaving}
                  >
                    <SelectTrigger
                      aria-label={"Message status for " + title}
                      size="sm"
                      className={"h-8 min-w-32 rounded-lg px-2.5 text-[11px] font-medium shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 " + (isDelivered ? "border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300" : "border-rose-200 text-rose-700 dark:border-rose-800 dark:text-rose-300")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" alignItemWithTrigger={false}>
                      <SelectItem value="delivered" className="text-xs">Delivered</SelectItem>
                      <SelectItem value="failed" className="text-xs">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={stat.billing}
                    items={[
                      { value: "keep", label: "Keep charged" },
                      { value: "refund", label: "Refund credits" },
                    ]}
                    onValueChange={(nextValue) => {
                      if (nextValue && nextValue !== stat.billing) handleToggleCardBilling(card.key);
                    }}
                    disabled={isSaving}
                  >
                    <SelectTrigger
                      aria-label={"Credit treatment for " + title}
                      size="sm"
                      className={"h-8 min-w-34 rounded-lg px-2.5 text-[11px] font-medium shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 " + (isRefund ? "border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300" : "border-input text-foreground")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end" alignItemWithTrigger={false}>
                      <SelectItem value="keep" className="text-xs">Keep charged</SelectItem>
                      <SelectItem value="refund" className="text-xs">Refund credits</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <textarea data-slot="textarea" id={"numbers-" + card.key} rows={5} value={text} onChange={(event) => handleCardTextChange(card.key, event.target.value)} disabled={isSaving} spellCheck={false} autoCorrect="off" autoCapitalize="none" placeholder="Type or paste numbers, one per line" className="block h-36 min-h-28 max-h-64 w-full resize-y overflow-y-auto rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs leading-6 text-foreground outline-none transition-colors placeholder:font-sans placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60" />
            </div>
          </section>;
        })}
      </div>

      <Dialog open={Boolean(renameCard)} onOpenChange={(open) => !open && setRenameCard(null)}>
        <DialogContent className="gap-5 rounded-2xl p-5 sm:max-w-sm">
          <DialogHeader className="gap-1.5 pr-6">
            <DialogTitle className="text-base font-semibold leading-6">Rename category</DialogTitle>
            <DialogDescription className="text-xs leading-5">Shown in the published report.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label htmlFor="category-name" className="block text-xs font-medium text-foreground">Category name</label>
            <Input id="category-name" className="h-10 rounded-lg bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring/20" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} maxLength={80} onKeyDown={(event) => { if (event.key === "Enter") handleRenameCard(); }} />
          </div>
          <DialogFooter className="m-0 flex-row justify-end rounded-none border-0 bg-transparent p-0">
            <Button type="button" size="sm" variant="ghost" onClick={() => setRenameCard(null)}>Cancel</Button>
            <Button type="button" size="sm" disabled={!renameValue.trim()} onClick={handleRenameCard}>Apply name</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={createCategoryModalOpen} onOpenChange={setCreateCategoryModalOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto rounded-2xl p-0 shadow-xl sm:max-w-[480px] [&>[data-slot=dialog-close]]:right-4 [&>[data-slot=dialog-close]]:top-4">
          <DialogHeader className="gap-4 px-5 pt-6 pr-14 sm:px-6 sm:pr-14">
            <div className="flex size-10 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-primary">
              <FolderPlus className="size-5" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <DialogTitle className="text-lg font-semibold leading-6 tracking-tight">Add category</DialogTitle>
              <DialogDescription className="text-sm leading-5">
                Organize numbers and choose message status and credit billing.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="space-y-6 px-5 py-6 sm:px-6">
            <div className="space-y-2">
              <label htmlFor="new-category-name" className="block text-sm font-medium text-foreground">Category name</label>
              <Input
                id="new-category-name"
                placeholder="e.g. Server timeout"
                aria-describedby="new-category-name-hint"
                autoComplete="off"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (newCatName.trim()) handleCreateCategory();
                  }
                }}
                className="h-11 rounded-lg bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring/20"
              />
              <p id="new-category-name-hint" className="text-xs leading-5 text-muted-foreground">
                Use a short, descriptive name for your report.
              </p>
            </div>

            <fieldset>
              <legend className="mb-3 text-sm font-medium text-foreground">Message status</legend>
              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                {[
                  { value: "delivered", title: "Delivered", description: "Mark numbers in this box as delivered.", icon: CheckCircle2 },
                  { value: "failed", title: "Failed", description: "Mark numbers in this box as not sent.", icon: XCircle },
                ].map(({ value, title, description, icon: Icon }) => (
                  <label key={value} className="relative cursor-pointer">
                    <input
                      type="radio"
                      name="new-category-status"
                      value={value}
                      checked={newCatStatus === value}
                      onChange={() => {
                        setNewCatStatus(value);
                        setNewCatStatusTouched(true);
                      }}
                      aria-label={title}
                      aria-describedby={`new-category-status-${value}-description`}
                      className="peer sr-only"
                    />
                    <span className="flex h-full flex-col rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-muted/30 peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/30 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
                      <span className="mb-2.5 flex items-center justify-between" aria-hidden="true">
                        <Icon className={`size-5 ${newCatStatus === value ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`flex size-4 items-center justify-center rounded-full border ${newCatStatus === value ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}>
                          {newCatStatus === value && <Check className="size-2.5" strokeWidth={3} />}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-foreground">{title}</span>
                      <span id={`new-category-status-${value}-description`} className="mt-1 text-xs leading-5 text-muted-foreground">{description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-3 text-sm font-medium text-foreground">Billing rule</legend>
              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                {[
                  { value: "refund", title: "Refund credit", description: "Return credits to the creator’s wallet.", icon: RotateCcw },
                  { value: "keep", title: "Keep charged", description: "Keep these numbers billed as delivery.", icon: Wallet },
                ].map(({ value, title, description, icon: Icon }) => (
                  <label key={value} className="relative cursor-pointer">
                    <input
                      type="radio"
                      name="new-category-billing"
                      value={value}
                      checked={newCatBilling === value}
                      onChange={() => {
                        setNewCatBilling(value);
                        if (!newCatStatusTouched) {
                          setNewCatStatus(value === "refund" ? "failed" : "delivered");
                        }
                      }}
                      aria-label={title}
                      aria-describedby={`new-category-billing-${value}-description`}
                      className="peer sr-only"
                    />
                    <span className="flex h-full flex-col rounded-xl border border-border bg-card p-3.5 transition-colors hover:border-primary/40 hover:bg-muted/30 peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring/30 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
                      <span className="mb-2.5 flex items-center justify-between" aria-hidden="true">
                        <Icon className={`size-5 ${newCatBilling === value ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`flex size-4 items-center justify-center rounded-full border ${newCatBilling === value ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background"}`}>
                          {newCatBilling === value && <Check className="size-2.5" strokeWidth={3} />}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-foreground">{title}</span>
                      <span id={`new-category-billing-${value}-description`} className="mt-1 text-xs leading-5 text-muted-foreground">{description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Credits are updated when you publish the report.
            </p>
          </div>

          <DialogFooter className="m-0 flex-row justify-end gap-2.5 rounded-none border-border bg-muted/25 px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" className="h-10 px-4" onClick={() => setCreateCategoryModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="h-10 gap-2 px-4" onClick={handleCreateCategory} disabled={!newCatName.trim()}>
              <Plus className="size-4" aria-hidden="true" />
              Create category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────── MODAL 2: ADMIN CONFIRMATION FOR REFUND & COMPLETE ───────────────── */}
    </form>
  );
}
