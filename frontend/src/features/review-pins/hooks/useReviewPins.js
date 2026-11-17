import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { reviewPinsApi } from "../api/reviewPins.api";
import { useAuthContext } from "@/features/auth/context/auth.context";

export function usePins() {
  const { pathname } = useLocation();
  const { user, isLoading } = useAuthContext();
  return useQuery({
    queryKey: ["review-pins", pathname],
    queryFn: ({ signal }) => reviewPinsApi.list(pathname, signal),
    enabled: Boolean(user) && !isLoading,
    retry: (failureCount, error) => !["AUTH_REQUIRED", "BROWSER_SESSION_CHANGED"].includes(error.code) && ![401, 403].includes(error.response?.status) && failureCount < 1,
    staleTime: 30_000,
  });
}

export const useReviewPins = usePins;

export function useCreatePin() {
  const qc = useQueryClient();
  const { pathname } = useLocation();
  return useMutation({
    mutationFn: reviewPinsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["review-pins", pathname] }),
  });
}

export function useDeletePin() {
  const qc = useQueryClient();
  const { pathname } = useLocation();
  return useMutation({
    mutationFn: (id) => reviewPinsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["review-pins", pathname] }),
  });
}

export function useResolvePin() {
  const qc = useQueryClient();
  const { pathname } = useLocation();
  return useMutation({
    mutationFn: reviewPinsApi.resolve,
    onSuccess: (pin) => {
      qc.setQueryData(["review-pins", pathname], pins => pins?.map(item => item._id === pin._id ? pin : item));
      return qc.invalidateQueries({ queryKey: ["review-pins", pathname] });
    },
  });
}
