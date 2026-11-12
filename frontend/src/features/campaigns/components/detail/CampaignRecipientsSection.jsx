import { useState, useMemo, useEffect, useRef } from "react";
import {
  Check,
  Search,
  X,
  Plus,
  Filter,
  CheckCircle2,
  RotateCcw,
  AlertTriangle,
  FileCheck,
  Loader2,
  Eye,
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
import { number } from "@/features/admin/lib/format";
import { toast } from "@/components/ui/toast";
import api from "@/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { assignNumbersToCategory, normalizeSavedRecipientEntry } from "../../lib/recipientEntries";

import DraftReportPreview from "../report/DraftReportPreview";
import { buildPublishedSheet, normalizeColumns } from "@campaign-sheet";
import CampaignSpreadsheet from "./CampaignSpreadsheet";
import RecipientActivityButton from "./RecipientActivityButton";
import FilterRecipientsDialog from "./FilterRecipientsDialog";
import { filterCampaignRecipients, isExcludedRecipient } from "../../lib/filterRecipients";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { readCampaignDraft, removeCampaignDraft, writeCampaignDraft } from "../../lib/draftStorage";

export const PAGE_SIZE = 100;

const digits = (v) => String(v ?? "").replace(/\D/g, "");

/* Default Tab Definitions */
const DEFAULT_TABS = [
  { key: "all", label: "All", auto: true, defaultBilling: "keep" },
  { key: "clean", label: "Clean numbers", auto: true, defaultBilling: "keep" },
  { key: "delivered", label: "Delivered", auto: true, defaultBilling: "keep", color: "bg-emerald-500", dot: "bg-emerald-500" },
  { key: "wrong", label: "Wrong numbers", auto: true, defaultBilling: "refund", color: "bg-red-500", dot: "bg-red-500" },
  { key: "duplicate", label: "Duplicates", auto: true, defaultBilling: "refund", color: "bg-stone-400", dot: "bg-stone-400" },
  { key: "non_whatsapp", label: "Non-WhatsApp", auto: true, defaultBilling: "refund", color: "bg-amber-500", dot: "bg-amber-500" },
];

export default function CampaignRecipientsSection({
  campaign,
  reviewMode = false,
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const adminId = user?.id || user?._id;
  const draftKey = `admin-recipient-report:${adminId}:${campaign._id}`;
  const [draftReady, setDraftReady] = useState(false);
  const draftSaveTimer = useRef(null);

  const rate =
    campaign.rateSnapshot ||
    (campaign.userId?.ratePerMsg > 0 ? campaign.userId.ratePerMsg : 12);

  // Initialize entries with permanent row numbers
  const initialEntries = useMemo(() => {
    if (campaign.recipientEntries && campaign.recipientEntries.length > 0) {
      return campaign.recipientEntries.map(normalizeSavedRecipientEntry);
    }

    // Synthesize entries if not yet saved on campaign
    const reportMap = new Map();
    for (const rec of campaign.recipientReport?.records || []) {
      if (rec.phoneNumber) {
        reportMap.set(digits(rec.phoneNumber), {
          category: rec.category,
          billingAction: rec.billingAction,
        });
      }
    }

    const list = [];
    let counter = 1;

    for (const r of campaign.recipients || []) {
      const clean = digits(r.phoneNumber);
      if (!clean) continue;
      const info = reportMap.get(clean);
      const isDelivered = r.status === "delivered";
      const isFailed = r.status === "failed";
      list.push({
        rowNumber: counter++,
        phoneNumber: clean,
        status: r.status || "queued",
        classification: isDelivered ? "delivered" : isFailed ? "wrong" : "pending",
        category: info?.category || (isDelivered ? "Delivered" : isFailed ? "Wrong number" : "Queued"),
        tabKey: isDelivered ? "delivered" : isFailed ? "wrong" : "all",
        billingAction: info?.billingAction || (isFailed ? "refund" : "keep"),
      });
    }

    for (const dup of campaign.recipientStats?.duplicatesList || []) {
      const clean = digits(dup);
      if (!clean) continue;
      const info = reportMap.get(clean);
      list.push({
        rowNumber: counter++,
        phoneNumber: clean,
        status: "failed",
        classification: "duplicate",
        category: info?.category || "Duplicate number",
        tabKey: "duplicate",
        billingAction: info?.billingAction || "refund",
      });
    }

    for (const inv of campaign.recipientStats?.invalidList || []) {
      const clean = digits(inv);
      if (!clean) continue;
      const info = reportMap.get(clean);
      list.push({
        rowNumber: counter++,
        phoneNumber: clean,
        status: "failed",
        classification: "wrong",
        category: info?.category || "Wrong number",
        tabKey: "wrong",
        billingAction: info?.billingAction || "refund",
      });
    }

    return list;
  }, [campaign]);

  // Working state for entries and custom tabs
  const [entries, setEntries] = useState(initialEntries);
  const [columns, setColumns] = useState(() => normalizeColumns(campaign.spreadsheetColumns || []));
  const [customTabs, setCustomTabs] = useState(campaign.customRecipientTabs || []);
  const [deletedTabKeys, setDeletedTabKeys] = useState(campaign.deletedTabKeys || []);
  const [tabToDelete, setTabToDelete] = useState(null);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedRowNumbers, setSelectedRowNumbers] = useState(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [showNumberInput, setShowNumberInput] = useState(!reviewMode);
  const [reviewFilter, setReviewFilter] = useState("all");
  const [previewSheet, setPreviewSheet] = useState(null);
  const initialNotes = campaign.spreadsheetRevision > 0 ? campaign.draftReportNotes || "" : campaign.campaignSummary?.adminNotes || "";
  const [reportNotes, setReportNotes] = useState(initialNotes);
  const needsReview = (entry) => ["queued", "pending"].includes(entry.status) || !entry.category || entry.category === "Queued";
  const reviewCount = entries.filter(needsReview).length;
  const openOwnerPreview = () => {
    try { setPreviewSheet({ ...buildPublishedSheet(entries, columns), notes: reportNotes }); }
    catch (error) { toast.add({ title: error.message, type: "error" }); }
  };

  // Modals state
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [filterPreview, setFilterPreview] = useState(null);

  const [addTabModalOpen, setAddTabModalOpen] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabBilling, setNewTabBilling] = useState("keep");

  const [categoryDrafts, setCategoryDrafts] = useState({});

  const [confirmCreditModalOpen, setConfirmCreditModalOpen] = useState(false);

  // All available tabs (defaults minus deleted, plus custom)
  const allTabs = useMemo(() => {
    const activeDefaults = DEFAULT_TABS.filter((t) => !deletedTabKeys.includes(t.key));
    return [
      ...activeDefaults,
      ...customTabs.map((t) => ({
        key: t.key,
        label: t.label,
        auto: false,
        defaultBilling: t.billingAction || "keep",
        color: t.billingAction === "refund" ? "bg-rose-400" : "bg-indigo-400",
        dot: t.billingAction === "refund" ? "bg-rose-500" : "bg-indigo-500",
      })),
    ];
  }, [customTabs, deletedTabKeys]);

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts = { all: entries.length };
    for (const t of allTabs) {
      if (t.key !== "all") counts[t.key] = 0;
    }
    for (const e of entries) {
      if (e.tabKey && e.tabKey !== "all" && counts[e.tabKey] !== undefined) {
        counts[e.tabKey]++;
      }
    }
    counts.clean = entries.filter((entry) => !isExcludedRecipient(entry)).length;
    return counts;
  }, [entries, allTabs]);

  // Credit calculation
  const creditSummary = useMemo(() => {
    const refundEntries = entries.filter((e) => e.billingAction === "refund");
    const refundCount = refundEntries.length;
    let targetRefund = refundCount * rate;
    if (campaign.creditsDeducted > 0 && targetRefund > campaign.creditsDeducted) {
      targetRefund = campaign.creditsDeducted;
    }
    const previousRefund = campaign.campaignSummary?.creditsRefunded || 0;
    const netDelta = targetRefund - previousRefund;
    return {
      refundCount,
      targetRefund,
      previousRefund,
      netDelta,
    };
  }, [entries, rate, campaign]);

  const hasUnsavedChanges = useMemo(() => {
    if (reportNotes !== initialNotes) return true;
    if (JSON.stringify(columns) !== JSON.stringify(normalizeColumns(campaign.spreadsheetColumns || []))) return true;
    if (entries.length !== initialEntries.length) return true;
    for (let i = 0; i < entries.length; i++) {
      const a = entries[i];
      const b = initialEntries[i];
      if (!b) return true;
      if (
        a.rowNumber !== b.rowNumber ||
        a.phoneNumber !== b.phoneNumber ||
        a.tabKey !== b.tabKey ||
        a.category !== b.category ||
        a.status !== b.status ||
        a.classification !== b.classification ||
        a.notes !== b.notes ||
        JSON.stringify(a.cells || {}) !== JSON.stringify(b.cells || {}) ||
        a.billingAction !== b.billingAction
      ) {
        return true;
      }
    }
    if (customTabs.length !== (campaign.customRecipientTabs?.length || 0)) return true;
    const prevDeleted = campaign.deletedTabKeys || [];
    if (deletedTabKeys.length !== prevDeleted.length) return true;
    for (const k of deletedTabKeys) {
      if (!prevDeleted.includes(k)) return true;
    }
    return false;
  }, [entries, initialEntries, columns, campaign.spreadsheetColumns, customTabs, campaign.customRecipientTabs, deletedTabKeys, campaign.deletedTabKeys, reportNotes, initialNotes]);

  const editorSnapshot = () => JSON.stringify({ entries, columns, customTabs, deletedTabKeys, reportNotes, categoryDrafts });
  const [savedSnapshot, setSavedSnapshot] = useState(() => editorSnapshot());
  const currentSnapshot = editorSnapshot();

  useEffect(() => {
    let active = true;
    readCampaignDraft(draftKey).then((draft) => {
      if (!active) return;
      if (draft) {
        setEntries(draft.entries || initialEntries);
        setColumns(draft.columns || normalizeColumns(campaign.spreadsheetColumns || []));
        setCustomTabs(draft.customTabs || campaign.customRecipientTabs || []);
        setDeletedTabKeys(draft.deletedTabKeys || campaign.deletedTabKeys || []);
        setReportNotes(draft.reportNotes ?? initialNotes);
        setCategoryDrafts(draft.categoryDrafts || {});
        toast.add({ title: "Unfinished report edits restored", description: "Your recipient sheet changes are ready to continue.", type: "info" });
      }
      setDraftReady(true);
    }).catch(() => {
      if (active) setDraftReady(true);
    });
    return () => { active = false; };
  }, [draftKey, campaign.spreadsheetRevision, campaign.customRecipientTabs, campaign.deletedTabKeys, campaign.spreadsheetColumns, initialEntries, initialNotes]);

  useEffect(() => {
    if (!draftReady) return undefined;
    window.clearTimeout(draftSaveTimer.current);
    if (currentSnapshot === savedSnapshot) {
      removeCampaignDraft(draftKey).catch(() => {});
      return undefined;
    }
    draftSaveTimer.current = window.setTimeout(() => {
      writeCampaignDraft(draftKey, { entries, columns, customTabs, deletedTabKeys, reportNotes, categoryDrafts }).catch(() => {});
    }, 250);
    return () => window.clearTimeout(draftSaveTimer.current);
  }, [draftReady, draftKey, currentSnapshot, savedSnapshot, entries, columns, customTabs, deletedTabKeys, reportNotes, categoryDrafts]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  /* ---------- Delete Tab Logic ---------- */
  const promptDeleteTab = (tab) => {
    if (["all", "clean"].includes(tab.key)) return;
    setTabToDelete(tab);
  };

  const handleDeleteTab = (tabKeyToDelete) => {
    const targetTab = allTabs.find((t) => t.key === tabKeyToDelete);
    if (!targetTab || tabKeyToDelete === "all") return;

    // 1. If it's a custom tab, remove from customTabs
    setCustomTabs((prev) => prev.filter((t) => t.key !== tabKeyToDelete));

    // 2. If it's a default tab, add to deletedTabKeys
    const isDefault = DEFAULT_TABS.some((t) => t.key === tabKeyToDelete);
    if (isDefault) {
      setDeletedTabKeys((prev) => Array.from(new Set([...prev, tabKeyToDelete])));
    }

    // 3. Move entries assigned to this tab back to 'all' with 'keep' (Charged)
    setEntries((prev) =>
      prev.map((e) => {
        if (e.tabKey === tabKeyToDelete) {
          return {
            ...e,
            tabKey: "all",
            category: "All",
            billingAction: "keep",
          };
        }
        return e;
      })
    );

    // 4. If current activeTab was the deleted tab, switch to 'all'
    if (activeTab === tabKeyToDelete) {
      setActiveTab("all");
    }

    toast.add({
      title: `Tab "${targetTab.label}" deleted`,
      description: "Any assigned entries have been moved to All.",
      type: "info",
    });
  };

  // Search filter (searches by exact row number e.g. "3" or "#3" AND by phone number)
  const filteredNumbers = useMemo(() => {
    let list = entries;
    if (reviewFilter === "needs_review") list = list.filter((entry) => ["queued", "pending"].includes(entry.status) || !entry.category || entry.category === "Queued");
    if (reviewFilter === "refunds") list = list.filter((entry) => entry.billingAction === "refund");
    if (activeTab === "clean") {
      list = list.filter((entry) => !isExcludedRecipient(entry));
    } else if (activeTab !== "all") {
      list = list.filter((e) => e.tabKey === activeTab);
    }
    const q = search.trim();
    if (!q) return list;

    // Check if searching row number like "#3" or "3"
    const rowMatch = /^#?(\d+)$/.exec(q);
    const searchRowNum = rowMatch ? parseInt(rowMatch[1], 10) : null;
    const cleanDigits = digits(q);

    return list.filter((e) => {
      if (searchRowNum !== null && e.rowNumber === searchRowNum) return true;
      if (cleanDigits && e.phoneNumber.includes(cleanDigits)) return true;
      return false;
    });
  }, [entries, activeTab, search, reviewFilter]);

  /* ---------- 1. Filter Numbers Logic ---------- */
  const runFilterAnalysis = () => {
    const result = filterCampaignRecipients(entries, campaign.recipientReport?.records);
    const newRefundCount = result.updatedEntries.filter((entry) => entry.billingAction === "refund").length;
    let targetRefund = newRefundCount * rate;
    if (campaign.creditsDeducted > 0) targetRefund = Math.min(targetRefund, campaign.creditsDeducted);
    setFilterPreview({
      ...result,
      netCreditDelta: targetRefund - (campaign.campaignSummary?.creditsRefunded || 0),
    });
    setFilterModalOpen(true);
  };

  const applyFilter = () => {
    if (!filterPreview) return;
    setEntries(filterPreview.updatedEntries);
    setActiveTab("clean");
    setReviewFilter("all");
    setSearch("");

    setSelectedRowNumbers(new Set());
    // Restore default tabs if filter populated them
    setDeletedTabKeys((prev) =>
      prev.filter((k) => {
        if (k === "wrong" && filterPreview.wrongCount > 0) return false;
        if (k === "duplicate" && filterPreview.duplicateCount > 0) return false;
        if (k === "non_whatsapp" && filterPreview.nonWhatsAppCount > 0) return false;
        return true;
      })
    );
    setFilterModalOpen(false);
    toast.add({
      title: "Recipient list filtered",
      description: `${filterPreview.cleanCount} clean numbers. Save a draft or publish to keep the updated categories.`,
      type: "success",
    });
  };

  /* ---------- 2. Custom Tabs Logic ---------- */
  const handleCreateCustomTab = () => {
    const trimmed = newTabName.trim();
    if (!trimmed) {
      toast.add({ title: "Please enter a tab name", type: "error" });
      return;
    }

    // Check if user is restoring a previously deleted default tab
    const matchingDefault = DEFAULT_TABS.find(
      (t) => t.label.toLowerCase() === trimmed.toLowerCase()
    );
    if (matchingDefault && deletedTabKeys.includes(matchingDefault.key)) {
      setDeletedTabKeys((prev) => prev.filter((k) => k !== matchingDefault.key));
      setNewTabName("");
      setNewTabBilling("keep");
      setAddTabModalOpen(false);
      setActiveTab(matchingDefault.key);
      toast.add({ title: `Restored "${matchingDefault.label}" tab`, type: "success" });
      return;
    }

    const key = `custom_${trimmed.toLowerCase().replace(/\W+/g, "_")}_${Date.now()}`;
    if (allTabs.some((t) => t.label.toLowerCase() === trimmed.toLowerCase())) {
      toast.add({ title: "A tab with this name already exists", type: "error" });
      return;
    }

    const newTab = {
      key,
      label: trimmed,
      billingAction: newTabBilling,
    };

    setCustomTabs((prev) => [...prev, newTab]);
    setNewTabName("");
    setNewTabBilling("keep");
    setAddTabModalOpen(false);
    setActiveTab(key);
    toast.add({
      title: `Created tab "${trimmed}"`,
      description: newTabBilling === "refund" ? "Configured to refund credits" : "Configured to keep charged",
      type: "success",
    });
  };

  const applyCategoryNumbers = () => {
    const tab = allTabs.find((item) => item.key === activeTab);
    if (!tab) return;
    const result = assignNumbersToCategory(entries, categoryDrafts[activeTab] || "", tab);
    if (result.moved + result.added === 0) {
      toast.add({ title: "Enter at least one phone number", type: "error" });
      return;
    }
    setEntries(result.entries);
    setCategoryDrafts((prev) => ({ ...prev, [activeTab]: "" }));
    setSearch("");

    toast.add({
      title: "Numbers assigned to " + tab.label,
      description: result.moved + " existing entries assigned, " + result.added + " new numbers added. Save changes to apply.",
      type: "success",
    });
  };

  /* ---------- 4. Bulk Assign Selection to Tab ---------- */
  const handleAssignSelectedToTab = (targetTabKey) => {
    if (selectedRowNumbers.size === 0) return;
    const targetTabDef = allTabs.find((t) => t.key === targetTabKey) || allTabs[0];
    const targetBilling = targetTabDef.defaultBilling || "keep";

    setEntries((prev) =>
      prev.map((e) => {
        if (selectedRowNumbers.has(e.rowNumber)) {
          return {
            ...e,
            tabKey: targetTabKey,
            category: targetTabDef.label,
            billingAction: targetBilling,
          };
        }
        return e;
      })
    );
    setSelectedRowNumbers(new Set());
    toast.add({
      title: `Moved ${selectedRowNumbers.size} entries to ${targetTabDef.label}`,
      type: "success",
    });
  };

  /* ---------- 5. Save Changes & Credit Settlement ---------- */
  const handleSaveRecipients = async (saveMode = "publish") => {
    setIsSaving(true);
    try {
      const res = await api.put(`/campaigns/${campaign._id}/recipients-management`, {
        entries,
        customTabs,
        deletedTabKeys,
        spreadsheetColumns: columns,
        spreadsheetRevision: campaign.spreadsheetRevision || 0,
        saveMode,
        reportNotes,
      });

      queryClient.invalidateQueries({ queryKey: ["campaign-detail", campaign._id] });
      queryClient.invalidateQueries({ queryKey: ["campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["admin-campaigns"] });

      const refundInfo = res.data?.refundInfo;
      setSavedSnapshot(editorSnapshot());
      window.clearTimeout(draftSaveTimer.current);
      removeCampaignDraft(draftKey).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["campaign-report", campaign._id] });
      let msg = saveMode === "draft" ? "Draft saved. Published report and wallet unchanged." : "Report published to the campaign owner.";
      if (refundInfo && refundInfo.netRefundDelta > 0) {
        msg += ` Wallet refunded +${refundInfo.netRefundDelta} credits.`;
      } else if (refundInfo && refundInfo.netRefundDelta < 0) {
        msg += ` Wallet adjusted ${refundInfo.netRefundDelta} credits.`;
      }

      toast.add({ title: msg, type: "success" });
      setConfirmCreditModalOpen(false);
    } catch (err) {
      toast.add({
        title: err?.response?.data?.message || "Failed to save recipient management changes",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Breakdown progress bar data
  const breakdownData = useMemo(() => {
    const data = [];
    for (const t of allTabs) {
      if (!["all", "clean"].includes(t.key) && tabCounts[t.key] > 0) {
        data.push({
          key: t.key,
          label: t.label,
          count: tabCounts[t.key],
          color: t.color || "bg-primary",
          dot: t.dot || "bg-primary",
        });
      }
    }
    return data;
  }, [allTabs, tabCounts]);

  return (
    <section className={reviewMode ? "relative w-full min-w-0 rounded-xl border border-border bg-card" : "portal-card relative overflow-hidden w-full"} aria-busy={isSaving}>
      {isSaving && <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/60"><Loader2 className="size-6 animate-spin text-primary" /></div>}
      {/* Top Header Section */}
      <div className={reviewMode ? "space-y-3 border-b border-border p-3 sm:p-4" : "p-5 border-b border-border space-y-4"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Recipients</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {number(entries.length)} recipients | {columns.length} columns
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <RecipientActivityButton activity={campaign.recipientInputAudit} />
            {reviewMode && <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowNumberInput(!showNumberInput)}><Plus className="size-3.5" /> Add numbers</Button>}
            {!reviewMode && <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!entries.length || isSaving} onClick={openOwnerPreview}><Eye className="size-3.5" /> Preview report</Button>}
            {/* Filter numbers button */}
            <Button
              variant="outline"
              size="sm"
              onClick={runFilterAnalysis}
              className="h-8 text-xs gap-1.5 border-border hover:bg-muted font-medium"
            >
              <Filter className="size-3.5 text-muted-foreground" />
              Filter numbers
            </Button>

            {!reviewMode && <Button type="button" variant="outline" size="sm" disabled={isSaving || !hasUnsavedChanges} onClick={() => handleSaveRecipients("draft")} className="h-8 gap-1.5 text-xs">
              <FileCheck className="size-3.5" /> Save draft
            </Button>}
            {!reviewMode && <Button type="button" size="sm" disabled={isSaving || !entries.length} onClick={() => setConfirmCreditModalOpen(true)} className="h-8 gap-1.5 text-xs">
              Publish report
            </Button>}
          </div>
        </div>

        {reviewMode && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {[["all", "All", entries.length], ["needs_review", "Needs review", reviewCount], ["refunds", "Refunds", creditSummary.refundCount]].map(([filter, label, count]) => <button type="button" key={filter} onClick={() => { setReviewFilter(filter); setActiveTab("all"); setSearch(""); }} className={"inline-flex items-center gap-1.5 py-1 " + (reviewFilter === filter ? "font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>{label}<span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{number(count)}</span></button>)}
        </div>}

        {/* Breakdown Progress Bar & Legend */}
        {!reviewMode && entries.length > 0 && breakdownData.length > 0 && (
          <div className="space-y-2">
            <div
              className="flex h-2 w-full overflow-hidden rounded-full bg-muted"
              role="img"
              aria-label={breakdownData.map((s) => `${s.label}: ${s.count}`).join(", ")}
            >
              {breakdownData.map((s) => (
                <div
                  key={s.key}
                  className={`${s.color} h-full transition-all`}
                  style={{ width: `${(s.count / entries.length) * 100}%` }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {breakdownData.map((s) => (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className={`size-2 rounded-full ${s.dot}`} />
                  {s.label}
                  <span className="tabular-nums font-semibold text-foreground">{number(s.count)}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tabs Bar with Entry Counts + "+" Button */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <div
            role="tablist"
            aria-label="Filter recipients"
            className="flex gap-1 p-1 rounded-lg bg-muted/60 border border-border/50 shrink-0"
          >
            {allTabs.map((tab) => {
              const isActive = activeTab === tab.key;
              const count = tabCounts[tab.key] || 0;
              const isDeletable = !["all", "clean"].includes(tab.key);

              return (
                <div
                  key={tab.key}
                  className={`group/tab relative inline-flex items-center shrink-0 rounded-md transition-all ${
                    isActive
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setReviewFilter("all");

                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium cursor-pointer ${
                      isDeletable ? "pr-1" : ""
                    }`}
                  >
                    {tab.label}
                    <span
                      className={`text-[10px] px-1.5 py-px rounded-full tabular-nums ${
                        isActive
                          ? "bg-muted text-foreground font-semibold"
                          : "bg-muted/70 text-muted-foreground"
                      }`}
                    >
                      {number(count)}
                    </span>
                  </button>

                  {/* Cross button on hover */}
                  {isDeletable && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        promptDeleteTab(tab);
                      }}
                      className="opacity-0 group-hover/tab:opacity-100 transition-opacity p-1 mr-1 rounded-full hover:bg-muted-foreground/15 text-muted-foreground hover:text-destructive cursor-pointer"
                      title={`Delete "${tab.label}" tab`}
                      aria-label={`Delete "${tab.label}" tab`}
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* "+" button for adding custom tab */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setAddTabModalOpen(true)}
            className="size-8 shrink-0 rounded-lg border-dashed border-border hover:border-primary/60 hover:bg-muted"
            title="Create Custom Tab"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>

        {showNumberInput && <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="category-recipient-numbers" className="text-sm font-medium text-foreground">
              Add numbers to {allTabs.find((tab) => tab.key === activeTab)?.label}
            </label>
            <span className="text-xs text-muted-foreground">
              {allTabs.find((tab) => tab.key === activeTab)?.defaultBilling === "refund" ? "Refund credits" : "Keep charged"}
            </span>
          </div>
          <textarea
            id="category-recipient-numbers"
            rows={3}
            value={categoryDrafts[activeTab] || ""}
            onChange={(event) => setCategoryDrafts((prev) => ({ ...prev, [activeTab]: event.target.value }))}
            placeholder="Type a number or paste a list, separated by new lines, commas or spaces"
            aria-describedby="category-recipient-help"
            className="block w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm leading-relaxed placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          />
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p id="category-recipient-help" className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              Existing numbers move to this category. New numbers are added. Save a draft or publish when finished.
            </p>
            <Button
              size="sm"
              onClick={applyCategoryNumbers}
              disabled={isSaving || !(categoryDrafts[activeTab] || "").trim()}
              className="shrink-0 gap-1.5"
            >
              <Plus className="size-3.5" /> Add numbers
            </Button>
          </div>
        </div>}

        {/* Search Bar (Phone number or row number e.g. #3) */}
        <div className="relative">
          <Search className="size-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            type="search"
            placeholder="Search by phone number or row # (e.g. #3 or 987654...)"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);

            }}
            className="pl-8 pr-8 h-9 text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Bulk Action Toolbar if rows are selected */}
        {selectedRowNumbers.size > 0 && (
          <div className="p-2.5 rounded-lg bg-blue-50/70 border border-blue-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-medium text-blue-900">
              {number(selectedRowNumbers.size)} entry(s) selected
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Assign to:</span>
              <select
                onChange={(e) => {
                  if (e.target.value) handleAssignSelectedToTab(e.target.value);
                }}
                defaultValue=""
                className="h-7 rounded border border-blue-300 bg-white px-2 text-xs text-foreground cursor-pointer"
              >
                <option value="" disabled>
                  Choose tab...
                </option>
                {allTabs.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label} ({t.defaultBilling === "refund" ? "Refund" : "Keep charged"})
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedRowNumbers(new Set())}
                className="h-7 text-xs text-blue-800 hover:bg-blue-100"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <CampaignSpreadsheet
        inputAudit={user?.role === "Super Admin" ? campaign.recipientInputAudit : undefined}
        entries={entries}
        columns={columns}
        visibleRows={filteredNumbers}
        onChange={setEntries}
        onColumnsChange={setColumns}
        tabs={allTabs}
        activeTab={activeTab}
        scope={activeTab + ":" + search + ":" + reviewFilter}
        rate={rate}
        revision={campaign.spreadsheetRevision || 0}
        onRowsSelect={setSelectedRowNumbers}
      />

      {reviewMode && <details className="border-t border-border px-4">
        <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden"><span>Client note <span className="ml-1 text-[10px]">{reportNotes ? "Added" : "Optional"}</span></span><Plus className="size-3.5" /></summary>
        <textarea aria-label="Client note" value={reportNotes} onChange={(event) => setReportNotes(event.target.value)} maxLength={4000} rows={2} placeholder="Add a note for the campaign owner..." className="mb-3 block max-h-32 min-h-16 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/30" />
      </details>}
      {reviewMode && <div className="sticky bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-border bg-card/95 px-4 py-3 backdrop-blur-sm">
        <p className="text-[11px] text-muted-foreground">{hasUnsavedChanges ? "Unsaved changes" : "No unsaved changes"}<span className="mx-2">|</span>{creditSummary.netDelta > 0 ? number(creditSummary.netDelta) + " credits to refund" : creditSummary.netDelta < 0 ? number(Math.abs(creditSummary.netDelta)) + " credits to debit" : "No credit change"}</p>
        <div className="flex gap-2"><Button type="button" variant="ghost" size="sm" disabled={isSaving || !entries.length} onClick={openOwnerPreview}>Preview</Button><Button type="button" variant="outline" size="sm" disabled={isSaving || !hasUnsavedChanges} onClick={() => handleSaveRecipients("draft")}>Save draft</Button><Button type="button" size="sm" disabled={isSaving || !entries.length} onClick={() => setConfirmCreditModalOpen(true)}>Publish report</Button></div>
      </div>}
      <DraftReportPreview sheet={previewSheet} onClose={() => setPreviewSheet(null)} />


      {/* ── Dialog 1: Filter Numbers Preview & Confirmation ── */}
      <FilterRecipientsDialog
        open={filterModalOpen}
        onOpenChange={setFilterModalOpen}
        preview={filterPreview}
        onApply={applyFilter}
      />

      {/* ── Dialog 2: Add Custom Tab Modal ── */}
      <Dialog open={addTabModalOpen} onOpenChange={setAddTabModalOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[460px]">
          <DialogHeader className="gap-2 px-6 pt-6 pr-12">
            <DialogTitle className="text-lg font-semibold tracking-tight">Create Custom Tab</DialogTitle>
            <DialogDescription className="leading-relaxed">
              Organize recipients and choose how their credits are handled.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 px-6 py-6">
            <div className="space-y-2">
              <label htmlFor="custom-recipient-tab-name" className="block text-sm font-medium text-foreground">Tab name <span className="text-muted-foreground">*</span></label>
              <Input
                id="custom-recipient-tab-name"
                placeholder="e.g. VIP numbers or Retry list"
                value={newTabName}
                onChange={(e) => setNewTabName(e.target.value)}
                className="h-10 rounded-lg px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
              />
            </div>

            <fieldset className="min-w-0 space-y-2.5">
              <legend className="text-sm font-medium text-foreground">
                Credit treatment <span className="text-muted-foreground">*</span>
              </legend>
              <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                <label
                  className={`relative rounded-xl border p-3.5 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40 ${
                    newTabBilling === "refund"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="custom-tab-billing"
                    checked={newTabBilling === "refund"}
                    onChange={() => setNewTabBilling("refund")}
                    className="sr-only"
                  />
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    <RotateCcw className="size-4 shrink-0 text-muted-foreground" /> Refund credits
                    <span aria-hidden="true" className={`ml-auto flex size-4 shrink-0 items-center justify-center rounded-full border ${newTabBilling === "refund" ? "border-primary bg-primary" : "border-input"}`}>
                      {newTabBilling === "refund" && <Check className="size-3 text-primary-foreground" />}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Return credits to the wallet for these recipients.
                  </p>
                </label>

                <label
                  className={`relative rounded-xl border p-3.5 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/40 ${
                    newTabBilling === "keep"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="custom-tab-billing"
                    checked={newTabBilling === "keep"}
                    onChange={() => setNewTabBilling("keep")}
                    className="sr-only"
                  />
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                    <CheckCircle2 className="size-4 shrink-0 text-muted-foreground" /> Keep charged
                    <span aria-hidden="true" className={`ml-auto flex size-4 shrink-0 items-center justify-center rounded-full border ${newTabBilling === "keep" ? "border-primary bg-primary" : "border-input"}`}>
                      {newTabBilling === "keep" && <Check className="size-3 text-primary-foreground" />}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Keep the existing charge for these recipients.
                  </p>
                </label>
              </div>
            </fieldset>
          </div>

          <DialogFooter className="m-0 rounded-none bg-muted/30 px-6 py-4">
            <Button variant="outline" size="sm" onClick={() => setAddTabModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateCustomTab} disabled={!newTabName.trim()} className="bg-[var(--primary)] text-white">
              Create Tab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog 4: Confirm Save & Credit Impact Modal ── */}
      <Dialog open={confirmCreditModalOpen} onOpenChange={setConfirmCreditModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Publish campaign report</DialogTitle>
            <DialogDescription>
              Review credit changes before publishing all spreadsheet columns to the campaign owner.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="p-4 rounded-xl border border-border bg-card space-y-2.5">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Total Campaign Entries:</span>
                <span className="font-semibold text-foreground tabular-nums">{number(entries.length)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Refund-Qualifying Entries:</span>
                <span className="font-semibold text-foreground tabular-nums">{number(creditSummary.refundCount)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Target Total Refund:</span>
                <span className="font-semibold text-foreground tabular-nums">{number(creditSummary.targetRefund)} credits</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Previously Refunded:</span>
                <span className="font-semibold text-foreground tabular-nums">{number(creditSummary.previousRefund)} credits</span>
              </div>
              <div className="pt-2 border-t border-border flex items-center justify-between text-sm font-bold text-foreground">
                <span>Net Wallet Adjustment:</span>
                <span
                  className={
                    creditSummary.netDelta > 0
                      ? "text-emerald-600 font-mono"
                      : creditSummary.netDelta < 0
                      ? "text-rose-600 font-mono"
                      : "text-muted-foreground"
                  }
                >
                  {creditSummary.netDelta > 0
                    ? `+${number(creditSummary.netDelta)} credits`
                    : creditSummary.netDelta < 0
                    ? `-${number(Math.abs(creditSummary.netDelta))} credits`
                    : "No wallet change"}
                </span>
              </div>
            </div>

            {reviewMode && reviewCount > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{number(reviewCount)} recipients are still queued or unclassified. Review these rows if the report is intended to be final.</p>}
            <p className="text-[11px] text-muted-foreground">
              Permanent row numbers and category assignments will be saved. Duplicate refunds are strictly prevented.
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmCreditModalOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => handleSaveRecipients("publish")}
              disabled={isSaving}
              className="bg-[var(--primary)] text-white"
            >
              {isSaving ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
              Confirm & Publish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog 5: Delete Tab Confirmation Modal ── */}
      <Dialog open={!!tabToDelete} onOpenChange={(open) => !open && setTabToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground text-sm">
              <AlertTriangle className="size-4 text-amber-500 shrink-0" />
              Delete "{tabToDelete?.label}" tab?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
              {tabToDelete && (tabCounts[tabToDelete.key] || 0) > 0 ? (
                <>
                  This tab contains <strong>{tabCounts[tabToDelete.key]}</strong> recipient entry(s).
                  Deleting this tab will return them to <strong>All</strong> and reset their credit treatment to <strong>Charged</strong>.
                </>
              ) : (
                `Are you sure you want to delete the "${tabToDelete?.label}" tab?`
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTabToDelete(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (tabToDelete) {
                  handleDeleteTab(tabToDelete.key);
                  setTabToDelete(null);
                }
              }}
              className="text-xs"
            >
              Delete Tab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
