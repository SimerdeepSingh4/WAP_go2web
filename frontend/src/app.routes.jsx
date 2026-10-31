import { createBrowserRouter, Navigate, Link } from "react-router";
import LoginPage from "./features/auth/pages/Login.jsx";
import { useAuth } from "./features/auth/hooks/useAuth.js";
import ActiveDevices from "./features/auth/components/ActiveDevices.jsx";
import RoleRoute from "./components/RoleRoute.jsx";
import ResellerOverview from "./features/reseller/pages/Overview.jsx";
import ResellerLayout from "./features/reseller/components/ResellerLayout.jsx";
import ResellerUsers from "./features/reseller/pages/Users.jsx";
import ResellerCredits from "./features/reseller/pages/Credits.jsx";
import ResellerCampaigns from "./features/reseller/pages/Campaigns.jsx";
import ResellerSettings from "./features/reseller/pages/Settings.jsx";
import CreateCampaignPage from "./features/campaigns/pages/CreateCampaignPage.jsx";
import PreviewBanner from "./components/PreviewBanner.jsx";

import { lazy, Suspense } from "react";
import AdminAccess from "./features/admin/components/AdminAccess.jsx";

const AdminLayout = lazy(() => import("./features/admin/components/AdminLayout.jsx"));
const AdminOverview = lazy(() => import("./features/admin/pages/Overview.jsx"));
const AdminCampaigns = lazy(() => import("./features/admin/pages/Campaigns.jsx"));
const AdminContacts = lazy(() => import("./features/admin/pages/Contacts.jsx"));
const AdminAccounts = lazy(() => import("./features/admin/pages/Accounts.jsx"));
const AdminCredits = lazy(() => import("./features/admin/pages/Credits.jsx"));
const AdminOperatingRules = lazy(() => import("./features/admin/pages/OperatingRules.jsx"));

function Dashboard() {
  const { user, logout, isLoggingOut, logoutAll, isLoggingOutAll } = useAuth();

  if (user?.role === "Super Admin" && !user?.isPreview) {
  return <Navigate to="/admin" replace />;
}
if (user?.role === "Reseller") {
  return <Navigate to="/reseller" replace />;
}

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case "Super Admin":
        return "bg-stone-100 text-stone-900 border-stone-300";
      case "Reseller":
        return "bg-orange-50 text-orange-800 border-orange-200";
      default:
        return "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="bg-card rounded-xl border border-border p-6 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold text-foreground">Welcome, {user?.username}!</h1>
            <span
              className={`px-3 py-0.5 text-xs font-semibold rounded-full border ${getRoleBadgeColor(
                user?.role
              )}`}
            >
              Role: {user?.role}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-5">Email: {user?.email}</p>

          {/* Quick RBAC navigation test links */}
          <div className="mb-6 p-4 rounded-lg bg-muted/60 border border-border">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary mb-3">
              Test Role-Based Access Control (RBAC):
            </p>
            <div className="flex flex-wrap gap-2.5">
              <Link
                to="/admin"
                className="inline-flex items-center px-3 py-1.5 rounded-md bg-card border border-border text-xs font-medium text-foreground hover:border-primary transition-colors"
              >
                Go to /admin (Super Admin only)
              </Link>
              <Link
                to="/reseller"
                className="inline-flex items-center px-3 py-1.5 rounded-md bg-card border border-border text-xs font-medium text-foreground hover:border-primary transition-colors"
              >
                Go to /reseller (Reseller + Admin)
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => logout()}
              disabled={isLoggingOut || isLoggingOutAll}
              className="px-4 py-2 bg-primary text-primary-foreground text-sm font-medium rounded-md hover:bg-primary/90 cursor-pointer disabled:opacity-50 transition-colors shadow-xs"
            >
              {isLoggingOut ? "Logging out..." : "Log out"}
            </button>
            <button
              onClick={() => logoutAll()}
              disabled={isLoggingOut || isLoggingOutAll}
              className="px-4 py-2 border border-border text-foreground hover:bg-muted text-sm font-medium rounded-md cursor-pointer disabled:opacity-50 transition-colors"
            >
              {isLoggingOutAll ? "Logging out all..." : "Log out from all devices"}
            </button>
          </div>
        </div>

        <ActiveDevices />

        {/* Feature Test Lab Console */}

      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-primary">
        <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full" />
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
      <div className="min-h-screen flex items-center justify-center bg-background text-primary">
        <div className="animate-spin size-8 border-4 border-primary border-t-transparent rounded-full" />
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
      { path: "campaigns/create", element: <CreateCampaignPage /> },
      { path: "campaigns/new", element: <CreateCampaignPage /> },
      { path: "contacts", element: <AdminContacts /> },
      { path: "reports", element: <AdminCampaigns reports /> },
      { path: "resellers", element: <AdminAccounts key="resellers" role="Reseller" /> },
      { path: "users", element: <AdminAccounts key="users" role="User" /> },
      { path: "credits", element: <AdminCredits key="credits" /> },
      { path: "activity", element: <AdminCredits key="activity" activity /> },
      { path: "settings", element: <AdminOperatingRules /> },
    ],
  },
  { path: "/reseller", element: (
        <RoleRoute allowedRoles={["Super Admin", "Reseller"]}>
          <ResellerLayout />
        </RoleRoute>
      ),
      children: [
        { index: true, element: <ResellerOverview /> },
        { path: "campaigns", element: <ResellerCampaigns /> },
        { path: "campaigns/create", element: <CreateCampaignPage /> },
        { path: "campaigns/new", element: <CreateCampaignPage /> },
        { path: "reports", element: <ResellerCampaigns reports /> },
        { path: "users", element: <ResellerUsers /> },
        { path: "credits", element: <ResellerCredits key="credits" /> },
        { path: "activity", element: <ResellerCredits key="activity" activity /> },
        { path: "settings", element: <ResellerSettings /> },
      ],
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
