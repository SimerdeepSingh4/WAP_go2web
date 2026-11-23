import { Skeleton } from "./skeleton";

/**
 * Metric Cards Skeleton (e.g. Total campaigns, Active resellers, Wallet balance)
 */
export function MetricCardsSkeleton({ count = 4, className = "" }) {
  return (
    <div
      role="status"
      aria-label="Loading overview metrics"
      className={`grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-xs"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      ))}
    </div>
  );
}

/**
 * Data Table Skeleton with search/filter bar and realistic row structure
 */
export function TableSkeleton({ rows = 6, showFilters = true, className = "" }) {
  return (
    <div
      role="status"
      aria-label="Loading table data"
      className={`space-y-4 ${className}`}
    >
      {showFilters && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <Skeleton className="h-9 w-full rounded-lg" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-xs">
        {/* Table Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24 hidden md:block" />
          <Skeleton className="h-4 w-16" />
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-border/40">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3.5 gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Skeleton className="size-8 rounded-full shrink-0" />
                <div className="space-y-1.5 flex-1 min-w-0">
                  <Skeleton className="h-3.5 w-3/4 max-w-[200px]" />
                  <Skeleton className="h-2.5 w-1/2 max-w-[140px]" />
                </div>
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-3.5 w-24 hidden md:block" />
              <Skeleton className="size-6 rounded-md shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * List / Inbox / Notifications Skeleton
 */
export function ListSkeleton({ count = 5, className = "" }) {
  return (
    <div
      role="status"
      aria-label="Loading list"
      className={`divide-y divide-border/50 rounded-xl border border-border/70 bg-card overflow-hidden shadow-xs ${className}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-start gap-3.5 p-4">
          <Skeleton className="size-8 rounded-lg shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-3 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Pixel-perfect Dashboard Overview Skeleton (matches Overview.jsx exactly)
 */
export function DashboardSkeleton() {
  return (
    <div className="portal-overview space-y-6" role="status" aria-label="Loading dashboard">
      {/* Page Heading Skeleton */}
      <div className="portal-page-heading">
        <div className="portal-heading-copy space-y-1.5">
          <Skeleton className="h-7 w-40 rounded-lg" />
          <Skeleton className="h-3.5 w-56 rounded-md" />
        </div>
        <div className="portal-page-actions">
          <Skeleton className="h-9 w-36 rounded-lg" />
        </div>
      </div>

      {/* 4 Metric Cards */}
      <MetricCardsSkeleton count={4} />

      {/* Two Columns: Recent Campaigns & Accounts */}
      <div className="dashboard-two-column">
        <div className="dashboard-section rounded-xl border border-border/70 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between pb-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
          <div className="divide-y divide-border/40">
            {[1, 2, 3].map((i) => (
              <div key={i} className="py-3 flex items-center justify-between">
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3.5 w-48" />
                  <Skeleton className="h-2.5 w-32" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-section rounded-xl border border-border/70 bg-card p-4 space-y-3">
          <div className="flex items-center justify-between pb-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
          <div className="divide-y divide-border/40">
            {[1, 2, 3].map((i) => (
              <div key={i} className="py-3 flex items-center justify-between">
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-2.5 w-28" />
                </div>
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Transactions Panel */}
      <div className="dashboard-section rounded-xl border border-border/70 bg-card p-4 space-y-3">
        <div className="flex items-center justify-between pb-2">
          <div className="space-y-1">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-2.5 w-60" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
        </div>
        <TableSkeleton rows={4} showFilters={false} />
      </div>
    </div>
  );
}

/**
 * Standard Full Page Skeleton (used during route Suspense / page navigation)
 */
export function PageSkeleton({ variant = "table", showMetrics = false, className = "" }) {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className={`p-6 max-w-7xl mx-auto space-y-6 ${className}`}
    >
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-1">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48 rounded-lg" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Optional Top Metrics */}
      {showMetrics && <MetricCardsSkeleton count={4} />}

      {/* Main Content Area */}
      {variant === "cards" ? (
        <MetricCardsSkeleton count={6} />
      ) : variant === "list" ? (
        <ListSkeleton count={6} />
      ) : (
        <TableSkeleton rows={6} />
      )}
    </div>
  );
}

/**
 * Full Workspace Skeleton (Sidebar + Topbar + Page content)
 * Used during route authentication or cold workspace initialization
 */
export function WorkspaceSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading workspace"
      className="min-h-screen flex bg-background text-foreground"
    >
      {/* Sidebar Skeleton (hidden on small screens) */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border/70 bg-card/50 p-4 space-y-6 shrink-0">
        {/* Brand */}
        <div className="flex items-center gap-3 px-2 py-1">
          <Skeleton className="size-8 rounded-lg" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>

        {/* Navigation items */}
        <div className="space-y-2 flex-1 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2 rounded-lg">
              <Skeleton className="size-5 rounded-md shrink-0" />
              <Skeleton className="h-3.5 flex-1 max-w-[120px]" />
            </div>
          ))}
        </div>

        {/* Bottom user */}
        <div className="flex items-center gap-3 px-2 pt-4 border-t border-border/50">
          <Skeleton className="size-8 rounded-full" />
          <div className="space-y-1 flex-1">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar Skeleton */}
        <header className="h-14 border-b border-border/70 px-6 flex items-center justify-between gap-4 bg-card/30">
          <Skeleton className="h-9 w-64 max-w-sm rounded-lg" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        </header>

        {/* Body Content Skeleton */}
        <main className="flex-1 p-6 space-y-6">
          <PageSkeleton showMetrics={true} />
        </main>
      </div>
    </div>
  );
}
