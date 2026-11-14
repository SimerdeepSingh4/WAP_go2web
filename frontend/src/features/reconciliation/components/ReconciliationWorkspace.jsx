import { useState } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { reconciliationApi } from "../services/reconciliation.api";
import { useReconciliationSummary } from "../hooks/useReconciliationSummary";
import { PageHeading } from "@/features/dashboard/components/shared";
import RecoveryAccountLookup from "./RecoveryAccountLookup";

const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const statusText = { confirmed: "Balance mismatch", cannot_confirm: "Conflicting records", matched: "Balances match" };

export default function ReconciliationWorkspace({ renderAccount }) {
  const { user } = useAuth();
  const accountId = user?.id || user?._id;
  const allowed = user?.role === "Super Admin" && !user.isPreview && !user.isImpersonation;
  const [params, setParams] = useSearchParams();
  const selected = params.get("account") || "";
  const validId = /^[a-f\d]{24}$/i.test(selected);
  const [state, setState] = useState("open"), [page, setPage] = useState(1), [search, setSearch] = useState(""), [draftSearch, setDraftSearch] = useState("");
  const summary = useReconciliationSummary();
  const client = useQueryClient();
  const cases = useQuery({ queryKey: ["credit-reconciliation", accountId, "cases", state, page, search], queryFn: ({ signal }) => reconciliationApi.cases({ state, page, search }, signal), enabled: Boolean(allowed && accountId), refetchInterval: 30000 });
  const scan = useMutation({ mutationFn: reconciliationApi.scan, onSuccess: () => { void client.invalidateQueries({ queryKey: ["credit-reconciliation"] }); toast.add({ title: "Credit scan started", description: "Every wallet will be checked. Scanning does not change balances.", type: "success" }); }, onError: error => toast.add({ title: "Scan could not start", description: error.message, type: "error" }) });
  if (!allowed) return <div className="credit-empty"><ShieldAlert /><strong>Super Admin access required</strong><p>Reconciliation is available in your own Super Admin workspace.</p></div>;
  const monitor = summary.data?.monitor;
  return <div className="credit-reconciliation-page" data-account-open={validId || undefined}>
    {!validId && <PageHeading title="Reconciliation" description="Review credit balances and resolve discrepancies." action={<Button type="button" variant="outline" size="sm" disabled={cases.isFetching || summary.isFetching} onClick={() => { void client.invalidateQueries({ queryKey: ["credit-reconciliation"] }); }}><RefreshCw />Refresh</Button>} />}
    {(summary.isError || monitor?.healthy === false || summary.data?.retrying > 0 || summary.data?.postingFailures > 0) && <p className="credit-evidence-note" role="status">{summary.isError ? "Monitoring status is unavailable." : summary.data?.postingFailures ? `${summary.data.postingFailures} credit operations were stopped in the last 15 minutes. Review the audit log before retrying accounting failures.` : monitor?.error || "Some credit checks need attention. Pending checks are retained for retry."}</p>}
    {validId ? <><div className="credit-breadcrumb"><button type="button" onClick={() => setParams({})}><ArrowLeft />Reconciliation</button></div>{renderAccount(selected)}</> : <section className="credit-accounts-section" aria-label="Reconciliation accounts">
      <div className="credit-accounts-toolbar"><h2>Accounts</h2><div className="credit-accounts-tools"><RecoveryAccountLookup onSelect={id => setParams({ account: String(id), action: "recover" })} /><form className="credit-case-search" onSubmit={event => { event.preventDefault(); setSearch(draftSearch.trim()); setPage(1); }}><Search /><Input aria-label="Search reconciliation accounts" placeholder="Search accounts…" value={draftSearch} onChange={event => setDraftSearch(event.target.value)} /><button type="submit" aria-label="Search accounts"><ArrowRight /></button></form><Button type="button" variant="outline" size="sm" disabled={scan.isPending || ["pending", "running", "checking"].includes(monitor?.state)} onClick={() => scan.mutate()}>{scan.isPending ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Scan all wallets</Button></div></div>
      <div className="credit-account-filters"><div className="credit-mini-tabs">{[["open", "Needs review"], ["resolved", "Resolved"], ["all", "All history"]].map(([value, label]) => <button type="button" key={value} aria-pressed={state === value} onClick={() => { setState(value); setPage(1); }}>{label}{value === "open" && summary.data?.open > 0 && <span>{number(summary.data.open)}</span>}</button>)}</div><span>{cases.data?.pagination.total ?? "—"} accounts</span></div>
      {cases.isPending ? <p className="credit-loading"><Loader2 className="animate-spin" />Loading accounts…</p> : cases.isError ? <div className="credit-form-error" role="alert">{cases.error.message}<Button type="button" variant="outline" onClick={() => cases.refetch()}>Try again</Button></div> : !cases.data.items.length ? <div className="credit-empty credit-clear-state"><span><ShieldCheck /></span><strong>{state === "open" && !search ? "Everything is accounted for" : "No accounts found"}</strong><p>{summary.data?.pending ? "Checks are running. Any discrepancies will appear here." : state === "open" && !search ? "No wallet discrepancies need your attention. Automatic monitoring will flag any new difference." : "Try another search or change the view."}</p>{state === "open" && !search && <span className="credit-clear-footnote">Matching accounts are kept out of your review queue.</span>}</div> : <div className="credit-account-table-wrap"><table className="credit-account-table"><thead><tr><th>Account</th><th>Review status</th><th>Wallet</th><th>Ledger</th><th>Difference</th><th aria-label="Actions" /></tr></thead><tbody>{cases.data.items.map(item => <tr key={item._id}><td data-label="Account"><span className="credit-table-account"><span className="credit-account-avatar">{item.summary.account.username.slice(0, 2).toUpperCase()}</span><span><strong>{item.summary.account.username}</strong><small>{item.summary.account.role === "User" ? "Client" : item.summary.account.role}</small></span></span></td><td data-label="Status"><span className="credit-state" data-state={item.classification}>{statusText[item.classification]}</span></td><td data-label="Wallet">{number(item.summary.walletBalance)}</td><td data-label="Ledger">{number(item.summary.expectedBalance)}</td><td data-label="Difference"><span className="credit-table-difference" data-zero={item.summary.difference === 0}>{item.summary.difference > 0 ? "+" : ""}{number(item.summary.difference)}<small> credits</small></span></td><td><Button type="button" variant="ghost" size="sm" onClick={() => { setParams({ account: String(item.userId) }); document.querySelector(".portal-main")?.scrollTo({ top: 0 }); }} aria-label={`Review ${item.summary.account.username}`}>Review<ArrowUpRight /></Button></td></tr>)}</tbody></table></div>}
      {cases.data?.pagination && <div className="credit-pager"><span>{cases.data.pagination.total} accounts · Page {page} of {cases.data.pagination.pages}</span><div><Button type="button" size="icon-sm" variant="outline" aria-label="Previous accounts page" disabled={page <= 1 || cases.isFetching} onClick={() => setPage(page - 1)}><ChevronLeft /></Button><Button type="button" size="icon-sm" variant="outline" aria-label="Next accounts page" disabled={page >= cases.data.pagination.pages || cases.isFetching} onClick={() => setPage(page + 1)}><ChevronRight /></Button></div></div>}
    </section>}
  </div>;
}
