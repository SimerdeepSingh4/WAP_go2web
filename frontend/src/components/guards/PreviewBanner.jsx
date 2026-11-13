import { useAuth } from "../../features/auth/hooks/useAuth.js";
import { exitPreview, exitFullAccessImpersonation } from "../../features/accounts/services/users.api.js";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";

export default function PreviewBanner() {
  const { user, checkAuth } = useAuth();
  const navigate = useNavigate();

  const exitMutation = useMutation({
    mutationFn: () => user?.isImpersonation ? exitFullAccessImpersonation() : exitPreview(),
    onSuccess: async () => {
      await checkAuth();
      navigate("/", { replace: true });
    },
    onError: (err) => {
      alert(`Error exiting preview: ${err.message}`);
    },
  });

  if (!user?.isPreview && !user?.isImpersonation) return null;

  return (
    <aside
      aria-label="Account access status"
      className="bg-amber-400 text-stone-900 px-4 py-2.5 text-xs font-medium flex flex-wrap items-center justify-between gap-3 shadow-xs z-50 sticky top-0 border-b border-amber-500/20"
    >
      <div className="flex items-center gap-2.5">
        <span className="font-bold uppercase tracking-wider text-[10px] bg-stone-900 text-amber-300 px-2 py-0.5 rounded">
          {user.isPreview ? "Preview Mode" : "Admin account access"}
        </span>
        <span>
          {user.isPreview ? "Viewing" : "Acting as"} client account: <strong>{user.username}</strong> ({user.email}).
          {user.isPreview ? " Sensitive actions are disabled." : " Actions are recorded under your administrator account."}
        </span>
      </div>

      <button
        onClick={() => exitMutation.mutate()}
        disabled={exitMutation.isPending}
        className="px-3.5 py-1 bg-stone-900 text-amber-300 hover:bg-stone-800 rounded font-semibold text-xs cursor-pointer transition-colors disabled:opacity-50"
      >
        {exitMutation.isPending ? "Restoring..." : "Exit account access"}
      </button>
    </aside>
  );
}
