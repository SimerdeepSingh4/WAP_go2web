import { createBrowserRouter, Navigate, useLocation } from "react-router";
import LoginPage from "./features/auth/pages/Login.jsx";
import { useAuth } from "./features/auth/hooks/useAuth.js";
import RoleRoute from "./components/RoleRoute.jsx";
import ResellerOverview from "./features/reseller/pages/Overview.jsx";
import ResellerLayout from "./features/reseller/components/ResellerLayout.jsx";
import ResellerUsers from "./features/reseller/pages/Users.jsx";
import ResellerCredits from "./features/reseller/pages/Credits.jsx";
import ResellerCampaigns from "./features/reseller/pages/Campaigns.jsx";
import ResellerSettings from "./features/reseller/pages/Settings.jsx";
import UserLayout from "./features/user/components/UserLayout.jsx";
import UserOverview from "./features/user/pages/UserOverview.jsx";
import UserCredits from "./features/user/pages/Credits.jsx";
import UserCampaigns from "./features/user/pages/Campaigns.jsx";
import UserSettings from "./features/user/pages/Settings.jsx";
import CreateCampaignPage from "./features/campaigns/pages/CreateCampaignPage.jsx";
import PreviewBanner from "./components/PreviewBanner.jsx";

import { lazy, Suspense } from "react";
import AdminAccess from "./features/admin/components/AdminAccess.jsx";
import ExpiredAccountPage from "./features/auth/pages/ExpiredAccountPage.jsx";

const AdminLayout = lazy(() => import("./features/admin/components/AdminLayout.jsx"));
const AdminOverview = lazy(() => import("./features/admin/pages/Overview.jsx"));
const AdminCampaigns = lazy(() => import("./features/admin/pages/Campaigns.jsx"));
const AdminContacts = lazy(() => import("./features/admin/pages/Contacts.jsx"));
const Administrators = lazy(() => import("./features/admin/pages/Administrators.jsx"));
const AdminAccounts = lazy(() => import("./features/admin/pages/Accounts.jsx"));
const AdminCredits = lazy(() => import("./features/admin/pages/Credits.jsx"));
const AdminOperatingRules = lazy(() => import("./features/admin/pages/OperatingRules.jsx"));

function Dashboard() {
  const { user } = useAuth();

  if (user?.role === "Super Admin" && !user?.isPreview) {
    return <Navigate to="/admin" replace />;
  }
  if (user?.role === "Reseller") {
    return <Navigate to="/reseller" replace />;
  }
  if (user?.role === "User") {
    return <Navigate to="/user" replace />;
  }

  return <Navigate to="/login" replace />;
}

function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

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

  if (user.isExpired && location.pathname !== "/account-expired") {
    return <Navigate to="/account-expired" replace />;
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
      { path: "contacts", element: <AdminContacts /> },
      { path: "reports", element: <Navigate to="/admin/campaigns?status=unreported" replace /> },
      { path: "administrators", element: <Administrators /> },
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
        <ResellerLayout />
      </RoleRoute>
    ),
    children: [
      { index: true, element: <ResellerOverview /> },
      { path: "campaigns", element: <ResellerCampaigns /> },
      { path: "campaigns/create", element: <CreateCampaignPage /> },
      { path: "campaigns/new", element: <CreateCampaignPage /> },
      { path: "reports", element: <Navigate to="/reseller/campaigns?status=unreported" replace /> },
      { path: "users", element: <ResellerUsers /> },
      { path: "credits", element: <ResellerCredits key="credits" /> },
      { path: "activity", element: <ResellerCredits key="activity" activity /> },
      { path: "settings", element: <ResellerSettings /> },
    ],
  },
  {
    path: "/user",
    element: (
      <RoleRoute allowedRoles={["Super Admin", "Reseller", "User"]}>
        <UserLayout />
      </RoleRoute>
    ),
    children: [
      { index: true, element: <UserOverview /> },
      { path: "campaigns", element: <UserCampaigns /> },
      { path: "campaigns/create", element: <CreateCampaignPage /> },
      { path: "campaigns/new", element: <CreateCampaignPage /> },
      { path: "credits", element: <UserCredits key="credits" /> },
      { path: "activity", element: <UserCredits key="activity" activity /> },
      { path: "settings", element: <UserSettings /> },
    ],
  },
  // ── Standalone campaign creation routes for direct access ──
  {
    path: "/campaigns/create",
    element: (
      <RoleRoute allowedRoles={["Reseller", "User"]}>
        <CreateCampaignPage />
      </RoleRoute>
    ),
  },
  {
    path: "/campaigns/new",
    element: (
      <RoleRoute allowedRoles={["Reseller", "User"]}>
        <CreateCampaignPage />
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
    path: "/account-expired",
    element: (
      <ProtectedRoute>
        <ExpiredAccountPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
