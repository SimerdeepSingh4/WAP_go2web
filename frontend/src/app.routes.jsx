import { Suspense, lazy } from "react";
import { createBrowserRouter, Navigate, useParams, useLocation, Outlet } from "react-router";
import LoginPage from "./features/auth/pages/Login.jsx";
import { useAuth } from "./features/auth/hooks/useAuth.js";
import RoleRoute from "./components/guards/RoleRoute.jsx";
import PreviewBanner from "./components/guards/PreviewBanner.jsx";
import WorkspacePageError from "./components/ui/workspace-page-error.jsx";
import AdminAccess from "./features/admin/guards/AdminAccess.jsx";

const Skiper46DevButton = lazy(() => import("./components/dev/Skiper46DevButton.jsx"));
const ImpersonationHandoff = lazy(() => import("./features/auth/pages/ImpersonationHandoff.jsx"));
const AdminLayout = lazy(() => import("./features/admin/components/AdminLayout.jsx"));
const ResellerLayout = lazy(() => import("./features/reseller/components/ResellerLayout.jsx"));
const UserLayout = lazy(() => import("./features/user/components/UserLayout.jsx"));
const AdminOverview = lazy(() => import("./features/admin/pages/Overview.jsx"));
const AdminCampaigns = lazy(() => import("./features/admin/pages/Campaigns.jsx"));
const AdminContacts = lazy(() => import("./features/admin/pages/Contacts.jsx"));
// Temporarily hidden; retain the page component and route for future staff management.
// const Administrators = lazy(() => import("./features/admin/pages/Administrators.jsx"));
const AdminAuditLog = lazy(() => import("./features/admin/pages/AuditLog.jsx"));
const CreditReconciliation = lazy(() => import("./features/reconciliation/pages/ReconciliationPage.jsx"));
const AdminAccounts = lazy(() => import("./features/admin/pages/Accounts.jsx"));
const AdminCredits = lazy(() => import("./features/admin/pages/Credits.jsx"));
const AdminOperatingRules = lazy(() => import("./features/admin/pages/OperatingRules.jsx"));

const ResellerOverview = lazy(() => import("./features/reseller/pages/Overview.jsx"));
const ResellerUsers = lazy(() => import("./features/reseller/pages/Users.jsx"));
const ResellerCredits = lazy(() => import("./features/reseller/pages/Credits.jsx"));
const ResellerCampaigns = lazy(() => import("./features/reseller/pages/Campaigns.jsx"));
const ResellerSettings = lazy(() => import("./features/reseller/pages/Settings.jsx"));

const UserOverview = lazy(() => import("./features/user/pages/UserOverview.jsx"));
const UserCredits = lazy(() => import("./features/user/pages/Credits.jsx"));
const UserCampaigns = lazy(() => import("./features/user/pages/Campaigns.jsx"));
const UserSettings = lazy(() => import("./features/user/pages/Settings.jsx"));

const NotificationsPage = lazy(() => import("./features/notifications/pages/NotificationsPage.jsx"));
const SupportChatPage = lazy(() => import("./features/support/pages/SupportChatPage.jsx"));
const CreateCampaignPage = lazy(() => import("./features/campaigns/pages/CreateCampaignPage.jsx"));
const CampaignDetailPage = lazy(() => import("./features/campaigns/pages/CampaignDetailPage.jsx"));
const CampaignReportPage = lazy(() => import("./features/campaigns/pages/CampaignReportPage.jsx"));
const CreateCampaignReportPage = lazy(() => import("./features/campaigns/pages/CreateCampaignReportPage.jsx"));
const NumberFilteringPage = lazy(() => import("./features/number-filtering/pages/NumberFilteringPage.jsx"));
const supportError = <WorkspacePageError title="Support chat couldn’t open" reloadLabel="Reload chat" />;
const filteringError = <WorkspacePageError title="Number Filtering couldn’t open" />;
const settingsError = <WorkspacePageError title="Settings couldn’t open" reloadLabel="Reload settings" />;

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
    return <div className="min-h-screen bg-background" />;
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
    return <div className="min-h-screen bg-background" />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function RootDevLayout() {
  const { user, isLoading } = useAuth();
  const { pathname } = useLocation();
  const inWorkspace = /^\/(admin|reseller|user)(\/|$)/.test(pathname);
  return (
    <>
      <Outlet />
      {user && !isLoading && inWorkspace && (
        <Suspense fallback={null}>
          <Skiper46DevButton />
        </Suspense>
      )}
    </>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootDevLayout />,
    children: [
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
          <AdminLayout />
        </AdminAccess>
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <AdminOverview /> },
      { path: "campaigns", element: <AdminCampaigns /> },
      { path: "campaigns/:id", element: <CampaignDetailPage /> },
      { path: "campaigns/:id/report/create", element: <CreateCampaignReportPage /> },
      { path: "campaigns/:id/report", element: <CampaignReportPage /> },
      { path: "number-filtering", element: <NumberFilteringPage base="/admin" />, errorElement: filteringError },
      { path: "number-filtering/:id", element: <NumberFilteringPage base="/admin" />, errorElement: filteringError },
      { path: "contacts", element: <AdminContacts /> },
      { path: "reports", element: <Navigate to="/admin/campaigns?status=unreported" replace /> },
      // { path: "administrators", element: <Administrators /> },
      { path: "audit", element: <AdminAuditLog /> },
      { path: "reconciliation", element: <CreditReconciliation /> },
      { path: "resellers", element: <AdminAccounts key="resellers" role="Reseller" /> },
      { path: "users", element: <AdminAccounts key="users" role="User" /> },
      { path: "credits", element: <AdminCredits key="credits" /> },
      { path: "activity", element: <AdminCredits key="activity" activity /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "support", element: <SupportChatPage />, errorElement: supportError },
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
      { path: "number-filtering", element: <NumberFilteringPage base="/reseller" />, errorElement: filteringError },
      { path: "number-filtering/new", element: <NumberFilteringPage base="/reseller" create />, errorElement: filteringError },
      { path: "number-filtering/:id", element: <NumberFilteringPage base="/reseller" />, errorElement: filteringError },
      { path: "users", element: <ResellerUsers /> },
      { path: "credits", element: <ResellerCredits key="credits" /> },
      { path: "activity", element: <Navigate to="/reseller/credits" replace /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "support", element: <SupportChatPage />, errorElement: supportError },
      { path: "settings", element: <ResellerSettings />, errorElement: settingsError },
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
      { path: "number-filtering", element: <NumberFilteringPage base="/user" />, errorElement: filteringError },
      { path: "number-filtering/new", element: <NumberFilteringPage base="/user" create />, errorElement: filteringError },
      { path: "number-filtering/:id", element: <NumberFilteringPage base="/user" />, errorElement: filteringError },
      { path: "credits", element: <UserCredits key="credits" /> },
      { path: "activity", element: <Navigate to="/user/credits" replace /> },
      { path: "notifications", element: <NotificationsPage /> },
      { path: "support", element: <SupportChatPage />, errorElement: supportError },
      { path: "settings", element: <UserSettings />, errorElement: settingsError },
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
    ],
  },
]);
