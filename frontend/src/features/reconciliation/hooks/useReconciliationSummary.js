import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { reconciliationApi } from "../services/reconciliation.api";

export function useReconciliationSummary() {
  const { user } = useAuth();
  const accountId = user?.id || user?._id;
  const allowed = user?.role === "Super Admin" && !user.isPreview && !user.isImpersonation;
  return useQuery({ queryKey: ["credit-reconciliation", accountId, "summary"], queryFn: ({ signal }) => reconciliationApi.summary(signal), enabled: Boolean(accountId && allowed),
    refetchInterval: query => query.state.data?.pending || ["pending", "running", "checking"].includes(query.state.data?.monitor?.state) ? 5000 : 30000, retry: 1 });
}
