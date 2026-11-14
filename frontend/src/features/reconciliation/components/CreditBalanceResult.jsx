import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useSocket } from "@/features/socket/context/socket.context.jsx";
import { toast } from "@/components/ui/toast";
import { reconciliationApi } from "../services/reconciliation.api";

export default function CreditBalanceResult() {
  const { user } = useAuth();
  const { socket } = useSocket();
  const accountId = user?.id || user?._id;
  const allowed = Boolean(accountId && ["User", "Reseller"].includes(user?.role) && !user.isPreview && !user.isImpersonation);
  const seen = useRef(null);
  const result = useQuery({ queryKey: ["credit-balance-result", accountId], queryFn: ({ signal }) => reconciliationApi.ownResult(signal), enabled: allowed, refetchInterval: 30000, retry: false });
  const { refetch } = result;
  useEffect(() => {
    if (!socket || !allowed) return;
    const update = () => void refetch();
    socket.on("WALLET_UPDATED", update);
    return () => socket.off("WALLET_UPDATED", update);
  }, [socket, refetch, allowed]);
  useEffect(() => {
    const notice = result.data?.result;
    if (!allowed || !notice || typeof notice.balance !== "number" || !Number.isFinite(notice.balance)) return;
    const key = `credit-balance-result:${accountId}`;
    let previous = seen.current;
    try { previous = localStorage.getItem(key); } catch { /* Browser storage can be unavailable. */ }
    if (previous === notice.version) return;
    seen.current = notice.version;
    try { localStorage.setItem(key, notice.version); } catch { /* The in-memory marker still prevents repeated notices. */ }
    toast.add({ title: `Current credit balance: ${notice.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} credits`, type: "success" });
  }, [result.data, accountId, allowed]);
  return null;
}
