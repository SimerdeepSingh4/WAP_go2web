import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { numberFilteringApi } from "../services/numberFiltering.api";

function useFilteringScope() {
  const { user } = useAuth();
  return ["number-filtering", user?.id || user?._id];
}

export function useFilteringRequests(params) {
  const scope = useFilteringScope();
  return useQuery({
    queryKey: [...scope, "list", params],
    queryFn: ({ signal }) => numberFilteringApi.list(params, signal),
    enabled: Boolean(scope[1]),
  });
}

export function useFilteringRequest(id) {
  const scope = useFilteringScope();
  return useQuery({
    queryKey: [...scope, "detail", id],
    queryFn: ({ signal }) => numberFilteringApi.detail(id, signal),
    enabled: Boolean(scope[1] && id),
  });
}

export function useSubmitFilteringRequest() {
  const scope = useFilteringScope();
  const client = useQueryClient();
  return useMutation({
    mutationFn: numberFilteringApi.submit,
    onSuccess: () => {
      for (const key of [scope, ["user", scope[1]], ["reseller", scope[1]], ["myBalance"], ["creditTransactions"]]) {
        void client.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useSaveFilteringResults() {
  const scope = useFilteringScope();
  const client = useQueryClient();
  return useMutation({
    mutationFn: numberFilteringApi.save,
    onSuccess: () => client.invalidateQueries({ queryKey: scope }),
    onError: error => {
      if (error.response?.status === 409) void client.invalidateQueries({ queryKey: scope });
    },
  });
}
