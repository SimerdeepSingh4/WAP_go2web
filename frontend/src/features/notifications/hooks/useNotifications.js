import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { toast } from "@/components/ui/toast";
import api from "@/api/client";
import { accountRestriction } from "../../../../../shared/accountAccess.js";

export function useNotifications(params = {}) {
  const { user } = useAuth();
  const accountId = user?.id || user?._id;
  return useQuery({
    queryKey: ["notifications", accountId, "list", params],
    queryFn: async ({ signal }) => (await api.get("/notifications", { params, signal })).data,
    enabled: Boolean(accountId) && !accountRestriction(user),
    staleTime: 10000, refetchInterval: 60000,
  });
}

export function useNotificationPreferences() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["notifications", user?.id || user?._id, "preferences"], queryFn: async () => (await api.get("/notifications/preferences")).data, enabled: Boolean(user) && !accountRestriction(user) });
}

export function useNotificationAction() {
  const client = useQueryClient();
  const { user } = useAuth();
  const mutationKey = ["notification-action", user?.id || user?._id];
  const pendingActions = useMutationState({
    filters: { mutationKey, status: "pending" },
    select: (mutation) => mutation.state.variables,
  });
  const mutation = useMutation({
    mutationKey,
    mutationFn: async ({ id, ...changes }) => id === "all" ? api.patch(changes.archived ? "/notifications/archive-all" : "/notifications/read-all") : api.patch(`/notifications/${id}`, changes),
    onSuccess: (_, variables) => {
      const refresh = client.invalidateQueries({ queryKey: ["notifications", user?.id || user?._id] });
      localStorage.setItem("notification-sync", String(Date.now()));
      if (variables.id === "all" && variables.archived) toast.add({ title: "Notifications cleared", description: "You can find them under Archived.", type: "success" });
      return refresh;
    },
    onError: (error) => toast.add({ title: error.message, type: "error" }),
  });
  return {
    ...mutation,
    isPending: pendingActions.length > 0,
    isPendingFor: (id) => pendingActions.some((action) => action?.id === id || action?.id === "all"),
    isReadPendingFor: (id) => pendingActions.some((action) => action?.id === id && typeof action.read === "boolean"),
  };
}
