import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { toast } from "@/components/ui/toast";
import { adminActions, adminQueries } from "../services/admin.api";

export function useAdminQuery(resource, params = {}, enabled = true) {
  const { user } = useAuth();
  const accountId = user?.id || user?._id;
  const query = useQuery({
    queryKey: ["admin", accountId, resource, params],
    queryFn: ({ signal }) => adminQueries[resource](params, signal),
    enabled: enabled && user?.role === "Super Admin" && !user?.isPreview,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (query.error) toast.add({
      id: `admin-load-${resource}-${accountId}`,
      title: "Unable to load data",
      description: query.error.message,
      type: "error",
    });
  }, [query.error, query.errorUpdatedAt, resource, accountId]);
  return query;
}

export function useAdminMutation(action, successMessage, onSuccess) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: adminActions[action],
    onSuccess: async (data) => {
      toast.add({ title: successMessage, type: "success" });
      await client.invalidateQueries({ queryKey: ["admin"] });
      // Keep the original portal views consistent with administrative edits.
      for (const key of ["dashboardStats", "managedUsers", "clientUsers", "campaignsList", "myBalance", "creditTransactions"]) {
        client.invalidateQueries({ queryKey: [key] });
      }
      onSuccess?.(data);
    },
    onError: (error) => toast.add({ title: "Changes were not saved", description: error.message, type: "error" }),
  });
}
