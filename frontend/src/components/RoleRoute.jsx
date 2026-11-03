import React from "react";
import { Navigate, Link, useNavigate } from "react-router";
import { useAuth } from "../features/auth/hooks/useAuth.js";
import { exitPreview } from "../features/dashboard/services/users.api.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";

/**
 * Checks if a user's role has permission, considering role hierarchy & preview mode:
 * - If the user is in Preview Mode, their original manager role (Super Admin / Reseller) is considered!
 * - Super Admin has access to all areas (Super Admin, Reseller, and User).
 * - Reseller has access to Reseller and User areas.
 * - User has access to User areas only.
 */
export function hasRolePermission(userRole, allowedRoles = [], originalRole = null) {
  if (!userRole) return false;
  if (allowedRoles.length === 0) return true;

  // If in Preview Mode, use the original manager's role if it grants higher access
  const rolesToCheck = [userRole];
  if (originalRole) {
    rolesToCheck.push(originalRole);
  }

  for (const role of rolesToCheck) {
    if (allowedRoles.includes(role)) return true;
    if (role === "Super Admin") return true;
    if (role === "Reseller" && allowedRoles.includes("User")) return true;
  }

  return false;
}

export default function RoleRoute({ allowedRoles = [], children }) {
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const exitMutation = useMutation({
    mutationFn: exitPreview,
    onSuccess: (data) => {
      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      queryClient.setQueryData(["authUser"], data.user);
      queryClient.invalidateQueries({ queryKey: ["activeSessions"] });
      queryClient.invalidateQueries({ queryKey: ["clientUsers"] });
      navigate(data.user?.role === "Super Admin" ? "/admin" : "/reseller");
    },
    onError: (err) => {
      alert(`Could not exit preview: ${err.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf8f5] text-[#18181b]">
        <div className="animate-spin size-8 border-4 border-[#18181b] border-t-transparent rounded-full" />
      </div>
    );
  }

  // Not logged in -> redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const originalRole = user.isPreview ? user.originalAdmin?.role : null;

  // Check role with hierarchy inheritance and preview check
  if (!hasRolePermission(user.role, allowedRoles, originalRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf8f5] px-6 py-12">
        <div className="max-w-md w-full bg-white rounded-xl border border-[#e7e4dc] p-8 text-center shadow-xs">
          <div className="mx-auto size-12 grid place-items-center rounded-full bg-[#fef2f2] text-[#b91c1c] mb-4">
            <svg
              className="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-[#1c1917] mb-2">Access Restricted</h2>
          <p className="text-sm text-[#78716c] mb-4">
            Your current account role is <span className="font-semibold text-[#b91c1c]">{user.role}</span>.
            This area requires:{" "}
            <span className="font-semibold text-[#1c1917]">{allowedRoles.join(" or ")}</span>.
          </p>

          <div className="flex flex-col gap-2.5">
            {user.isPreview ? (
              <button
                onClick={() => exitMutation.mutate()}
                disabled={exitMutation.isPending}
                className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-[#ea580c] hover:bg-[#c2410c] text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
              >
                {exitMutation.isPending ? "Restoring Account..." : "Exit Preview & Return to Admin Panel ✕"}
              </button>
            ) : null}

            <Link
              to="/"
              className="inline-flex items-center justify-center px-4 py-2 bg-[#18181b] text-white text-xs font-semibold rounded-lg hover:bg-[#27272a] transition-colors"
            >
              ← Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
