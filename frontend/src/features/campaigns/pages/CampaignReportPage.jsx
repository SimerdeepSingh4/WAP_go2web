import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/api/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { number } from "@/features/admin/lib/format";
import { toast } from "@/components/ui/toast";

import CampaignReportHeader from "../components/report/CampaignReportHeader";
import AdminCampaignReportEditor from "../components/report/AdminCampaignReportEditor";
import PublishedSpreadsheetReport from "../components/report/PublishedSpreadsheetReport";
import PendingCampaignReport from "../components/report/PendingCampaignReport";
import ReportLoadError from "../components/report/ReportLoadError";
import CampaignReportMetrics from "../components/report/CampaignReportMetrics";
import CampaignReportDistribution from "../components/report/CampaignReportDistribution";
import UnassignedNumbersWarning from "../components/report/UnassignedNumbersWarning";
import CampaignReportBuckets from "../components/report/CampaignReportBuckets";
import CampaignReportNotes from "../components/report/CampaignReportNotes";
import UnsavedChangesBar from "../components/report/UnsavedChangesBar";
import AddCategoryModal from "../components/report/AddCategoryModal";

const DEFAULT_CATEGORIES = [
  { id: "successful", name: "Successful / Delivered", billingAction: "deduct" },
  { id: "duplicate", name: "Duplicate Numbers", billingAction: "refund" },
  { id: "spam", name: "Spam Numbers", billingAction: "refund" },
  { id: "not_on_whatsapp", name: "Not on WhatsApp", billingAction: "refund" },
  { id: "wrong_number", name: "Wrong Number", billingAction: "refund" },
];

const digits = (v) => String(v ?? "").replace(/\D/g, "");
const slug = (s) => String(s).toLowerCase().replace(/\W+/g, "_");

/* Pure: build the editable state from a campaign (used on load and on "Discard") */
function buildInitial(campaign) {
  const adminNotes = campaign.campaignSummary?.adminNotes || "";
  const status = campaign.status || "completed";
  const savedCats = campaign.campaignSummary?.categories || [];
  const records = campaign.recipientReport?.records || [];

  let categories;

  if (savedCats.length > 0) {
    const cats = savedCats.map((c) => ({
      id: c.id || slug(c.name),
      name: c.name,
      billingAction: c.billingAction || "deduct",
      numbers: [],
    }));
    const byName = new Map(cats.map((c) => [c.name.toLowerCase(), c]));
    for (const rec of records) {
      const cat = byName.get((rec.category || "").toLowerCase());
      if (cat) cat.numbers.push(rec.phoneNumber);
      else if (cats[0]) cats[0].numbers.push(rec.phoneNumber);
    }
    categories = cats;
  } else if (records.length > 0) {
    const byName = new Map();
    for (const rec of records) {
      const name = rec.category || "Successful / Delivered";
      if (!byName.has(name)) {
        byName.set(name, {
          id: slug(name),
          name,
          billingAction: rec.billingAction || (/failed|spam|wrong|non/i.test(name) ? "refund" : "deduct"),
          numbers: [],
        });
      }
      byName.get(name).numbers.push(rec.phoneNumber);
    }
    categories = Array.from(byName.values());
  } else {
    const all = (campaign.recipients || []).map((r) => digits(r.phoneNumber));
    const dups = (campaign.recipientStats?.duplicatesList || []).map(digits);
    const dupSet = new Set(dups);
    const successful = all.filter((n) => n && !dupSet.has(n));
    categories = DEFAULT_CATEGORIES.map((c) => ({
      ...c,
      numbers: c.id === "successful" ? successful : c.id === "duplicate" ? [...dups] : [],
    }));
  }

  return { categories, adminNotes, status };
}

const snapshot = (categories, adminNotes, status) =>
  JSON.stringify({
    c: categories.map((c) => [c.id, c.name, c.billingAction, c.numbers]),
    n: adminNotes,
    s: status,
  });

