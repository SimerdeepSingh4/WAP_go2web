import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/hooks/useAuth.js";
import {
  getCreditBalance,
  allocateCredits,
  reclaimCredits,
  getCreditTransactions,
  createAccount,
  getManagedUsers,
  createCampaign,
  getCampaigns,
  updateCampaignStatus,
  createTemplate,
  getTemplates,
  createGroup,
  getGroups,
  deleteGroup,
  createContact,
  getContacts,
  deleteContact,
  getDashboardStats,
  updateCampaignMetrics,
} from "../services/portalTest.api.js";
import CampaignPerformanceChart from "../../../components/dashboard/CampaignPerformanceChart.jsx";
import { Lock } from "lucide-react";

export default function TestControlPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const role = user?.role || "User";
  const isSuperAdmin = role === "Super Admin";
  const isReseller = role === "Reseller";
  const isManager = isSuperAdmin || isReseller;

  // Available tabs strictly based on role
  const getAvailableTabs = () => {
    const tabs = [];
    if (isManager) {
      tabs.push({ id: "credits", label: "Credit Allocation" });
      tabs.push({ id: "accounts", label: isSuperAdmin ? "Manage Accounts (Resellers & Users)" : "Manage Client Users" });
    } else {
      tabs.push({ id: "mycredits", label: "My Wallet & Usage" });
    }
    tabs.push({ id: "contacts", label: "Contacts & Groups" });
    tabs.push({ id: "campaigns", label: "WhatsApp Campaigns" });
    tabs.push({ id: "templates", label: "Message Templates" });
    tabs.push({ id: "analytics", label: "📈 Performance Chart" });
    return tabs;
  };

  const availableTabs = getAvailableTabs();
  const [activeTab, setActiveTab] = useState(availableTabs[0]?.id || "campaigns");

  // Form states
  const [newAccount, setNewAccount] = useState({
    username: "",
    email: "",
    password: "",
    role: "User",
    ratePerMsg: 12,
  });
  const [creditAlloc, setCreditAlloc] = useState({
    toUserId: "",
    amount: "",
    notes: "",
  });
  const [confirmTransferModal, setConfirmTransferModal] = useState({
    isOpen: false,
    toUser: null,
    amount: "",
    notes: "",
    password: "",
  });
  const [creditReclaim, setCreditReclaim] = useState({
    fromUserId: "",
    amount: "",
    notes: "",
  });
  const [newCampaign, setNewCampaign] = useState({
    campaignTitle: "",
    campaignDescription: "",
    messageBody: "",
    phoneNumbers: "",
  });
  const [newTpl, setNewTpl] = useState({
    title: "",
    description: "",
    body: "",
  });
  const [newGroup, setNewGroup] = useState({
    name: "",
    description: "",
  });
  const [newContact, setNewContact] = useState({
    name: "",
    phoneNumbers: "",
    groupId: "",
  });
  const [selectedGroupFilter, setSelectedGroupFilter] = useState("");
  const [inspectDuplicatesModal, setInspectDuplicatesModal] = useState({
    isOpen: false,
    campaignTitle: "",
    duplicatesList: [],
    invalidList: [],
  });

  // Super Admin delivery report modal state
  const [deliveryReportModal, setDeliveryReportModal] = useState({
    isOpen: false,
    campaignId: "",
    campaignTitle: "",
    sent: "",
    delivered: "",
    read: "",
    failed: "",
    adminNotes: "",
    status: "completed",
  });

  const [statusMsg, setStatusMsg] = useState("");

  // Queries (only enabled for roles that are allowed to make them)
  const { data: dashboardStatsData, isLoading: isDashboardLoading } = useQuery({
    queryKey: ["dashboardStats"],
    queryFn: () => getDashboardStats(),
    refetchInterval: 5000,
  });

  const { data: balanceData } = useQuery({
    queryKey: ["myBalance"],
    queryFn: () => getCreditBalance(),
    refetchInterval: 3000,
  });

  const { data: managedUsersData } = useQuery({
    queryKey: ["managedUsers"],
    queryFn: () => getManagedUsers(),
    enabled: isManager,
  });

  const { data: txData } = useQuery({
    queryKey: ["creditTransactions"],
    queryFn: () => getCreditTransactions(),
  });

  const { data: campaignsData } = useQuery({
    queryKey: ["campaignsList"],
    queryFn: () => getCampaigns(),
  });

  const { data: templatesData } = useQuery({
    queryKey: ["templatesList"],
    queryFn: () => getTemplates(),
  });

  const { data: groupsData } = useQuery({
    queryKey: ["groupsList"],
    queryFn: () => getGroups(),
  });

  const { data: contactsData } = useQuery({
    queryKey: ["contactsList", selectedGroupFilter],
    queryFn: () => getContacts(selectedGroupFilter),
  });

  // Mutations
  const createAccountMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: (res) => {
      setStatusMsg(`Account created: ${res.user.username} (${res.user.role}) - Rate: ${res.user.ratePerMsg ?? 12}/msg`);
      setNewAccount({ username: "", email: "", password: "", role: "User", ratePerMsg: 12 });
      queryClient.invalidateQueries({ queryKey: ["managedUsers"] });
    },
    onError: (err) => setStatusMsg(`Error: ${err.message}`),
  });

  const allocateMutation = useMutation({
    mutationFn: allocateCredits,
    onSuccess: (res) => {
      setStatusMsg(`Success: ${res.message}`);
      setCreditAlloc({ toUserId: "", amount: "", notes: "" });
      setConfirmTransferModal({ isOpen: false, toUser: null, amount: "", notes: "", password: "" });
      queryClient.invalidateQueries({ queryKey: ["myBalance"] });
      queryClient.invalidateQueries({ queryKey: ["creditTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["managedUsers"] });
    },
    onError: (err) => {
      setStatusMsg(`Error: ${err.message}`);
    },
  });

  const reclaimMutation = useMutation({
    mutationFn: reclaimCredits,
    onSuccess: (res) => {
      setStatusMsg(`Success: ${res.message}`);
      setCreditReclaim({ fromUserId: "", amount: "", notes: "" });
      queryClient.invalidateQueries({ queryKey: ["myBalance"] });
      queryClient.invalidateQueries({ queryKey: ["creditTransactions"] });
      queryClient.invalidateQueries({ queryKey: ["managedUsers"] });
    },
    onError: (err) => setStatusMsg(`Error: ${err.message}`),
  });

  const campaignMutation = useMutation({
    mutationFn: (data) => {
      const recipientList = data.phoneNumbers
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0)
        .map((phoneNumber) => ({ phoneNumber }));

      return createCampaign({
        campaignTitle: data.campaignTitle,
        campaignDescription: data.campaignDescription,
        messageBody: data.messageBody,
        recipients: recipientList,
      });
    },
    onSuccess: (res) => {
      const deductText = res.creditDeduction ? ` (Deducted ${res.creditDeduction.amount} credits, balance: ${res.creditDeduction.remainingBalance})` : "";
      const dupText = res.duplicateStats?.duplicatesFound > 0 ? ` [${res.duplicateStats.duplicatesFound} duplicates removed]` : "";
      const invText = res.duplicateStats?.invalidNumbers?.length > 0 ? ` ⚠️ Invalid entries rejected: ${res.duplicateStats.invalidNumbers.join(", ")}` : "";
      setStatusMsg(`Campaign launched: ${res.data.campaignTitle} (${res.data.totalRecipients} unique recipients)${dupText}${invText}${deductText}`);
      setNewCampaign({ campaignTitle: "", campaignDescription: "", messageBody: "", phoneNumbers: "" });
      queryClient.invalidateQueries({ queryKey: ["campaignsList"] });
      queryClient.invalidateQueries({ queryKey: ["myBalance"] });
      queryClient.invalidateQueries({ queryKey: ["creditTransactions"] });
    },
    onError: (err) => setStatusMsg(`Error: ${err.message}`),
  });

  const templateMutation = useMutation({
    mutationFn: createTemplate,
    onSuccess: (res) => {
      setStatusMsg(`Template created: ${res.data.title}`);
      setNewTpl({ title: "", description: "", body: "" });
      queryClient.invalidateQueries({ queryKey: ["templatesList"] });
    },
    onError: (err) => setStatusMsg(`Error: ${err.message}`),
  });

  const updateStatusMutation = useMutation({
    mutationFn: updateCampaignStatus,
    onSuccess: (res) => {
      setStatusMsg(`Success: ${res.message}`);
      queryClient.invalidateQueries({ queryKey: ["campaignsList"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
    onError: (err) => setStatusMsg(`Error updating status: ${err.message}`),
  });

  const updateMetricsMutation = useMutation({
    mutationFn: updateCampaignMetrics,
    onSuccess: (res) => {
      setStatusMsg(`Delivery report recorded: ${res.message}`);
      setDeliveryReportModal({
        isOpen: false,
        campaignId: "",
        campaignTitle: "",
        sent: "",
        delivered: "",
        read: "",
        failed: "",
        adminNotes: "",
        status: "completed",
      });
      queryClient.invalidateQueries({ queryKey: ["campaignsList"] });
      queryClient.invalidateQueries({ queryKey: ["dashboardStats"] });
    },
    onError: (err) => setStatusMsg(`Error recording delivery report: ${err.message}`),
  });

  const createGroupMutation = useMutation({
    mutationFn: createGroup,
    onSuccess: (res) => {
      setStatusMsg(`Group created: ${res.data.name}`);
      setNewGroup({ name: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ["groupsList"] });
    },
    onError: (err) => setStatusMsg(`Error: ${err.message}`),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: deleteGroup,
    onSuccess: (res) => {
      setStatusMsg(res.message);
      queryClient.invalidateQueries({ queryKey: ["groupsList"] });
      queryClient.invalidateQueries({ queryKey: ["contactsList"] });
    },
    onError: (err) => setStatusMsg(`Error: ${err.message}`),
  });

  const createContactMutation = useMutation({
    mutationFn: createContact,
    onSuccess: (res) => {
      setStatusMsg(res.message);
      setNewContact({ name: "", phoneNumbers: "", groupId: "" });
      queryClient.invalidateQueries({ queryKey: ["contactsList"] });
      queryClient.invalidateQueries({ queryKey: ["groupsList"] });
    },
    onError: (err) => setStatusMsg(`Error: ${err.message}`),
  });

  const deleteContactMutation = useMutation({
    mutationFn: deleteContact,
    onSuccess: (res) => {
      setStatusMsg(res.message);
      queryClient.invalidateQueries({ queryKey: ["contactsList"] });
      queryClient.invalidateQueries({ queryKey: ["groupsList"] });
    },
    onError: (err) => setStatusMsg(`Error: ${err.message}`),
  });

  const managedUsers = managedUsersData?.users || [];
  const transactions = txData?.transactions || txData?.data || [];
  const campaigns = campaignsData?.data || campaignsData?.campaigns || [];
  const templates = templatesData?.data || templatesData?.templates || [];
  const groups = groupsData?.data || [];
  const contacts = contactsData?.data || [];
  const myBalance = balanceData?.wallet?.balance ?? balanceData?.data?.balance ?? 0;
  const isLocked = Boolean(balanceData?.wallet?.isLocked);
  const stats = dashboardStatsData?.stats;

  return (
    <div className="mt-8 rounded-xl border border-[var(--background)] bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--background)] pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full ${
                isSuperAdmin
                  ? "bg-purple-100 text-purple-800"
                  : isReseller
                  ? "bg-blue-100 text-blue-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {role} Console
            </span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {isSuperAdmin
                ? "Full Platform Access"
                : isReseller
                ? "Reseller & Client Control"
                : "Customer Messaging Workspace"}
            </span>
          </div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">
            Workspace Controls
          </h2>
        </div>

        {/* Live balance badge */}
        <div className="flex items-center gap-2 rounded-lg bg-[var(--muted)] px-3.5 py-1.5 border border-[var(--border)]">
          <span className="text-xs font-medium text-[var(--foreground)]">Available Credits:</span>
          <span className="text-base font-bold text-[var(--primary)]">
            {isSuperAdmin ? "Unlimited" : myBalance}
          </span>
        </div>
      </div>

      {statusMsg && (
        <div className="my-4 rounded-lg bg-[var(--muted)] border border-[var(--border)] p-3 text-xs font-semibold text-[var(--primary)] flex items-center justify-between">
          <span>{statusMsg}</span>
          <button
            onClick={() => setStatusMsg("")}
            className="text-[11px] underline cursor-pointer text-[var(--primary)]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TOP DASHBOARD SUMMARY METRICS CARDS */}
      <div className="pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--primary)] flex items-center gap-1.5">
            <span>Dashboard Overview</span>
            {isDashboardLoading && (
              <span className="size-2 rounded-full bg-[var(--primary)] animate-ping inline-block" />
            )}
          </h3>
          <span className="text-[10px] text-[var(--muted-foreground)]">Live Metrics</span>
        </div>

        {/* 1. Super Admin Summary Cards */}
        {isSuperAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>Total Platform Users</span>
                <span className="text-base">👥</span>
              </div>
              <div className="text-2xl font-black text-[var(--foreground)]">
                {stats?.accounts?.totalUsers ?? 0}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                +{stats?.accounts?.totalResellers ?? 0} Resellers ({stats?.accounts?.totalPlatformAccounts ?? 0} total)
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>Active Resellers</span>
                <span className="text-base">🏢</span>
              </div>
              <div className="text-2xl font-black text-[var(--primary)]">
                {stats?.accounts?.activeResellers ?? 0}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                Out of {stats?.accounts?.totalResellers ?? 0} registered
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>Credits in Circulation</span>
                <span className="text-base">💳</span>
              </div>
              <div className="text-2xl font-black text-[var(--foreground)]">
                {stats?.credits?.totalCreditsInCirculation?.toLocaleString() ?? 0}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                Allocated: {stats?.credits?.totalAllocatedBySuperAdmin?.toLocaleString() ?? 0}
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>Total Messages Sent/Deliv.</span>
                <span className="text-base">🚀</span>
              </div>
              <div className="text-2xl font-black text-[var(--primary)]">
                {stats?.campaigns?.totalMessagesSent?.toLocaleString() ?? 0}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1 flex items-center gap-1.5">
                <span className="text-emerald-700 font-semibold">✓ {stats?.campaigns?.totalMessagesDelivered?.toLocaleString() ?? 0} deliv.</span>
                <span>•</span>
                <span className="text-rose-700">✗ {stats?.campaigns?.totalMessagesFailed?.toLocaleString() ?? 0} fail</span>
              </div>
            </div>
          </div>
        )}

        {/* 2. Reseller Summary Cards */}
        {isReseller && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>My Balance</span>
                <span className="text-base">💰</span>
              </div>
              <div className="text-2xl font-black text-[var(--primary)]">
                {stats?.wallet?.myBalance?.toLocaleString() ?? 0}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                Available to distribute to clients
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>Total Clients</span>
                <span className="text-base">👥</span>
              </div>
              <div className="text-2xl font-black text-[var(--foreground)]">
                {stats?.clients?.totalClients ?? 0}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                {stats?.clients?.activeClients ?? 0} active client account(s)
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>Credits Distributed</span>
                <span className="text-base">🤝</span>
              </div>
              <div className="text-2xl font-black text-[var(--foreground)]">
                {stats?.wallet?.creditsDistributedToClients?.toLocaleString() ?? 0}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                Client wallets: {stats?.wallet?.clientWalletsTotal?.toLocaleString() ?? 0}
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>Client Messages Sent</span>
                <span className="text-base">📨</span>
              </div>
              <div className="text-2xl font-black text-[var(--primary)]">
                {stats?.campaigns?.clientMessagesSent?.toLocaleString() ?? 0}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1 flex items-center gap-1.5">
                <span className="text-emerald-700 font-semibold">✓ {stats?.campaigns?.clientMessagesDelivered?.toLocaleString() ?? 0} deliv.</span>
                <span>•</span>
                <span className="text-rose-700">✗ {stats?.campaigns?.clientMessagesFailed?.toLocaleString() ?? 0} fail</span>
              </div>
            </div>
          </div>
        )}

        {/* 3. User Summary Cards */}
        {!isSuperAdmin && !isReseller && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>My Balance</span>
                <span className="text-base">💳</span>
              </div>
              <div className="text-2xl font-black text-[var(--primary)]">
                {stats?.wallet?.myBalance?.toLocaleString() ?? 0}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                ~{stats?.wallet?.messagesRemaining ?? 0} msgs (@ {stats?.wallet?.ratePerMsg ?? 12} cr)
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>Messages Sent</span>
                <span className="text-base">📤</span>
              </div>
              <div className="text-2xl font-black text-[var(--foreground)]">
                {stats?.campaigns?.messagesSent?.toLocaleString() ?? 0}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                {stats?.campaigns?.totalRecipients?.toLocaleString() ?? 0} recipients requested
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>Delivered / Failed</span>
                <span className="text-base">✅</span>
              </div>
              <div className="text-2xl font-black text-[var(--primary)]">
                {stats?.campaigns?.messagesDelivered?.toLocaleString() ?? 0}
                <span className="text-sm font-normal text-rose-700 ml-1.5">
                  / {stats?.campaigns?.messagesFailed?.toLocaleString() ?? 0} fail
                </span>
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                Read: {stats?.campaigns?.messagesRead?.toLocaleString() ?? 0} recipient(s)
              </div>
            </div>

            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-gradient-to-br from-white to-[var(--background)] shadow-xs">
              <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] mb-1">
                <span>Total Contacts</span>
                <span className="text-base">📇</span>
              </div>
              <div className="text-2xl font-black text-[var(--foreground)]">
                {stats?.assets?.totalContacts ?? 0}
              </div>
              <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
                Across {stats?.assets?.totalGroups ?? 0} group(s)
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Role-Specific Navigation Tabs */}
      <div className="flex flex-wrap gap-2 pt-4 pb-6">
        {availableTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
              activeTab === tab.id
                ? "bg-[var(--primary)] text-white"
                : "bg-[#f4f6ef] text-[var(--primary)] hover:bg-[#e7ebd9]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: PERFORMANCE CHART (Exact visual match from preview) */}
      {activeTab === "analytics" && (
        <div className="space-y-4">
          <CampaignPerformanceChart
            title="Revenue & Dispatch Trajectory"
            primaryLabel="Revenue ($)"
            secondaryLabel="Costs ($)"
            y1={14000}
            y2={19000}
          />
        </div>
      )}

      {/* TAB 1: CREDIT ALLOCATION (Super Admin & Reseller ONLY) */}
      {isManager && activeTab === "credits" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 1. Allocate Credits */}
            <div className="rounded-lg bg-[#faf8f5] border border-[var(--background)] p-4">
              <h3 className="text-sm font-bold text-[var(--foreground)] mb-1">
                Allocate Credits
              </h3>
              <p className="text-[11px] text-[#6b7b64] mb-3">
                {isSuperAdmin ? "Super Admin → Transfer credits to Reseller or User" : "Reseller → Transfer from your wallet to Client"}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = managedUsers.find((u) => u._id === creditAlloc.toUserId);
                  if (!target) return;
                  setConfirmTransferModal({
                    isOpen: true,
                    toUser: target,
                    amount: creditAlloc.amount,
                    notes: creditAlloc.notes,
                    password: "",
                  });
                }}
                className="space-y-2.5"
              >
                <select
                  required
                  value={creditAlloc.toUserId}
                  onChange={(e) => setCreditAlloc({ ...creditAlloc, toUserId: e.target.value })}
                  className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                >
                  <option value="">Select Recipient User...</option>
                  {managedUsers.map((u) => (
                    <option key={u._id} value={u._id}>
                      {u.username} ({u.role}) - Rate: {u.ratePerMsg ?? 12}/msg
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="Credits amount"
                    value={creditAlloc.amount}
                    onChange={(e) => setCreditAlloc({ ...creditAlloc, amount: e.target.value })}
                    className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={creditAlloc.notes}
                    onChange={(e) => setCreditAlloc({ ...creditAlloc, notes: e.target.value })}
                    className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={allocateMutation.isPending}
                  className="w-full bg-[var(--primary)] text-white text-xs font-semibold rounded p-2 hover:bg-[#1f3f2d] cursor-pointer disabled:opacity-50"
                >
                  Review & Confirm Transfer →
                </button>
              </form>
            </div>

            {/* 2. Reclaim (Super Admin Only) OR Irreversible Policy Notice (Reseller) */}
            {isSuperAdmin ? (
              <div className="rounded-lg bg-[#fefbf6] border border-[#ecd9be] p-4">
                <h3 className="text-sm font-bold text-[#7d5018] mb-1">
                  Administrative Reclaim (Super Admin Only)
                </h3>
                <p className="text-[11px] text-[#8e6e44] mb-3">
                  Emergency administrative reversal for verified billing disputes.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    reclaimMutation.mutate({
                      fromUserId: creditReclaim.fromUserId,
                      amount: Number(creditReclaim.amount),
                      notes: creditReclaim.notes,
                    });
                  }}
                  className="space-y-2.5"
                >
                  <select
                    required
                    value={creditReclaim.fromUserId}
                    onChange={(e) => setCreditReclaim({ ...creditReclaim, fromUserId: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-[#e2cca9] bg-white"
                  >
                    <option value="">Select User to Reclaim From...</option>
                    {managedUsers.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.username} ({u.role}) - Rate: {u.ratePerMsg ?? 12}/msg
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min="1"
                      required
                      placeholder="Credits to pull back"
                      value={creditReclaim.amount}
                      onChange={(e) => setCreditReclaim({ ...creditReclaim, amount: e.target.value })}
                      className="text-xs p-2 rounded border border-[#e2cca9] bg-white"
                    />
                    <input
                      type="text"
                      placeholder="Audit Reason / Dispute ID"
                      required
                      value={creditReclaim.notes}
                      onChange={(e) => setCreditReclaim({ ...creditReclaim, notes: e.target.value })}
                      className="text-xs p-2 rounded border border-[#e2cca9] bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={reclaimMutation.isPending}
                    className="w-full bg-[#9a5b18] text-white text-xs font-semibold rounded p-2 hover:bg-[#7e4912] cursor-pointer disabled:opacity-50"
                  >
                    {reclaimMutation.isPending ? "Processing Reversal..." : "Execute Admin Reversal"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="rounded-lg bg-[#f4f7f1] border border-[#d3dfcd] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-base">🔒</span>
                    <h3 className="text-sm font-bold text-[var(--foreground)]">
                      Irreversible Allocation Policy
                    </h3>
                  </div>
                  <p className="text-xs text-[#526348] leading-relaxed mb-3">
                    To eliminate fraud and protect clients against unauthorized balance withdrawals, all credit allocations from Resellers are <strong>permanent and non-reversible</strong>.
                  </p>
                  <div className="text-[11px] bg-white p-2.5 rounded border border-[#dce6d6] text-[#48593e] space-y-1">
                    <p>✓ Double-confirmation and password verification protect against typos.</p>
                    <p>✓ Always verify the recipient and credit quantity before sending.</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-[#d8e3d2] text-[11px] text-[#788870]">
                  Offline billing dispute? Contact Super Admin for verified administrative arbitration.
                </div>
              </div>
            )}
          </div>

          {/* Transaction History */}
          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-2">
              Credit Transfer Audit Log ({transactions.length})
            </h3>
            <div className="overflow-x-auto rounded-lg border border-[var(--background)]">
              <table className="w-full text-left text-xs text-[#3b4735]">
                <thead className="bg-[#f0f4ea] text-[11px] font-semibold uppercase text-[#54644a]">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">From</th>
                    <th className="p-2.5">To</th>
                    <th className="p-2.5">Amount</th>
                    <th className="p-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1e7]">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-4 text-center text-[#75846b]">
                        No transactions recorded yet.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => {
                      const typeBadge =
                        tx.type === "ALLOCATE"
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : tx.type === "RECLAIM"
                          ? "bg-amber-100 text-amber-800 border-amber-300"
                          : tx.type === "DEDUCT"
                          ? "bg-rose-100 text-rose-800 border-rose-300"
                          : "bg-blue-100 text-blue-800 border-blue-300";

                      return (
                        <tr key={tx._id} className="hover:bg-[#faf8f5]">
                          <td className="p-2.5 text-[11px] whitespace-nowrap">
                            {new Date(tx.createdAt).toLocaleTimeString()}
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${typeBadge}`}>
                              {tx.type}
                            </span>
                          </td>
                          <td className="p-2.5">{tx.fromUser?.username || (tx.type === "ALLOCATE" ? "Super Admin" : "—")}</td>
                          <td className="p-2.5 font-medium">{tx.toUser?.username || "Self"}</td>
                          <td className="p-2.5 font-bold">{tx.amount}</td>
                          <td className="p-2.5 text-[#6c7b64]">{tx.notes || "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB FOR REGULAR USERS: WALLET & USAGE */}
      {!isManager && activeTab === "mycredits" && (
        <div className="space-y-4">
          <div className={`p-5 rounded-lg border flex flex-wrap items-center justify-between gap-4 ${
            isLocked
              ? "bg-red-50 border-red-300"
              : "bg-[var(--muted)] border-[var(--border)]"
          }`}>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${isLocked ? "text-red-700" : "text-[#546848]"}`}>
                Your Balance {isLocked && "(Expired & Locked)"}
              </p>
              <h3 className={`text-3xl font-bold mt-1 flex items-center gap-2 ${isLocked ? "text-red-600" : "text-[var(--primary)]"}`}>
                {isLocked && <Lock className="size-6 text-red-600" />}
                {myBalance} Credits
              </h3>
              <p className={`text-xs mt-1 ${isLocked ? "text-red-600 font-semibold" : "text-[#6e7d64]"}`}>
                {isLocked
                  ? `Your credits expired on ${balanceData?.wallet?.expiresAt ? new Date(balanceData.wallet.expiresAt).toLocaleDateString() : "earlier"}. Balance is locked from sending messages until renewed.`
                  : "Each message sent consumes credits from your balance."}
              </p>
            </div>
            <div className={`text-xs p-3 rounded-lg border ${
              isLocked
                ? "bg-white text-red-800 border-red-200"
                : "text-[#526348] bg-white border-[#dde6d4]"
            }`}>
              {isLocked
                ? "Contact your administrator or reseller to renew your credit balance."
                : "Need more credits? Contact your reseller to recharge your account balance."}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-2">My Credit History</h3>
            <div className="overflow-x-auto rounded-lg border border-[var(--background)]">
              <table className="w-full text-left text-xs text-[#3b4735]">
                <thead className="bg-[#f0f4ea] text-[11px] font-semibold uppercase text-[#54644a]">
                  <tr>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Activity</th>
                    <th className="p-2.5">Amount</th>
                    <th className="p-2.5">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1e7]">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="p-4 text-center text-[#75846b]">No credit activity yet.</td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr key={tx._id} className="hover:bg-[#faf8f5]">
                        <td className="p-2.5">{new Date(tx.createdAt).toLocaleDateString()}</td>
                        <td className="p-2.5 font-semibold text-[var(--primary)]">{tx.type}</td>
                        <td className="p-2.5 font-bold">{tx.amount}</td>
                        <td className="p-2.5 text-[#6c7b64]">{tx.notes || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MANAGE ACCOUNTS (Super Admin & Reseller ONLY) */}
      {isManager && activeTab === "accounts" && (
        <div className="space-y-6">
          <div className="rounded-lg bg-[#faf8f5] border border-[var(--background)] p-4">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-2">
              Create New Account ({isSuperAdmin ? "Create Resellers or Users" : "Create Client Users"})
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                createAccountMutation.mutate(newAccount);
              }}
              className="grid grid-cols-1 sm:grid-cols-6 gap-3"
            >
              <input
                type="text"
                required
                placeholder="Username"
                value={newAccount.username}
                onChange={(e) => setNewAccount({ ...newAccount, username: e.target.value })}
                className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
              />
              <input
                type="email"
                required
                placeholder="Email"
                value={newAccount.email}
                onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })}
                className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
              />
              <input
                type="password"
                required
                placeholder="Password"
                value={newAccount.password}
                onChange={(e) => setNewAccount({ ...newAccount, password: e.target.value })}
                className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
              />

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Rate/Msg (default 12)"
                value={newAccount.ratePerMsg}
                onChange={(e) => setNewAccount({ ...newAccount, ratePerMsg: e.target.value })}
                className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
              />

              {isSuperAdmin ? (
                <select
                  value={newAccount.role}
                  onChange={(e) => setNewAccount({ ...newAccount, role: e.target.value })}
                  className="text-xs p-2 rounded border border-[#cfd6c7] bg-white font-medium"
                >
                  <option value="Reseller">Role: Reseller</option>
                  <option value="User">Role: User</option>
                </select>
              ) : (
                <span className="text-xs p-2 rounded border border-[#cfd6c7] bg-stone-100 text-[var(--primary)] flex items-center">
                  Role: User (Client)
                </span>
              )}

              <button
                type="submit"
                disabled={createAccountMutation.isPending}
                className="bg-[var(--primary)] text-white text-xs font-semibold rounded p-2 hover:bg-[#1f3f2d] cursor-pointer disabled:opacity-50"
              >
                {createAccountMutation.isPending ? "Creating..." : "+ Add Account"}
              </button>
            </form>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-2">
              {isSuperAdmin ? "All System Users" : "Clients Assigned To You"} ({managedUsers.length})
            </h3>
            <div className="overflow-x-auto rounded-lg border border-[var(--background)]">
              <table className="w-full text-left text-xs text-[#3b4735]">
                <thead className="bg-[#f0f4ea] text-[11px] font-semibold uppercase text-[#54644a]">
                  <tr>
                    <th className="p-2.5">Username</th>
                    <th className="p-2.5">Email</th>
                    <th className="p-2.5">Role</th>
                    <th className="p-2.5">Rate / Msg</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">User ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1e7]">
                  {managedUsers.map((u) => (
                    <tr key={u._id} className="hover:bg-[#faf8f5]">
                      <td className="p-2.5 font-bold">{u.username}</td>
                      <td className="p-2.5 text-[#5e6d56]">{u.email}</td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            u.role === "Reseller"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="p-2.5 font-medium text-[var(--foreground)]">{u.ratePerMsg ?? 12} credits</td>
                      <td className="p-2.5">{u.status}</td>
                      <td className="p-2.5 font-mono text-[10px] text-[var(--muted-foreground)]">{u._id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB: CONTACTS & GROUPS (Visible to ALL roles) */}
      {activeTab === "contacts" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 1. GROUPS SECTION */}
            <div className="space-y-4">
              <div className="rounded-lg bg-[#faf8f5] border border-[var(--background)] p-4">
                <h3 className="text-sm font-bold text-[var(--foreground)] mb-1">
                  Create Contact Group
                </h3>
                <p className="text-[11px] text-[#6b7b64] mb-3">
                  Organize your audience for targeted WhatsApp campaigns.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createGroupMutation.mutate(newGroup);
                  }}
                  className="space-y-2.5"
                >
                  <input
                    type="text"
                    required
                    placeholder="Group Name (e.g. VIP Customers, Reseller Leads)"
                    value={newGroup.name}
                    onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={newGroup.description}
                    onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                  />
                  <button
                    type="submit"
                    disabled={createGroupMutation.isPending}
                    className="w-full bg-[var(--primary)] text-white text-xs font-semibold rounded p-2 hover:bg-[#1f3f2d] cursor-pointer disabled:opacity-50"
                  >
                    {createGroupMutation.isPending ? "Creating Group..." : "+ Create Group"}
                  </button>
                </form>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)] mb-2">
                  Contact Groups ({groups.length})
                </h3>
                <div className="overflow-x-auto rounded-lg border border-[var(--background)]">
                  <table className="w-full text-left text-xs text-[#3b4735]">
                    <thead className="bg-[#f0f4ea] text-[11px] font-semibold uppercase text-[#54644a]">
                      <tr>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Contacts</th>
                        <th className="p-2.5">Owner</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1e7]">
                      {groups.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="p-4 text-center text-[#75846b]">
                            No groups created yet.
                          </td>
                        </tr>
                      ) : (
                        groups.map((g) => (
                          <tr key={g._id} className="hover:bg-[#faf8f5]">
                            <td className="p-2.5 font-bold text-[#283823]">
                              {g.name}
                              {g.description && (
                                <span className="block font-normal text-[10px] text-[#6e7d66]">
                                  {g.description}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 font-semibold text-[var(--primary)]">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {g.totalContacts ?? 0} contact(s)
                              </span>
                            </td>
                            <td className="p-2.5 text-[#5f6f57] text-[11px]">
                              {g.userId?.username || "You"}
                            </td>
                            <td className="p-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Delete group "${g.name}"?`)) {
                                    deleteGroupMutation.mutate(g._id);
                                  }
                                }}
                                className="text-[10px] text-red-600 hover:text-red-800 font-semibold cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* 2. CONTACTS SECTION */}
            <div className="space-y-4">
              <div className="rounded-lg bg-[#faf8f5] border border-[var(--background)] p-4">
                <h3 className="text-sm font-bold text-[var(--foreground)] mb-1">
                  Add Contacts
                </h3>
                <p className="text-[11px] text-[#6b7b64] mb-3">
                  Add single or bulk phone numbers (comma or newline separated).
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createContactMutation.mutate(newContact);
                  }}
                  className="space-y-2.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Contact Name (optional)"
                      value={newContact.name}
                      onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                      className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                    />
                    <select
                      value={newContact.groupId}
                      onChange={(e) => setNewContact({ ...newContact, groupId: e.target.value })}
                      className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                    >
                      <option value="">No Group (Unassigned)</option>
                      {groups.map((g) => (
                        <option key={g._id} value={g._id}>
                          Group: {g.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <textarea
                    required
                    rows="2"
                    placeholder="Phone Numbers (e.g. 919876543210, 919876543211 or paste list)"
                    value={newContact.phoneNumbers}
                    onChange={(e) => setNewContact({ ...newContact, phoneNumbers: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                  />

                  <button
                    type="submit"
                    disabled={createContactMutation.isPending}
                    className="w-full bg-[var(--primary)] text-white text-xs font-semibold rounded p-2 hover:bg-[#1f3f2d] cursor-pointer disabled:opacity-50"
                  >
                    {createContactMutation.isPending ? "Adding Contacts..." : "+ Add Contacts"}
                  </button>
                </form>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-sm font-bold text-[var(--foreground)]">
                    Contacts List ({contacts.length})
                  </h3>
                  <select
                    value={selectedGroupFilter}
                    onChange={(e) => setSelectedGroupFilter(e.target.value)}
                    className="text-xs p-1 rounded border border-[#cfd6c7] bg-white"
                  >
                    <option value="">All Contacts (Any Group)</option>
                    {groups.map((g) => (
                      <option key={g._id} value={g._id}>
                        Filter: {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="overflow-x-auto rounded-lg border border-[var(--background)]">
                  <table className="w-full text-left text-xs text-[#3b4735]">
                    <thead className="bg-[#f0f4ea] text-[11px] font-semibold uppercase text-[#54644a]">
                      <tr>
                        <th className="p-2.5">Name</th>
                        <th className="p-2.5">Phone Number</th>
                        <th className="p-2.5">Group</th>
                        <th className="p-2.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1e7]">
                      {contacts.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="p-4 text-center text-[#75846b]">
                            No contacts found.
                          </td>
                        </tr>
                      ) : (
                        contacts.map((c) => (
                          <tr key={c._id} className="hover:bg-[#faf8f5]">
                            <td className="p-2.5 font-medium">{c.name || "—"}</td>
                            <td className="p-2.5 font-mono text-[11px] font-bold text-[#273822]">
                              {c.phoneNumber}
                            </td>
                            <td className="p-2.5">
                              {c.groupId?.name ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                                  {c.groupId.name}
                                </span>
                              ) : (
                                <span className="text-[10px] text-stone-400">None</span>
                              )}
                            </td>
                            <td className="p-2.5 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Delete contact ${c.phoneNumber}?`)) {
                                    deleteContactMutation.mutate(c._id);
                                  }
                                }}
                                className="text-[10px] text-red-600 hover:text-red-800 font-semibold cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CAMPAIGNS (Visible to ALL roles) */}
      {activeTab === "campaigns" && (
        <div className="space-y-6">
          <div className="rounded-lg bg-[#faf8f5] border border-[var(--background)] p-4">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-2">
              Launch WhatsApp Blast
            </h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                campaignMutation.mutate(newCampaign);
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Campaign Title (e.g. Diwali Offer 2026)"
                  value={newCampaign.campaignTitle}
                  onChange={(e) => setNewCampaign({ ...newCampaign, campaignTitle: e.target.value })}
                  className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                />
                <input
                  type="text"
                  placeholder="Campaign Description (Optional)"
                  value={newCampaign.campaignDescription}
                  onChange={(e) => setNewCampaign({ ...newCampaign, campaignDescription: e.target.value })}
                  className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                />
              </div>

              <textarea
                required
                rows="2"
                placeholder="Message Body (e.g. Hello! Special 20% discount on all orders today.)"
                value={newCampaign.messageBody}
                onChange={(e) => setNewCampaign({ ...newCampaign, messageBody: e.target.value })}
                className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white"
              />

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-[var(--primary)]">
                  <label className="font-semibold">Recipients Phone Numbers:</label>
                  {groups.length > 0 && (
                    <select
                      onChange={async (e) => {
                        const groupId = e.target.value;
                        if (!groupId) return;
                        try {
                          const res = await getContacts(groupId);
                          const nums = (res.data || []).map((c) => c.phoneNumber).join(", ");
                          if (nums) {
                            setNewCampaign((prev) => ({
                              ...prev,
                              phoneNumbers: prev.phoneNumbers ? `${prev.phoneNumbers}, ${nums}` : nums,
                            }));
                          }
                        } catch (err) {
                          console.error("Error loading group contacts:", err);
                        }
                      }}
                      className="text-[10px] p-1 rounded border border-[#cfd6c7] bg-stone-50 cursor-pointer"
                    >
                      <option value="">⚡ Quick Import: Load From Group...</option>
                      {groups.map((g) => (
                        <option key={g._id} value={g._id}>
                          Group: {g.name} ({g.totalContacts ?? 0} contacts)
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="Recipients Phone Numbers (comma-separated, e.g. 919876543210, 919876543211)"
                  value={newCampaign.phoneNumbers}
                  onChange={(e) => setNewCampaign({ ...newCampaign, phoneNumbers: e.target.value })}
                  className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={campaignMutation.isPending}
                className="bg-[var(--primary)] text-white text-xs font-semibold rounded px-4 py-2 hover:bg-[#1f3f2d] cursor-pointer disabled:opacity-50"
              >
                {campaignMutation.isPending ? "Dispatching..." : "Send Campaign →"}
              </button>
            </form>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-2">
              {isSuperAdmin
                ? "All System Campaigns"
                : isReseller
                ? "Campaigns (Yours + Client Users)"
                : "My Campaigns"}{" "}
              ({campaigns.length})
            </h3>
            <div className="space-y-2">
              {campaigns.length === 0 ? (
                <p className="text-xs text-[#73836a] text-center py-4">No campaigns found.</p>
              ) : (
                campaigns.map((c) => (
                  <div
                    key={c._id}
                    className="p-3 rounded-lg border border-[var(--background)] bg-[#faf8f5] flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#273322]">{c.campaignTitle}</span>
                        {/* Status Badge */}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            c.status === "completed" || c.status === "sent"
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : c.status === "ongoing"
                              ? "bg-blue-50 text-blue-700 border-blue-200 animate-pulse"
                              : c.status === "pending"
                              ? "bg-sky-50 text-sky-700 border-sky-200"
                              : c.status === "scheduled"
                              ? "bg-purple-50 text-purple-700 border-purple-200"
                              : c.status === "paused"
                              ? "bg-amber-50 text-amber-800 border-amber-200 font-bold"
                              : c.status === "stopped"
                              ? "bg-orange-50 text-orange-800 border-orange-200 font-bold"
                              : c.status === "failed"
                              ? "bg-red-50 text-red-800 border-red-200 font-bold"
                              : "bg-stone-100 text-stone-600 border-stone-200"
                          }`}
                        >
                          {c.status}
                        </span>

                        {/* Super Admin Limited Manual Override */}
                        {isSuperAdmin && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setDeliveryReportModal({
                                  isOpen: true,
                                  campaignId: c._id,
                                  campaignTitle: c.campaignTitle,
                                  sent: c.campaignSummary?.sent ?? c.totalRecipients ?? "",
                                  delivered: c.campaignSummary?.delivered ?? c.totalRecipients ?? "",
                                  read: c.campaignSummary?.read ?? "",
                                  failed: c.campaignSummary?.failed ?? 0,
                                  adminNotes: c.campaignSummary?.adminNotes ?? "",
                                  status: c.status === "completed" ? "completed" : "completed",
                                })
                              }
                              className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 cursor-pointer"
                              title="Super Admin: Manually input actual campaign response and delivery numbers"
                            >
                              📊 Delivery Report
                            </button>
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  updateStatusMutation.mutate({
                                    campaignId: c._id,
                                    status: e.target.value,
                                  });
                                }
                              }}
                              className="text-[10px] font-semibold py-0.5 px-1 rounded border border-[#b2c8a9] bg-white text-[#253d1d] cursor-pointer hover:border-[var(--primary)]"
                              title="Super Admin: Manual Action"
                            >
                              <option value="">Admin Action ▾</option>
                              {c.status !== "paused" && <option value="paused">⏸ Pause</option>}
                              {c.status === "paused" && <option value="ongoing">▶ Resume (Ongoing)</option>}
                              {c.status !== "stopped" && <option value="stopped">⏹ Stop (Cancel)</option>}
                              {c.status !== "failed" && <option value="failed">❌ Mark Failed</option>}
                            </select>
                          </div>
                        )}
                      </div>
                      <p className="text-[#5d6d55] mt-0.5">{c.campaignDescription}</p>
                      <p className="text-[11px] text-[#788870] mt-1 italic">"{c.messageBody}"</p>

                      {/* Manual Delivery Report (if reported by Super Admin) */}
                      {c.campaignSummary?.reportedAt && (
                        <div className="mt-2 p-2 rounded bg-emerald-50/70 border border-emerald-200 text-[11px] text-[#243f1f] flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-emerald-800">📊 Delivery Results:</span>
                            <span>Sent: <strong>{c.campaignSummary.sent}</strong></span>
                            <span>Delivered: <strong className="text-emerald-700">{c.campaignSummary.delivered}</strong></span>
                            <span>Read: <strong>{c.campaignSummary.read ?? 0}</strong></span>
                            <span>Failed: <strong className="text-rose-700">{c.campaignSummary.failed ?? 0}</strong></span>
                          </div>
                          {c.campaignSummary.adminNotes && (
                            <span className="text-[10px] text-emerald-700 italic">
                              Note: "{c.campaignSummary.adminNotes}"
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="font-bold text-[var(--primary)] block">
                        {c.totalRecipients} unique recipient(s)
                      </span>
                      {c.recipientStats?.duplicateCount > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setInspectDuplicatesModal({
                              isOpen: true,
                              campaignTitle: c.campaignTitle,
                              duplicatesList: c.recipientStats?.duplicatesList || [],
                              invalidList: c.recipientStats?.invalidList || [],
                            })
                          }
                          className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 cursor-pointer mt-0.5"
                          title="Click to inspect all preserved duplicate numbers"
                        >
                          🔍 {c.recipientStats.duplicateCount} duplicate(s) preserved
                        </button>
                      )}
                      <span className="text-[10px] text-[#7d8c75] block mt-0.5">
                        Launched by: {c.userId?.username || "You"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TEMPLATES (Visible to ALL roles) */}
      {activeTab === "templates" && (
        <div className="space-y-6">
          <div className="rounded-lg bg-[#faf8f5] border border-[var(--background)] p-4">
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-2">Create Message Template</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                templateMutation.mutate(newTpl);
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Template Title (e.g. Welcome Message)"
                  value={newTpl.title}
                  onChange={(e) => setNewTpl({ ...newTpl, title: e.target.value })}
                  className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Description"
                  value={newTpl.description}
                  onChange={(e) => setNewTpl({ ...newTpl, description: e.target.value })}
                  className="text-xs p-2 rounded border border-[#cfd6c7] bg-white"
                />
              </div>

              <textarea
                required
                rows="2"
                placeholder="Template Body (e.g. Hi {{1}}, welcome to our VIP WhatsApp group!)"
                value={newTpl.body}
                onChange={(e) => setNewTpl({ ...newTpl, body: e.target.value })}
                className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white"
              />

              <button
                type="submit"
                disabled={templateMutation.isPending}
                className="bg-[var(--primary)] text-white text-xs font-semibold rounded px-4 py-2 hover:bg-[#1f3f2d] cursor-pointer disabled:opacity-50"
              >
                {templateMutation.isPending ? "Saving..." : "Save Template"}
              </button>
            </form>
          </div>

          <div>
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-2">
              Saved Templates ({templates.length})
            </h3>
            <div className="space-y-2">
              {templates.length === 0 ? (
                <p className="text-xs text-[#73836a] text-center py-4">No templates created yet.</p>
              ) : (
                templates.map((tpl) => (
                  <div key={tpl._id} className="p-3 rounded-lg border border-[var(--background)] bg-[#faf8f5] text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#283923]">{tpl.title}</span>
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        Created: {new Date(tpl.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-[#586751] mt-0.5">{tpl.description}</p>
                    <div className="mt-2 p-2 rounded bg-white border border-[var(--background)] font-mono text-[11px] text-[#3b4b35]">
                      {tpl.body}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* DOUBLE-CONFIRMATION MODAL (Banking Rule) */}
      {confirmTransferModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-[var(--background)] space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#233120]">
                  Confirm Credit Transfer
                </h3>
                <p className="text-xs text-[#6e7d64]">
                  Pre-transfer double confirmation (Banking Rule)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmTransferModal({ ...confirmTransferModal, isOpen: false })}
                className="text-stone-400 hover:text-stone-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-[var(--background)] p-3.5 rounded-lg border border-[var(--background)] space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-[#e5ebe0]">
                <span className="text-[#6c7d62]">Recipient User:</span>
                <span className="font-bold text-[var(--foreground)]">
                  {confirmTransferModal.toUser?.username} ({confirmTransferModal.toUser?.role})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#e5ebe0]">
                <span className="text-[#6c7d62]">Email:</span>
                <span className="text-[#45523e]">{confirmTransferModal.toUser?.email}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#e5ebe0]">
                <span className="text-[#6c7d62]">Amount:</span>
                <span className="text-base font-bold text-[var(--primary)]">
                  {Number(confirmTransferModal.amount).toLocaleString()} Credits
                </span>
              </div>
              {confirmTransferModal.notes && (
                <div className="flex justify-between py-1">
                  <span className="text-[#6c7d62]">Note / Reference:</span>
                  <span className="text-[#45523e]">{confirmTransferModal.notes}</span>
                </div>
              )}
            </div>

            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-900 leading-relaxed">
              ⚠️ <strong>Irreversible Transfer Guarantee</strong>: In accordance with anti-fraud banking rules, once confirmed this credit allocation is <strong>permanent and cannot be reversed by resellers</strong>.
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                allocateMutation.mutate({
                  toUserId: confirmTransferModal.toUser._id,
                  amount: Number(confirmTransferModal.amount),
                  notes: confirmTransferModal.notes,
                  password: confirmTransferModal.password,
                });
              }}
              className="space-y-3 pt-1"
            >
              <div>
                <label className="block text-xs font-semibold text-[#374533] mb-1">
                  Enter your account password to authorize:
                </label>
                <input
                  type="password"
                  required
                  placeholder="Your account password"
                  value={confirmTransferModal.password}
                  onChange={(e) => setConfirmTransferModal({ ...confirmTransferModal, password: e.target.value })}
                  className="w-full text-xs p-2.5 rounded border border-[#cfd6c7] bg-white focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmTransferModal({ ...confirmTransferModal, isOpen: false })}
                  className="px-4 py-2 text-xs font-semibold rounded border border-[#cfd6c7] text-[var(--primary)] hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={allocateMutation.isPending}
                  className="px-4 py-2 text-xs font-bold rounded bg-[var(--primary)] text-white hover:bg-[#1f3f2d] cursor-pointer disabled:opacity-50"
                >
                  {allocateMutation.isPending ? "Verifying & Transferring..." : `Confirm & Allocate (${Number(confirmTransferModal.amount).toLocaleString()} Credits)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSPECT DUPLICATE & EXCLUDED NUMBERS MODAL */}
      {inspectDuplicatesModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl border border-[var(--background)] space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#233120]">
                  Preserved Duplicate & Excluded Numbers
                </h3>
                <p className="text-xs text-[#6e7d64]">
                  Campaign: <span className="font-semibold text-[#273921]">{inspectDuplicatesModal.campaignTitle}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectDuplicatesModal({ isOpen: false, campaignTitle: "", duplicatesList: [], invalidList: [] })}
                className="text-stone-400 hover:text-stone-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between text-xs bg-[#faf8f5] p-3 rounded-lg border border-[var(--background)]">
              <div>
                <span className="text-[#65765f]">Duplicates Preserved: </span>
                <span className="font-bold text-amber-900">{inspectDuplicatesModal.duplicatesList.length} numbers</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(inspectDuplicatesModal.duplicatesList.join("\n"));
                  setStatusMsg("Copied all duplicate numbers to clipboard!");
                }}
                className="px-2.5 py-1 text-[11px] font-bold rounded bg-white border border-[#cfd6c7] text-[var(--primary)] hover:bg-stone-50 cursor-pointer"
              >
                📋 Copy All Duplicates
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#3b4936]">
                All Preserved Duplicate Phone Numbers:
              </label>
              <div className="max-h-60 overflow-y-auto rounded-lg border border-[#cfd6c7] bg-[#f9faf7] p-3 font-mono text-xs text-[#2a3723] space-y-1">
                {inspectDuplicatesModal.duplicatesList.length === 0 ? (
                  <p className="text-[#889781] italic">No duplicate numbers recorded.</p>
                ) : (
                  inspectDuplicatesModal.duplicatesList.map((num, i) => (
                    <div key={i} className="flex items-center justify-between py-0.5 border-b border-[#edf1e7] last:border-b-0">
                      <span>{num}</span>
                      <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                        Duplicate #{i + 1}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setInspectDuplicatesModal({ isOpen: false, campaignTitle: "", duplicatesList: [] })}
                className="px-4 py-2 text-xs font-semibold rounded bg-[var(--primary)] text-white hover:bg-[#1f3f2d] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPER ADMIN DELIVERY REPORT MODAL */}
      {deliveryReportModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-[var(--background)] space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[#233120]">
                  Record WhatsApp Delivery Report
                </h3>
                <p className="text-xs text-[#6e7d64]">
                  Campaign: <span className="font-semibold text-[#273921]">{deliveryReportModal.campaignTitle}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDeliveryReportModal({ ...deliveryReportModal, isOpen: false })}
                className="text-stone-400 hover:text-stone-700 text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] text-[#607157] bg-[#f8faf5] p-2.5 rounded border border-[var(--background)]">
              Since messages are dispatched via external WhatsApp servers, record the final actual counts delivered/failed for user dashboard reporting.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMetricsMutation.mutate({
                  campaignId: deliveryReportModal.campaignId,
                  sent: Number(deliveryReportModal.sent),
                  delivered: Number(deliveryReportModal.delivered),
                  read: Number(deliveryReportModal.read || 0),
                  failed: Number(deliveryReportModal.failed || 0),
                  adminNotes: deliveryReportModal.adminNotes,
                  status: deliveryReportModal.status,
                });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#374533] mb-1">
                    Total Sent:
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={deliveryReportModal.sent}
                    onChange={(e) => setDeliveryReportModal({ ...deliveryReportModal, sent: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#374533] mb-1">
                    Delivered:
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={deliveryReportModal.delivered}
                    onChange={(e) => setDeliveryReportModal({ ...deliveryReportModal, delivered: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#374533] mb-1">
                    Read (Optional):
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={deliveryReportModal.read}
                    onChange={(e) => setDeliveryReportModal({ ...deliveryReportModal, read: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#374533] mb-1">
                    Failed / Undelivered:
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={deliveryReportModal.failed}
                    onChange={(e) => setDeliveryReportModal({ ...deliveryReportModal, failed: e.target.value })}
                    className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white focus:outline-none focus:border-[var(--primary)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#374533] mb-1">
                  Update Lifecycle Status:
                </label>
                <select
                  value={deliveryReportModal.status}
                  onChange={(e) => setDeliveryReportModal({ ...deliveryReportModal, status: e.target.value })}
                  className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white focus:outline-none focus:border-[var(--primary)]"
                >
                  <option value="completed">Completed</option>
                  <option value="ongoing">Ongoing</option>
                  <option value="failed">Failed</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#374533] mb-1">
                  Super Admin Delivery Notes:
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Dispatched node #3, 5 invalid carrier routes"
                  value={deliveryReportModal.adminNotes}
                  onChange={(e) => setDeliveryReportModal({ ...deliveryReportModal, adminNotes: e.target.value })}
                  className="w-full text-xs p-2 rounded border border-[#cfd6c7] bg-white focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setDeliveryReportModal({ ...deliveryReportModal, isOpen: false })}
                  className="px-4 py-2 text-xs font-semibold rounded border border-[#cfd6c7] text-[var(--primary)] hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMetricsMutation.isPending}
                  className="px-4 py-2 text-xs font-bold rounded bg-[var(--primary)] text-white hover:bg-[#1f3f2d] cursor-pointer disabled:opacity-50"
                >
                  {updateMetricsMutation.isPending ? "Saving..." : "Save Delivery Report"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
