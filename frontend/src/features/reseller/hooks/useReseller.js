import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { toast } from "@/components/ui/toast";
import { resellerQueries, resellerActions } from "../services/reseller.api";

export function useResellerQuery(resource, params = {}, enabled = true) {
  const { user } = useAuth();
  const accountId = user?.id || user?._id;
  const query = useQuery({
    queryKey: ["reseller", accountId, resource, params],
    queryFn: ({ signal }) => resellerQueries[resource](params, signal),
    enabled: enabled && user?.role === "Reseller",
    staleTime: 30_000,
  });
  useEffect(() => {
    if (query.error) toast.add({
      id: `reseller-load-${resource}-${accountId}`,
      title: "Unable to load data",
      description: query.error.message,
      type: "error",
    });
  }, [query.error, query.errorUpdatedAt, resource, accountId]);
  return query;
}

export function useResellerMutation(action, successMessage, onSuccess) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: resellerActions[action],
    onSuccess: async (data) => {
      toast.add({ title: successMessage, type: "success" });
      await client.invalidateQueries({ queryKey: ["reseller"] });
      // Also invalidate any shared query keys
      for (const key of ["dashboardStats", "managedUsers", "campaignsList", "myBalance", "creditTransactions"]) {
        client.invalidateQueries({ queryKey: [key] });
      }
      onSuccess?.(data);
    },
    onError: (error) => toast.add({ title: "Changes were not saved", description: error.message, type: "error" }),
  });
}
