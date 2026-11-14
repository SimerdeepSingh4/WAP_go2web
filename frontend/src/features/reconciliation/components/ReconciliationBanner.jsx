import { useEffect, useLayoutEffect, useRef } from "react";
import { Link, useLocation } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, ShieldAlert } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useSocket } from "@/features/socket/context/socket.context.jsx";
import { useReconciliationSummary } from "../hooks/useReconciliationSummary";
import "../reconciliation.css";

export default function ReconciliationBanner() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { socket } = useSocket();
  const client = useQueryClient();
  const query = useReconciliationSummary();
  const ref = useRef(null);
  const allowed = user?.role === "Super Admin" && !user.isPreview && !user.isImpersonation;
  const problem = query.isError || query.data?.monitor?.healthy === false || query.data?.retrying > 0;
  const shown = allowed && !pathname.startsWith("/admin/reconciliation") && Boolean(query.data?.open || problem);
  useEffect(() => {
    if (!socket || !allowed) return;
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => void client.invalidateQueries({ queryKey: ["credit-reconciliation"] }), 250); };
    socket.on("CREDIT_RECONCILIATION_CHANGED", refresh);
    return () => { clearTimeout(timer); socket.off("CREDIT_RECONCILIATION_CHANGED", refresh); };
  }, [socket, client, allowed]);
  useLayoutEffect(() => {
    const element = ref.current, layout = element?.closest(".portal-inset");
    if (!element || !layout) return;
    const measure = () => layout.style.setProperty("--credit-banner-height", `${element.getBoundingClientRect().height + 16}px`);
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => { observer.disconnect(); layout.style.removeProperty("--credit-banner-height"); };
  }, [shown]);
  if (!shown) return null;
  return <aside ref={ref} className="credit-reconciliation-banner" role="status"><ShieldAlert aria-hidden="true" /><div><strong>{query.data?.open ? `${query.data.open} credit ${query.data.open === 1 ? "account needs" : "accounts need"} review` : "Credit monitoring needs attention"}</strong><p>{query.isError ? "The credit monitor is unavailable. Review its status before making a correction." : problem ? "Some checks could not complete. Existing cases and evidence are retained." : `${query.data.confirmed} balance mismatches · ${query.data.unverified} conflicting records`}</p></div><Link to="/admin/reconciliation">Review credits<ArrowUpRight /></Link></aside>;
}
