import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { toast } from "@/components/ui/toast";
import api from "@/api/client";

export function useNotifications(params = {}) {
  const { user } = useAuth();
  const accountId = user?.id || user?._id;
  return useQuery({
    queryKey: ["notifications", accountId, "list", params],
    queryFn: async ({ signal }) => (await api.get("/notifications", { params, signal })).data,
    enabled: Boolean(accountId) && !user?.isExpired,
    staleTime: 10000, refetchInterval: 60000,
  });
}

export function useNotificationPreferences() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["notifications", user?.id || user?._id, "preferences"], queryFn: async () => (await api.get("/notifications/preferences")).data, enabled: Boolean(user) && !user.isExpired });
}

export function useNotificationAction() {
  const client = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...changes }) => id === "all" ? api.patch("/notifications/read-all") : api.patch(`/notifications/${id}`, changes),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["notifications", user?.id || user?._id] });
      localStorage.setItem("notification-sync", String(Date.now()));
    },
    onError: (error) => toast.add({ title: error.message, type: "error" }),
  });
}
