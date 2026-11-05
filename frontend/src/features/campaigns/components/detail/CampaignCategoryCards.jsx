import { useState, useMemo, useEffect, useRef } from "react";
import {
  Users,
  CheckCircle2,
  Copy,
  Check,
  Plus,
  Trash2,
  FileSpreadsheet,
  Download,
  Play,
  Loader2,
  ChevronDown,
  Pencil,
} from "lucide-react";
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
import { toast } from "@/components/ui/toast";
import api from "@/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { normalizeDuplicateRows } from "@campaign-sheet";
import { number } from "@/features/admin/lib/format";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { readCampaignDraft, removeCampaignDraft, writeCampaignDraft } from "../../lib/draftStorage";

const digits = (v) => String(v ?? "").replace(/\D/g, "") || String(v ?? "").trim();

const DEFAULT_CARDS = [
  {
    key: "delivered",
    label: "Delivered / Valid Numbers",
    description: "Successfully delivered messages to recipient",
    defaultBilling: "keep",
  },
  {
    key: "duplicate",
    label: "Duplicate Numbers",
    description: "Duplicate numbers detected in submission",
    defaultBilling: "refund",
  },
  {
    key: "wrong",
    label: "Wrong Numbers",
    description: "Invalid format, wrong country code or wrong number",
    defaultBilling: "refund",
  },
  {
    key: "non_whatsapp",
    label: "Not on WhatsApp Numbers",
    description: "Numbers not registered on WhatsApp",
    defaultBilling: "refund",
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

  const rate =
    campaign.rateSnapshot ||
    (campaign.userId?.ratePerMsg > 0 ? campaign.userId.ratePerMsg : 12);

  /* ---------------- 1. Extract Original Upload Sequence ---------------- */
  // Preserves the EXACT sequence in which the user uploaded their phone numbers
  const originalUploadedNumbers = useMemo(() => {
    const list = [];
    let counter = 1;

    // If campaign already had saved entries, use those row numbers
    if (campaign.recipientEntries && campaign.recipientEntries.length > 0) {
      const sorted = [...campaign.recipientEntries].sort(
        (a, b) => (Number(a.rowNumber) || 0) - (Number(b.rowNumber) || 0)
      );
      return normalizeDuplicateRows(sorted).map((e) => ({
        ...e,
        rowNumber: Number(e.rowNumber) || counter++,
        phoneNumber: digits(e.phoneNumber),
        initialTab: e.tabKey || (e.status === "failed" ? "wrong" : "delivered"),
        initialBilling: e.billingAction || "keep",
      }));
    }

    // Otherwise, build from campaign.recipients, duplicatesList, and invalidList
    for (const r of campaign.recipients || []) {
      const clean = digits(r.phoneNumber);
      if (!clean) continue;
      list.push({
        rowNumber: counter++,
        phoneNumber: clean,
        initialTab: r.status === "delivered" ? "delivered" : r.status === "failed" ? "wrong" : "delivered",
        initialBilling: r.status === "failed" ? "refund" : "keep",
      });
    }

    for (const dup of campaign.recipientStats?.duplicatesList || []) {
      const clean = digits(dup);
      if (!clean) continue;
      list.push({
        rowNumber: counter++,
        phoneNumber: clean,
        initialTab: "duplicate",
        initialBilling: "refund",
      });
    }

    for (const inv of campaign.recipientStats?.invalidList || []) {
      const clean = digits(inv);
      if (!clean) continue;
      list.push({
        rowNumber: counter++,
        phoneNumber: clean,
        initialTab: "wrong",
        initialBilling: "refund",
      });
    }

    return list;
  }, [campaign]);

  /* ---------------- 2. Custom Categories State ---------------- */
  const [customCards, setCustomCards] = useState(
    campaign.customRecipientTabs || []
  );

  const [cardLabels, setCardLabels] = useState(campaign.recipientCategoryLabels || {});
  const [savedRevision, setSavedRevision] = useState(campaign.spreadsheetRevision || 0);
  const [renameCard, setRenameCard] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const allCards = useMemo(() => {
    return [...DEFAULT_CARDS, ...customCards].map((card) => ({ ...card, label: cardLabels[card.key] || card.label }));
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

  /* ---------------- 3. Card Billing Settings State ---------------- */
  const [cardBillings, setCardBillings] = useState(() => {
    const billings = {
      delivered: "keep",
      duplicate: "refund",
      wrong: "refund",
      non_whatsapp: "refund",
    };
    for (const c of campaign.customRecipientTabs || []) {
      billings[c.key] = c.defaultBilling || "refund";
    }
    for (const entry of campaign.recipientEntries || []) {
      if (entry.tabKey in billings && entry.billingAction) {
        billings[entry.tabKey] = entry.billingAction === "refund" ? "refund" : "keep";
      }
    }
    return billings;
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

  const editorSnapshot = () => JSON.stringify({ customCards, cardLabels, cardBillings, cardTexts });
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
        setCardTexts(draft.cardTexts || {});
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
      writeCampaignDraft(draftKey, { customCards, cardLabels, cardBillings, cardTexts }).catch(() => {});
    }, 250);
    return () => window.clearTimeout(draftSaveTimer.current);
  }, [draftReady, draftKey, hasLocalEdits, customCards, cardLabels, cardBillings, cardTexts]);

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
      stats[card.key] = {
        count: lines.length,
        billing: cardBillings[card.key] || card.defaultBilling || "keep",
      };
    }
    return stats;
  }, [cardTexts, cardBillings, allCards]);

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

  /* ---------------- 8. Card Billing Toggle ---------------- */
  const handleToggleCardBilling = (cardKey) => {
    setCardBillings((prev) => ({
      ...prev,
      [cardKey]: prev[cardKey] === "refund" ? "keep" : "refund",
    }));
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
      description: `Custom category with ${newCatBilling === "refund" ? "Refund" : "Keep Charged"} rule`,
      defaultBilling: newCatBilling,
    };
    setCustomCards((prev) => [...prev, newCard]);
    setCardBillings((prev) => ({ ...prev, [key]: newCatBilling }));
    setCardTexts((prev) => ({ ...prev, [key]: "" }));
    setNewCatName("");
    setCreateCategoryModalOpen(false);
    toast.add({
      title: `Created category "${trimmed}"`,
      description: `Default billing: ${newCatBilling === "refund" ? "Refund Credit" : "Keep Charged"}.`,
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
      // Build a reverse map from phoneNumber -> { cardKey, cardLabel, billingAction }
      const phoneToCardMap = new Map();
      for (const card of allCards) {
        const text = cardTexts[card.key] || "";
        const billing = cardBillings[card.key] || card.defaultBilling || "keep";
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
          });
        }
      }

      // Reconstruct final entries in the EXACT uploaded sequence
      const finalEntries = [];
      const accountedPhones = new Set();

      for (const item of originalUploadedNumbers) {
        const phone = item.phoneNumber;
        accountedPhones.add(phone);
        const cardInfo = phoneToCardMap.get(phone) || {
          cardKey: "delivered",
          cardLabel: "Delivered / Valid Numbers",
          billingAction: "keep",
        };

        const isFailed = cardInfo.billingAction === "refund";
        finalEntries.push({
          notes: item.notes || "",
          cells: item.cells || {},
          rowNumber: item.rowNumber,
          phoneNumber: phone,
          status: isFailed ? "failed" : "delivered",
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
          const isFailed = cardInfo.billingAction === "refund";
          finalEntries.push({
            rowNumber: nextRow++,
            phoneNumber: phone,
            status: isFailed ? "failed" : "delivered",
            classification: cardInfo.cardKey,
            category: cardInfo.cardLabel,
            tabKey: cardInfo.cardKey,
            billingAction: cardInfo.billingAction,
          });
        }
      }


    return normalizeDuplicateRows(finalEntries);
  };

  const handleDownloadExcel = async () => {
    setIsDownloading(true);
    try {
      const response = await api.post(`/campaigns/${campaign._id}/recipient-report/export`, {
        entries: buildCurrentEntries(), spreadsheetColumns: campaign.spreadsheetColumns,
        originalEntries: originalUploadedNumbers.map(({ rowNumber, phoneNumber }) => ({ rowNumber, phoneNumber })),
        cards: allCards.map((card) => ({ key: card.key, label: cardLabels[card.key] || card.label, billingAction: cardBillings[card.key] || card.defaultBilling || "keep" })),
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
    <form id="campaign-recipient-report" className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (!isSaving && !isStarting) handleSave("draft", true); }}>
      <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Report controls">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="space-y-1">
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">Recipient report <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-normal text-muted-foreground">{number(rate)} credits / message</span></h2>
            <p className="text-[11px] text-muted-foreground">Paste numbers into a category to move them.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDownloadExcel} disabled={isDownloading || isSaving || isStarting || originalUploadedNumbers.length === 0}>{isDownloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Download Excel</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setCreateCategoryModalOpen(true)} disabled={isSaving}><Plus className="size-3.5" /> Add category</Button>
            {campaign.status === "pending" && <Button type="button" variant="outline" size="sm" onClick={handleStartCampaign} disabled={isStarting || isSaving}>{isStarting ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />} Start campaign</Button>}
            <Button type="button" variant="outline" size="sm" onClick={() => handleSave("draft")} disabled={isSaving || isStarting}>{isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />} Save draft</Button>
            <Button type="button" size="sm" onClick={() => handleSave("draft", true)} disabled={isSaving || isStarting || originalUploadedNumbers.length === 0}><CheckCircle2 className="size-3.5" /> Save &amp; review report</Button>
          </div>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-border border-t border-border bg-muted/15">
          <div className="px-3 py-3 sm:px-4"><dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Users className="hidden size-3 sm:block" />Audience</dt><dd className="mt-1 text-lg font-semibold tracking-tight text-foreground tabular-nums">{number(liveFinancials.totalAudience)}</dd></div>
          <div className="px-3 py-3 sm:px-4"><dt className="text-[11px] text-muted-foreground">Keep charged</dt><dd className="mt-1 flex flex-wrap items-baseline gap-x-2 text-lg font-semibold tracking-tight text-foreground tabular-nums">{number(liveFinancials.chargedAmount)}<span className="text-[11px] font-normal text-muted-foreground">credits</span></dd></div>
          <div className="px-3 py-3 sm:px-4"><dt className="text-[11px] text-muted-foreground">Refund</dt><dd className="mt-1 flex flex-wrap items-baseline gap-x-2 text-lg font-semibold tracking-tight text-foreground tabular-nums">{number(liveFinancials.refundAmount)}<span className="text-[11px] font-normal text-muted-foreground">credits</span></dd></div>
        </dl>
      </section>

      <details className="group overflow-hidden rounded-xl border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-xs [&::-webkit-details-marker]:hidden"><span className="flex flex-wrap items-center gap-2"><span className="font-medium text-foreground">Original upload</span><span className="text-muted-foreground">{number(originalUploadedNumbers.length)} numbers</span><span className="hidden text-[10px] text-muted-foreground sm:inline">Read only</span></span><ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" /></summary>
        <div className="space-y-2 border-t border-border p-4"><div className="flex items-center justify-between gap-3"><p className="text-[11px] text-muted-foreground">Original upload order</p><Button type="button" variant="ghost" size="xs" onClick={() => handleCopyText("all", allContactsText, "All Contacts")} disabled={!allContactsText}>{copiedCard === "all" ? <Check className="size-3" /> : <Copy className="size-3" />}{copiedCard === "all" ? "Copied" : "Copy list"}</Button></div><textarea aria-label="Original uploaded numbers" readOnly rows={4} value={allContactsText} spellCheck={false} className="block h-28 max-h-48 min-h-20 w-full resize-y overflow-y-auto rounded-lg border border-input bg-muted/20 px-3 py-2 font-mono text-xs leading-6 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30" placeholder="No numbers submitted" /></div>
      </details>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        {allCards.map((card) => {
          const stat = cardStats[card.key] || { count: 0, billing: card.defaultBilling || "keep" };
          const isRefund = stat.billing === "refund";
          const text = cardTexts[card.key] || "";
          const isCustom = card.key.startsWith("custom_");
          const title = cardLabels[card.key] || { delivered: "Delivered / valid", duplicate: "Duplicates", wrong: "Wrong numbers", non_whatsapp: "Not on WhatsApp" }[card.key] || card.label;
          return <section key={card.key} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2"><Button type="button" variant="ghost" size="icon-xs" disabled={isSaving} aria-label={"Rename " + title} title="Rename category" className="shrink-0 text-muted-foreground hover:text-foreground" onClick={() => { setRenameCard(card.key); setRenameValue(title); }}><Pencil className="size-3" /></Button><h3 className="text-sm font-medium text-foreground" title={card.description}>{title}</h3><span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground tabular-nums">{number(stat.count)}</span></div>
              <div className="flex items-center gap-1"><Button type="button" variant="ghost" size="xs" onClick={() => handleCopyText(card.key, text, card.label)} disabled={!text.trim()} aria-label={"Copy " + title + " for Excel"}>{copiedCard === card.key ? <Check className="size-3" /> : <Copy className="size-3" />}{copiedCard === card.key ? "Copied" : "Copy"}</Button>{isCustom && <Button type="button" variant="ghost" size="icon-xs" onClick={() => handleDeleteCategory(card.key, card.label)} disabled={isSaving} aria-label={"Delete " + title} className="text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></Button>}</div>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor={"numbers-" + card.key} className="text-[11px] text-muted-foreground">Phone numbers</label><select aria-label={"Credit treatment for " + title} value={stat.billing} onChange={() => handleToggleCardBilling(card.key)} disabled={isSaving} className={"h-7 rounded-md border bg-background px-2 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30 " + (isRefund ? "border-emerald-200 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300" : "border-input text-foreground")}><option value="keep">Keep charged</option><option value="refund">Refund credits</option></select></div>
              <textarea id={"numbers-" + card.key} rows={5} value={text} onChange={(event) => handleCardTextChange(card.key, event.target.value)} disabled={isSaving} spellCheck={false} autoCorrect="off" autoCapitalize="none" placeholder="Type or paste numbers, one per line" className="block h-36 min-h-28 max-h-64 w-full resize-y overflow-y-auto rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs leading-6 text-foreground outline-none transition-colors placeholder:font-sans placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-60" />
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add category</DialogTitle>
            <DialogDescription>
              Choose a category name and credit treatment.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Category Name</label>
              <Input
                placeholder="e.g. Server Timeout, Opt-Out, Country Mismatch"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Billing Rule for Numbers</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setNewCatBilling("refund")}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                    newCatBilling === "refund"
                      ? "border-emerald-500 bg-emerald-50/70 text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-200"
                      : "border-border bg-card hover:bg-muted/50"
                  }`}
                >
                  <span className="text-xs font-semibold block">Refund Credit</span>
                  <span className="text-[11px] text-muted-foreground block mt-0.5">
                    Refunds credits back to creator wallet upon publish
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setNewCatBilling("keep")}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                    newCatBilling === "keep"
                      ? "border-blue-500 bg-blue-50/70 text-blue-950 dark:bg-blue-950/30 dark:text-blue-200"
                      : "border-border bg-card hover:bg-muted/50"
                  }`}
                >
                  <span className="text-xs font-semibold block">Keep Charged</span>
                  <span className="text-[11px] text-muted-foreground block mt-0.5">
                    Treated as billable delivery; keeps credits charged
                  </span>
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setCreateCategoryModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateCategory} disabled={!newCatName.trim()}>
              Create Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ───────────────── MODAL 2: ADMIN CONFIRMATION FOR REFUND & COMPLETE ───────────────── */}
    </form>
  );
}
