import React from "react";
import { useAuth } from "../features/auth/hooks/useAuth.js";
import { exitPreview } from "../features/dashboard/services/users.api.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";

export default function PreviewBanner() {
  const { user } = useAuth();
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
      alert(`Error exiting preview: ${err.message}`);
    },
  });

  if (!user?.isPreview) return null;

  return (
    <aside
      aria-label="Account Preview Status Banner"
      className="bg-amber-400 text-stone-900 px-4 py-2.5 text-xs font-medium flex flex-wrap items-center justify-between gap-3 shadow-xs z-50 sticky top-0 border-b border-amber-500/20"
    >
      <div className="flex items-center gap-2.5">
        <span className="font-bold uppercase tracking-wider text-[10px] bg-stone-900 text-amber-300 px-2 py-0.5 rounded">
          Preview Mode
        </span>
        <span>
          Viewing client account: <strong>{user.username}</strong> ({user.email}).
          Sensitive actions (like password changes or account deletion) are disabled.
        </span>
      </div>

      <button
        onClick={() => exitMutation.mutate()}
        disabled={exitMutation.isPending}
        className="px-3.5 py-1 bg-stone-900 text-amber-300 hover:bg-stone-800 rounded font-semibold text-xs cursor-pointer transition-colors disabled:opacity-50"
      >
        {exitMutation.isPending ? "Restoring..." : "Exit Preview Mode ✕"}
      </button>
    </aside>
  );
}
