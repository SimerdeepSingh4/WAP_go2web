// src/features/user/hooks/useUser.js
import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { toast } from "@/components/ui/toast";
import { userQueries, userActions } from "../services/user.api"; // Adjust path if needed

/**
 * Generic query hook for user‑facing resources.
 * Mirrors the pattern used by `useResellerQuery` and `useAdminQuery`.
 */
export function useUserQuery(resource, params = {}, enabled = true) {
  const { user } = useAuth();
  const accountId = user?.id || user?._id;
  const query = useQuery({
    queryKey: ["user", accountId, resource, params],
    queryFn: ({ signal }) => userQueries[resource](params, signal),
    // Only enable for logged‑in users with role "User"
    enabled: enabled && user?.role === "User" && !user?.isPreview,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (query.error) {
      toast.add({
        id: `user-load-${resource}-${accountId}`,
        title: "Unable to load data",
        description: query.error.message,
        type: "error",
      });
    }
  }, [query.error, query.errorUpdatedAt, resource, accountId]);

  return query;
}

/**
 * Generic mutation hook for user actions.
 */
export function useUserMutation(action, successMessage, onSuccess) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: userActions[action],
    onSuccess: async (data) => {
      toast.add({ title: successMessage, type: "success" });
      await client.invalidateQueries({ queryKey: ["user"] });
      // Invalidate any shared keys that might be used elsewhere.
      for (const key of ["dashboardStats", "myBalance", "creditTransactions"]) {
        client.invalidateQueries({ queryKey: [key] });
      }
      onSuccess?.(data);
    },
    onError: (error) =>
      toast.add({ title: "Changes were not saved", description: error.message, type: "error" }),
  });
}
