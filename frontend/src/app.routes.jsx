import NotificationsPage from "./features/notifications/pages/NotificationsPage.jsx";
import { createBrowserRouter, Navigate, useParams } from "react-router";
import LoginPage from "./features/auth/pages/Login.jsx";
import { useAuth } from "./features/auth/hooks/useAuth.js";
import RoleRoute from "./components/guards/RoleRoute.jsx";
import ResellerOverview from "./features/reseller/pages/Overview.jsx";
import ResellerLayout from "./features/reseller/components/ResellerLayout.jsx";
import ResellerUsers from "./features/reseller/pages/Users.jsx";
import ResellerCredits from "./features/reseller/pages/Credits.jsx";
import ResellerCampaigns from "./features/reseller/pages/Campaigns.jsx";
import ResellerSettings from "./features/reseller/pages/Settings.jsx";
import SupportChatPage from "./features/support/pages/SupportChatPage.jsx";
import UserLayout from "./features/user/components/UserLayout.jsx";
import UserOverview from "./features/user/pages/UserOverview.jsx";
import UserCredits from "./features/user/pages/Credits.jsx";
import UserCampaigns from "./features/user/pages/Campaigns.jsx";
import UserSettings from "./features/user/pages/Settings.jsx";
import CreateCampaignPage from "./features/campaigns/pages/CreateCampaignPage.jsx";
import CampaignDetailPage from "./features/campaigns/pages/CampaignDetailPage.jsx";
import CampaignReportPage from "./features/campaigns/pages/CampaignReportPage.jsx";
import CreateCampaignReportPage from "./features/campaigns/pages/CreateCampaignReportPage.jsx";
import PreviewBanner from "./components/guards/PreviewBanner.jsx";

import { lazy, Suspense } from "react";
import AdminAccess from "./features/admin/guards/AdminAccess.jsx";
import ImpersonationHandoff from "./features/auth/pages/ImpersonationHandoff.jsx";

const AdminLayout = lazy(() => import("./features/admin/components/AdminLayout.jsx"));
const AdminOverview = lazy(() => import("./features/admin/pages/Overview.jsx"));
const AdminCampaigns = lazy(() => import("./features/admin/pages/Campaigns.jsx"));
const AdminContacts = lazy(() => import("./features/admin/pages/Contacts.jsx"));
const Administrators = lazy(() => import("./features/admin/pages/Administrators.jsx"));
const AdminAuditLog = lazy(() => import("./features/admin/pages/AuditLog.jsx"));
const AdminAccounts = lazy(() => import("./features/admin/pages/Accounts.jsx"));
const AdminCredits = lazy(() => import("./features/admin/pages/Credits.jsx"));
const AdminOperatingRules = lazy(() => import("./features/admin/pages/OperatingRules.jsx"));

function RoleCampaignDetailRedirect() {
  const { user } = useAuth();
  const { id } = useParams();
  if (user?.role === "Super Admin") {
    return <Navigate to={`/admin/campaigns/${id}`} replace />;
  }
  const base = user?.role === "Reseller" ? "/reseller" : "/user";
  return <Navigate to={`${base}/campaigns/${id}/report`} replace />;
}

function RoleCampaignReportRedirect() {
  const { user } = useAuth();
  const { id } = useParams();
  const base = user?.role === "Super Admin" ? "/admin" : user?.role === "Reseller" ? "/reseller" : "/user";
  return <Navigate to={`${base}/campaigns/${id}/report`} replace />;
}

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
      { path: "campaigns/:id", element: <CampaignDetailPage /> },
      { path: "campaigns/:id/report/create", element: <CreateCampaignReportPage /> },
      { path: "campaigns/:id/report", element: <CampaignReportPage /> },
      { path: "contacts", element: <AdminContacts /> },
      { path: "reports", element: <Navigate to="/admin/campaigns?status=unreported" replace /> },
      { path: "administrators", element: <Administrators /> },
      { path: "audit", element: <AdminAuditLog /> },
      { path: "resellers", element: <AdminAccounts key="resellers" role="Reseller" /> },
      { path: "users", element: <AdminAccounts key="users" role="User" /> },
      { path: "credits", element: <AdminCredits key="credits" /> },
      { path: "activity", element: <AdminCredits key="activity" activity /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "support", element: <SupportChatPage /> },
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
      { path: "campaigns/:id", element: <CampaignDetailPage /> },
      { path: "campaigns/:id/report", element: <CampaignReportPage /> },
      { path: "reports", element: <Navigate to="/reseller/campaigns?status=unreported" replace /> },
      { path: "users", element: <ResellerUsers /> },
      { path: "credits", element: <ResellerCredits key="credits" /> },
      { path: "activity", element: <Navigate to="/reseller/credits" replace /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "support", element: <SupportChatPage /> },
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
      { path: "campaigns/:id", element: <CampaignDetailPage /> },
      { path: "campaigns/:id/report", element: <CampaignReportPage /> },
      { path: "credits", element: <UserCredits key="credits" /> },
      { path: "activity", element: <Navigate to="/user/credits" replace /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "support", element: <SupportChatPage /> },
      { path: "settings", element: <UserSettings /> },
    ],
  },
  // ── Standalone campaign routes for direct access ──
  {
    path: "/campaigns/:id",
    element: (
      <ProtectedRoute>
        <RoleCampaignDetailRedirect />
      </ProtectedRoute>
    ),
  },
  {
    path: "/campaigns/:id/report",
    element: (
      <ProtectedRoute>
        <RoleCampaignReportRedirect />
      </ProtectedRoute>
    ),
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
    path: "/impersonation-handoff",
    element: <ImpersonationHandoff />,
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
        <Navigate to="/" replace />
      </ProtectedRoute>
    ),
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);
