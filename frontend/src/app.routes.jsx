import { createBrowserRouter, Navigate, Link } from "react-router";
import LoginPage from "./features/auth/pages/Login.jsx";
import { useAuth } from "./features/auth/hooks/useAuth.js";
import ActiveDevices from "./features/auth/components/ActiveDevices.jsx";
import RoleRoute from "./components/RoleRoute.jsx";
import ResellerDashboard from "./features/dashboard/pages/ResellerDashboard.jsx";
import PreviewBanner from "./components/PreviewBanner.jsx";

function AdminPortal() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-[#fafbf8] p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-[#dde3d5] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-700">
              Super Admin Area
            </span>
            <Link to="/" className="text-xs text-[#315e48] hover:underline">
              ← Back to Main Dashboard
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-[#334331]">Platform Administration</h1>
          <p className="text-sm text-[#68765a] mt-1 mb-4">
            Only Super Admins can access this page. Here you manage platform-wide settings and reseller allocations.
          </p>
          <div className="p-4 rounded-lg bg-[#f3f5ee] text-xs text-[#405036] space-y-1">
            <p><strong>Signed in as:</strong> {user?.email}</p>
            <p><strong>Role:</strong> {user?.role}</p>
            <p><strong>Permissions:</strong> Full Global Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResellerPortal() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-[#fafbf8] p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-white rounded-xl border border-[#dde3d5] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
              Reseller & Admin Area
            </span>
            <Link to="/" className="text-xs text-[#315e48] hover:underline">
              ← Back to Main Dashboard
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-[#334331]">Reseller Credits Portal</h1>
          <p className="text-sm text-[#68765a] mt-1 mb-4">
            Accessible by Resellers and Super Admins. Here resellers manage their clients and assign credit quotas.
          </p>
          <div className="p-4 rounded-lg bg-[#f3f5ee] text-xs text-[#405036] space-y-1">
            <p><strong>Signed in as:</strong> {user?.email}</p>
            <p><strong>Role:</strong> {user?.role}</p>
            <p><strong>Permissions:</strong> Reseller Credit Management</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { user, logout, isLoggingOut, logoutAll, isLoggingOutAll } = useAuth();

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
      <div className="max-w-2xl mx-auto space-y-6">
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
      <RoleRoute allowedRoles={["Super Admin"]}>
        <AdminPortal />
      </RoleRoute>
    ),
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
