import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toast";
import { creditsApi } from "../services/credits.api";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getCreditPurchaseError } from "../lib/creditTransactionDisplay";

export function useCreditRates(params = {}, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["creditRates", user?._id || user?.id, params],
    queryFn: ({ signal }) => creditsApi.getRates(params, signal),
    enabled: enabled && Boolean(user),
    staleTime: 30_000,
  });
}

export function useSetCreditRate(onSuccess) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: creditsApi.setRate,
    onSuccess: (data) => {
      toast.add({ title: "Purchase rate configured successfully", type: "success" });
      onSuccess?.(data);
      return queryClient.invalidateQueries({ queryKey: ["creditRates"] });
    },
    onError: (error) => {
      toast.add({ title: "Failed to configure rate", description: error.message, type: "error" });
    },
  });
}

export function usePaymentInstructions(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["myPaymentInstructions", user?._id || user?.id],
    queryFn: ({ signal }) => creditsApi.getPaymentInstructions(undefined, signal),
    enabled: enabled && Boolean(user) && ["Super Admin", "Reseller"].includes(user?.role),
    staleTime: 60_000,
  });
}

export function useUpdatePaymentInstructions(onSuccess) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: creditsApi.updatePaymentInstructions,
    onMutate: () => ["myPaymentInstructions", user?._id || user?.id],
    onSuccess: async (data, _instructions, queryKey) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData(queryKey, data);
      toast.add({ title: "Payment instructions saved successfully", type: "success" });
      onSuccess?.(data);
    },
    onError: (error) => {
      toast.add({ title: "Failed to save instructions", description: error.message, type: "error" });
    },
  });
}

export function useSellerPaymentInstructions(category = "CAMPAIGN", enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["sellerPaymentInstructions", user?._id || user?.id, category],
    queryFn: ({ signal }) => creditsApi.getSellerPaymentInstructions({ category }, signal),
    enabled: enabled && Boolean(user) && user?.role !== "Super Admin",
    retry: 1,
    staleTime: 60_000,
  });
}

export function usePurchasesList(params = {}, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["creditPurchases", user?._id || user?.id, params],
    queryFn: ({ signal }) => creditsApi.listPurchases(params, signal),
    enabled: enabled && Boolean(user),
    staleTime: 15_000,
  });
}

export function useCreateQuote(onSuccess) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: creditsApi.createQuote,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["creditPurchases"] });
      onSuccess?.(data);
    },
    onError: (error) => {
      toast.add({ title: "Failed to generate quote", description: getCreditPurchaseError(error.message), type: "error" });
    },
  });
}

export function useSubmitProof(onSuccess) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: creditsApi.submitProof,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["creditPurchases"] });
      onSuccess?.(data);
    },
    onError: (error) => {
      toast.add({ title: "Failed to submit proof", description: error.message, type: "error" });
    },
  });
}

export function useApprovePurchase(onSuccess, onError) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: creditsApi.approvePurchase,
    onSuccess: (data) => {
      toast.add({ title: "Purchase approved and credits allocated!", type: "success" });
      queryClient.invalidateQueries({ queryKey: ["creditPurchases"] });
      queryClient.invalidateQueries({ queryKey: ["myBalance"] });
      queryClient.invalidateQueries({ queryKey: ["admin"] });
      queryClient.invalidateQueries({ queryKey: ["reseller"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      onSuccess?.(data);
    },
    onError: (error) => {
      if (onError) {
        onError(error);
        return;
      }
      toast.add({ title: "Failed to approve purchase", description: getCreditPurchaseError(error.message), type: "error" });
    },
  });
}

export function useRejectPurchase(onSuccess) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: creditsApi.rejectPurchase,
    onSuccess: (data) => {
      toast.add({ title: "Purchase rejected", type: "info" });
      queryClient.invalidateQueries({ queryKey: ["creditPurchases"] });
      queryClient.invalidateQueries({ queryKey: ["myBalance"] });
      onSuccess?.(data);
    },
    onError: (error) => {
      toast.add({ title: "Failed to reject purchase", description: getCreditPurchaseError(error.message), type: "error" });
    },
  });
}

export function useFlagPurchase(onSuccess) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: creditsApi.flagPurchase,
    onSuccess: (data) => {
      toast.add({ title: "Purchase flagged for buyer correction", type: "success" });
      queryClient.invalidateQueries({ queryKey: ["creditPurchases"] });
      onSuccess?.(data);
    },
    onError: (error) => {
      toast.add({ title: "Could not flag purchase", description: error.message, type: "error" });
    },
  });
}

export function useFixPurchaseProof(onSuccess) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: creditsApi.fixPurchaseProof,
    onSuccess: (data) => {
      toast.add({ title: "Payment proof resubmitted for review", type: "success" });
      queryClient.invalidateQueries({ queryKey: ["creditPurchases"] });
      onSuccess?.(data);
    },
    onError: (error) => {
      toast.add({ title: "Failed to resubmit payment proof", description: error.message, type: "error" });
    },
  });
}
