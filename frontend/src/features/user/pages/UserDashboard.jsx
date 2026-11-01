import { useAuth } from "@/features/auth/hooks/useAuth.js";
import { useQuery } from "@tanstack/react-query";
import api from "@/api/client";
import { Link } from "react-router";
import {
  Wallet,
  Send,
  PlusCircle,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  BarChart2,
  LogOut,
} from "lucide-react";

/* ─── tiny helpers ─────────────────────────────────────── */
function StatusBadge({ status }) {
  const map = {
    completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
    ongoing:   "bg-blue-100   text-blue-800   border-blue-200",
    pending:   "bg-amber-100  text-amber-800  border-amber-200",
    scheduled: "bg-purple-100 text-purple-800 border-purple-200",
    failed:    "bg-red-100    text-red-800    border-red-200",
    cancelled: "bg-stone-100  text-stone-600  border-stone-200",
  };
  const Icon = {
    completed: CheckCircle2,
    ongoing: Clock,
    pending: AlertCircle,
    scheduled: Clock,
    failed: XCircle,
    cancelled: XCircle,
  }[status] ?? AlertCircle;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${
        map[status] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      <Icon size={10} />
      {status}
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 flex items-start gap-4 shadow-xs">
      <div className={`p-2.5 rounded-lg ${accent}`}>
        <Icon size={18} className="text-primary-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── main component ───────────────────────────────────── */
export default function UserDashboard() {
  const { user, logout, isLoggingOut } = useAuth();

  const { data: balanceData, isLoading: balLoading } = useQuery({
    queryKey: ["userBalance"],
    queryFn: async () => (await api.get("/credits/balance")).data,
    staleTime: 60_000,
  });

  const { data: campaignsData, isLoading: campLoading } = useQuery({
    queryKey: ["userCampaigns"],
    queryFn: async () => (await api.get("/campaigns")).data,
    staleTime: 60_000,
  });

  const balance   = balanceData?.wallet?.balance   ?? balanceData?.balance   ?? 0;
  const isLocked  = balanceData?.wallet?.isLocked  ?? false;
  const campaigns = campaignsData?.campaigns ?? campaignsData ?? [];

  // KPI aggregates
  const total     = campaigns.length;
  const sent      = campaigns.filter((c) => c.status === "completed").length;
  const pending   = campaigns.filter((c) => ["pending","scheduled"].includes(c.status)).length;
  const failed    = campaigns.filter((c) => c.status === "failed").length;

  // Last 5 campaigns, newest first
  const recent = [...campaigns]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top bar ── */}
      <header className="bg-sidebar border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">
            Welcome back, <span className="text-primary">{user?.username}</span>
          </h1>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/campaigns/create"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md hover:bg-primary/90 transition-colors shadow-xs"
          >
            <PlusCircle size={15} />
            New Campaign
          </Link>
          <button
            onClick={() => logout()}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-border text-foreground hover:bg-muted text-sm rounded-md transition-colors disabled:opacity-50"
          >
            <LogOut size={14} />
            {isLoggingOut ? "…" : "Logout"}
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-8">
        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            icon={Wallet}
            label="Credits"
            value={balLoading ? "…" : balance.toLocaleString()}
            sub={isLocked ? "⚠ Wallet locked" : "Available balance"}
            accent="bg-primary"
          />
          <KpiCard
            icon={Send}
            label="Campaigns"
            value={campLoading ? "…" : total}
            sub="All time"
            accent="bg-primary"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Completed"
            value={campLoading ? "…" : sent}
            sub="Successfully sent"
            accent="bg-primary"
          />
          <KpiCard
            icon={AlertCircle}
            label="Pending"
            value={campLoading ? "…" : pending}
            sub={`${failed} failed`}
            accent="bg-primary"
          />
        </div>

        {/* ── CTA banner ── */}
        <div className="bg-primary rounded-xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="text-primary-foreground font-bold text-lg">Ready to reach your audience?</p>
            <p className="text-primary-foreground/70 text-sm mt-0.5">
              Create a WhatsApp broadcast campaign and send it instantly.
            </p>
          </div>
          <Link
            to="/campaigns/create"
            className="shrink-0 inline-flex items-center gap-2 px-5 py-2.5 bg-card text-primary font-semibold rounded-lg hover:bg-card/90 transition-colors text-sm shadow"
          >
            <PlusCircle size={16} />
            Create Campaign
          </Link>
        </div>

        {/* ── Recent campaigns ── */}
        <div className="bg-card border border-border rounded-xl shadow-xs">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <BarChart2 size={16} className="text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Recent Campaigns</h2>
            </div>
            <Link
              to="/campaigns"
              className="text-xs text-primary hover:underline"
            >
              View all →
            </Link>
          </div>

          {campLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-10 bg-muted rounded animate-pulse" />
              ))}
            </div>
          ) : recent.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              <Send size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No campaigns yet</p>
              <p className="text-xs mt-1">Create your first campaign to get started.</p>
              <Link
                to="/campaigns/create"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-md hover:bg-primary/90 transition-colors"
              >
                <PlusCircle size={13} />
                Create Campaign
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recent.map((c) => (
                <div key={c._id} className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/40 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{c.name || c.title || "Untitled"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.recipients?.length ?? c.recipientCount ?? "—"} recipients
                      {c.createdAt
                        ? ` · ${new Date(c.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric",
                          })}`
                        : ""}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

