import { createBrowserRouter, Navigate, Link } from "react-router";
import LoginPage from "./features/auth/pages/Login.jsx";
import { useAuth } from "./features/auth/hooks/useAuth.js";
import ActiveDevices from "./features/auth/components/ActiveDevices.jsx";
import RoleRoute from "./components/RoleRoute.jsx";
import ResellerDashboard from "./features/dashboard/pages/ResellerDashboard.jsx";
import PreviewBanner from "./components/PreviewBanner.jsx";
import TestControlPanel from "./features/dashboard/components/TestControlPanel.jsx";
import { lazy, Suspense } from "react";
import AdminAccess from "./features/admin/components/AdminAccess.jsx";

const AdminLayout = lazy(() => import("./features/admin/components/AdminLayout.jsx"));
const AdminOverview = lazy(() => import("./features/admin/pages/Overview.jsx"));
const AdminCampaigns = lazy(() => import("./features/admin/pages/Campaigns.jsx"));
const AdminAccounts = lazy(() => import("./features/admin/pages/Accounts.jsx"));
const AdminCredits = lazy(() => import("./features/admin/pages/Credits.jsx"));
const AdminOperatingRules = lazy(() => import("./features/admin/pages/OperatingRules.jsx"));

function Dashboard() {
  const { user, logout, isLoggingOut, logoutAll, isLoggingOutAll } = useAuth();

  if (user?.role === "Super Admin" && !user?.isPreview) {
    return <Navigate to="/admin" replace />;
  }

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case "Super Admin":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "Reseller":
        return "bg-blue-100 text-blue-700 border-blue-200";
      default:
        return "bg-emerald-100 text-emerald-700 border-emerald-200";
    }
  };

  return (
    <div className="min-h-screen bg-[#fafbf8] p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-[#dde3d5] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-[#334331]">Welcome, {user?.username}!</h1>
            <span
              className={`px-3 py-0.5 text-xs font-semibold rounded-full border ${getRoleBadgeColor(
                user?.role
              )}`}
            >
              Role: {user?.role}
            </span>
          </div>
          <p className="text-sm text-[#68765a] mb-5">Email: {user?.email}</p>

          {/* Quick RBAC navigation test links */}
          <div className="mb-6 p-4 rounded-lg bg-[#f6f8f2] border border-[#e1e7d8]">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#637259] mb-3">
              Test Role-Based Access Control (RBAC):
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link
                to="/admin"
                className="inline-flex items-center px-3 py-1.5 rounded-md bg-white border border-[#cfd8c7] text-xs font-medium text-[#2d3a2b] hover:border-[#315e48] transition-colors"
              >
                Go to /admin (Super Admin only)
              </Link>
              <Link
                to="/reseller"
                className="inline-flex items-center px-3 py-1.5 rounded-md bg-white border border-[#cfd8c7] text-xs font-medium text-[#2d3a2b] hover:border-[#315e48] transition-colors"
              >
                Go to /reseller (Reseller + Admin)
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => logout()}
              disabled={isLoggingOut || isLoggingOutAll}
              className="px-4 py-2 bg-[#a13d35] text-white text-sm font-medium rounded-md hover:bg-[#852f28] cursor-pointer disabled:opacity-50 transition-colors"
            >
              {isLoggingOut ? "Logging out..." : "Log out"}
            </button>
            <button
              onClick={() => logoutAll()}
              disabled={isLoggingOut || isLoggingOutAll}
              className="px-4 py-2 border border-[#a13d35] text-[#a13d35] hover:bg-[#fcf0ed] text-sm font-medium rounded-md cursor-pointer disabled:opacity-50 transition-colors"
            >
              {isLoggingOutAll ? "Logging out all..." : "Log out from all devices"}
            </button>
          </div>
        </div>

        <ActiveDevices />

        {/* Feature Test Lab Console */}
        <TestControlPanel />
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafbf8] text-[#315e48]">
        <div className="animate-spin size-8 border-4 border-[#315e48] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <PreviewBanner />
      {children}
    </>
  );
}

function PublicRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fafbf8] text-[#315e48]">
        <div className="animate-spin size-8 border-4 border-[#315e48] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin",
    element: (
      <ProtectedRoute>
        <AdminAccess>
          <Suspense fallback={<div role="status" className="p-8 text-sm text-muted-foreground">Loading workspace…</div>}>
            <AdminLayout />
          </Suspense>
        </AdminAccess>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminOverview /> },
      { path: "campaigns", element: <AdminCampaigns /> },
      { path: "reports", element: <AdminCampaigns reports /> },
      { path: "resellers", element: <AdminAccounts key="resellers" role="Reseller" /> },
      { path: "users", element: <AdminAccounts key="users" role="User" /> },
      { path: "credits", element: <AdminCredits key="credits" /> },
      { path: "activity", element: <AdminCredits key="activity" activity /> },
      { path: "settings", element: <AdminOperatingRules /> },
    ],
  },
  {
    path: "/reseller",
    element: (
      <RoleRoute allowedRoles={["Super Admin", "Reseller"]}>
        <ResellerDashboard />
      </RoleRoute>
    ),
  },
  {
    path: "/login",
    element: (
      <PublicRoute>
        <LoginPage />
      </PublicRoute>
    ),
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