export default function CampaignReportPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "Super Admin";

  const base = isAdmin ? "/admin" : user?.role === "Reseller" ? "/reseller" : "/user";

  const { data: campaign, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["campaign-report", id],
    queryFn: async () => {
      const res = await api.get(`/campaigns/${id}`);
      return res.data?.data;
    },
    staleTime: isAdmin ? 0 : 10_000,
    refetchOnMount: isAdmin ? "always" : true,
    refetchOnWindowFocus: !isAdmin,
  });

  const [categories, setCategories] = useState([]);
  const [adminNotes, setAdminNotes] = useState("");
  const [campaignStatus, setCampaignStatus] = useState("completed");
  const [baseline, setBaseline] = useState("");
  const [drafts, setDrafts] = useState({});
  const [expanded, setExpanded] = useState({});
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatBilling, setNewCatBilling] = useState("refund");

  const rate = campaign?.rateSnapshot || (campaign?.userId?.ratePerMsg > 0 ? campaign.userId.ratePerMsg : 12);

  const resetFromCampaign = useCallback(() => {
    if (!campaign || isAdmin) return;
    const init = buildInitial(campaign);
    setCategories(init.categories);
    setAdminNotes(init.adminNotes);
    setCampaignStatus(init.status);
    setBaseline(snapshot(init.categories, init.adminNotes, init.status));
  }, [campaign, isAdmin]);

  useEffect(() => {
    resetFromCampaign();
  }, [resetFromCampaign]);

  const isDirty = useMemo(
    () => isAdmin && baseline !== "" && snapshot(categories, adminNotes, campaignStatus) !== baseline,
    [isAdmin, baseline, categories, adminNotes, campaignStatus]
  );

  const allCampaignNumbers = useMemo(() => {
    if (!campaign) return [];
    const set = new Set();
    for (const r of campaign.recipients || []) {
      const c = digits(r.phoneNumber);
      if (c) set.add(c);
    }
    for (const d of campaign.recipientStats?.duplicatesList || []) {
      const c = digits(d);
      if (c) set.add(c);
    }
    return Array.from(set);
  }, [campaign]);

  const assignedSet = useMemo(() => {
    const set = new Set();
    for (const cat of categories) for (const n of cat.numbers || []) set.add(digits(n));
    return set;
  }, [categories]);

  const unassignedNumbers = useMemo(
    () => allCampaignNumbers.filter((n) => !assignedSet.has(n)),
    [allCampaignNumbers, assignedSet]
  );

  const metrics = useMemo(() => {
    let deduct = 0;
    let refund = 0;
    for (const cat of categories) {
      const count = (cat.numbers || []).length;
      if (cat.billingAction === "refund") refund += count;
      else deduct += count;
    }
    const initialCharged = campaign?.creditsDeducted || 0;
    const uncapped = refund * rate;
    const capped = initialCharged > 0 && uncapped > initialCharged;
    const targetRefund = capped ? initialCharged : uncapped;
    const previousRefund = campaign?.campaignSummary?.creditsRefunded || 0;
    return {
      totalAudience: deduct + refund,
      deduct,
      refund,
      uncapped,
      capped,
      targetRefund,
      previousRefund,
      delta: targetRefund - previousRefund,
      initialCharged,
      net: Math.max(0, initialCharged - targetRefund),
    };
  }, [categories, rate, campaign]);

  const saveMutation = useMutation({
    mutationFn: async (payload) => (await api.put(`/campaigns/${id}/report`, payload)).data,
    onSuccess: (data) => {
      toast.add({
        title: "Report saved",
        description: data.refundInfo
          ? `Credit adjustment applied: ${data.refundInfo.netRefundDelta > 0 ? "+" : ""}${data.refundInfo.netRefundDelta} credits`
          : "Campaign delivery metrics updated.",
        type: "success",
      });
      setBaseline(snapshot(categories, adminNotes, campaignStatus));
      queryClient.invalidateQueries({ queryKey: ["campaign-report", id] });
      queryClient.invalidateQueries({ queryKey: ["campaign", id] });
      queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (err) => {
      toast.add({ title: "Couldn't save report", description: err.message, type: "error" });
    },
  });

  const handleSaveReport = () =>
    saveMutation.mutate({
      categories: categories.map((c) => ({ id: c.id, name: c.name, billingAction: c.billingAction, numbers: c.numbers })),
      adminNotes,
      status: campaignStatus,
    });

  /* ---- Category helpers ---- */

  const toggleBilling = (catId) =>
    setCategories((prev) =>
      prev.map((c) => (c.id === catId ? { ...c, billingAction: c.billingAction === "refund" ? "deduct" : "refund" } : c))
    );

  const removeCategory = (catId) => {
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    setConfirmRemove(null);
  };

  const addCategory = () => {
    const name = newCatName.trim();
    if (!name) {
      toast.add({ title: "Enter a category name", type: "error" });
      return;
    }
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast.add({ title: "A category with this name already exists", type: "error" });
      return;
    }
    setCategories((prev) => [...prev, { id: `custom_${Date.now()}`, name, billingAction: newCatBilling, numbers: [] }]);
    setNewCatName("");
    setShowAddModal(false);
    toast.add({ title: `Added "${name}"`, type: "success" });
  };

  const addNumbers = (catId, rawText) => {
    const list = Array.from(new Set(rawText.split(/[\n,;\t\s]+/).map(digits).filter(Boolean)));
    if (!list.length) return;

    const known = new Set(allCampaignNumbers);
    const outside = list.filter((n) => !known.has(n)).length;
    const moved = list.filter((n) => assignedSet.has(n) && !categories.find((c) => c.id === catId)?.numbers.includes(n)).length;

    setCategories((prev) =>
      prev.map((c) => {
        if (c.id !== catId) return { ...c, numbers: c.numbers.filter((n) => !list.includes(n)) };
        return { ...c, numbers: Array.from(new Set([...c.numbers, ...list])) };
      })
    );
    setDrafts((p) => ({ ...p, [catId]: "" }));

    const parts = [`Added ${list.length} number${list.length === 1 ? "" : "s"}`];
    if (moved) parts.push(`${moved} moved from another bucket`);
    toast.add({
      title: parts.join(", "),
      description: outside ? `${outside} not part of this campaign. Check before saving.` : undefined,
      type: outside ? "warning" : "success",
    });
  };

  const removeNumber = (catId, num) =>
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, numbers: c.numbers.filter((n) => n !== num) } : c)));

  const assignAllUnassignedTo = (catId) => {
    if (!unassignedNumbers.length) return;
    setCategories((prev) => prev.map((c) => (c.id === catId ? { ...c, numbers: [...c.numbers, ...unassignedNumbers] } : c)));
    toast.add({ title: `Assigned ${unassignedNumbers.length} numbers`, type: "success" });
  };

  const exportCSV = () => {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["Phone Number", "Category", "Billing Action", "Credits Impact"]];
    for (const cat of categories) {
      for (const num of cat.numbers) {
        rows.push([`+${num}`, cat.name, cat.billingAction === "refund" ? "Refunded" : "Deducted", cat.billingAction === "refund" ? `+${rate}` : `-${rate}`]);
      }
    }
    const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campaign-report-${id}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ---------- Loading / error ---------- */

  if (isLoading) {
    return (
      <div className="portal-overview space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-32 bg-muted animate-pulse rounded-md" />
          <div className="h-8 w-96 max-w-full bg-muted animate-pulse rounded-md" />
        </div>
        <div className="portal-metrics">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="portal-card h-24 bg-muted/40 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-muted/40 animate-pulse rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !campaign) {
    return <ReportLoadError error={error} base={base} onRetry={() => refetch()} isRetrying={isFetching} />;
  }

  const isReportPublished = Boolean(
    campaign?.publishedSpreadsheet?.publishedAt ||
    campaign?.campaignSummary?.reportedAt ||
      (campaign?.campaignSummary?.categories?.length > 0 && campaign?.recipientReport?.records?.length > 0)
  );

  if (isAdmin) return <AdminCampaignReportEditor key={campaign._id} campaign={campaign} base={base} onRefresh={refetch} isRefreshing={isFetching} />;

  if (!isAdmin && !isReportPublished) {
    return (
      <PendingCampaignReport
        campaign={campaign}
        base={base}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />
    );
  }

  const q = digits(search);
  if (campaign.publishedSpreadsheet?.publishedAt) {
    return <PublishedSpreadsheetReport campaign={campaign} base={base} isAdmin={isAdmin} />;
  }
  const deltaLabel =
    metrics.delta > 0
      ? `+${number(metrics.delta)} credits refunded to wallet`
      : metrics.delta < 0
      ? `${number(Math.abs(metrics.delta))} credits debited from wallet`
      : "No wallet change";

  return (
    <div className="portal-overview space-y-6">
      {/* Header */}
      <CampaignReportHeader
        campaign={campaign}
        base={base}
        id={id}
        rate={rate}
        isAdmin={isAdmin}
        isDirty={isDirty}
        isSaving={saveMutation.isPending}
        onExportCSV={exportCSV}
        onSaveReport={handleSaveReport}
      />

      {/* KPIs */}
      <CampaignReportMetrics metrics={metrics} />

      {/* Distribution + billing summary */}
      <CampaignReportDistribution
        metrics={metrics}
        categories={categories}
        isAdmin={isAdmin}
        rate={rate}
        campaign={campaign}
        deltaLabel={deltaLabel}
      />

      {/* Unassigned warning */}
      <UnassignedNumbersWarning
        isAdmin={isAdmin}
        unassignedNumbers={unassignedNumbers}
        categories={categories}
        onAssignAll={assignAllUnassignedTo}
      />

      {/* Buckets */}
      <CampaignReportBuckets
        categories={categories}
        isAdmin={isAdmin}
        search={search}
        onSearchChange={setSearch}
        onOpenAddModal={() => setShowAddModal(true)}
        q={q}
        rate={rate}
        confirmRemove={confirmRemove}
        onSetConfirmRemove={setConfirmRemove}
        onRemoveCategory={removeCategory}
        onToggleBilling={toggleBilling}
        expanded={expanded}
        onToggleExpanded={(catId) => setExpanded((p) => ({ ...p, [catId]: !p[catId] }))}
        onRemoveNumber={removeNumber}
        drafts={drafts}
        onDraftChange={(catId, val) => setDrafts((p) => ({ ...p, [catId]: val }))}
        onAddNumbers={addNumbers}
      />

      {/* Admin or client notes */}
      <CampaignReportNotes
        isAdmin={isAdmin}
        adminNotes={adminNotes}
        onAdminNotesChange={setAdminNotes}
        campaignStatus={campaignStatus}
        onCampaignStatusChange={setCampaignStatus}
        campaign={campaign}
      />

      {/* Sticky unsaved-changes bar */}
      <UnsavedChangesBar
        isDirty={isDirty}
        deltaLabel={deltaLabel}
        onReset={resetFromCampaign}
        onSave={handleSaveReport}
        isSaving={saveMutation.isPending}
      />

      {/* Add-category modal */}
      <AddCategoryModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        name={newCatName}
        onNameChange={setNewCatName}
        billing={newCatBilling}
        onBillingChange={setNewCatBilling}
        onSubmit={addCategory}
      />
    </div>
  );
}
