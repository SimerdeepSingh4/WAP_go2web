import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { reconciliationApi } from "../services/reconciliation.api";

export default function RecoveryAccountLookup({ onSelect }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(""), [search, setSearch] = useState("");
  const allowed = user?.role === "Super Admin" && !user.isPreview && !user.isImpersonation;
  const query = useQuery({ queryKey: ["credit-reconciliation", user?.id || user?._id, "recovery-accounts", search], queryFn: ({ signal }) => reconciliationApi.recoveryAccounts(search, signal), enabled: Boolean(allowed && open && search.length >= 2), retry: false });
  if (!allowed) return null;
  return <><Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>Recover transaction<ArrowRight /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="credit-review-dialog credit-recovery-lookup"><DialogHeader><DialogTitle>Find the affected account</DialogTitle><DialogDescription>Search clients and resellers, including accounts whose wallet and ledger currently match.</DialogDescription></DialogHeader>
      <form onSubmit={event => { event.preventDefault(); setSearch(draft.trim()); }}><Input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Account name, email or ID" aria-label="Find recovery account" minLength={2} maxLength={100} required /><Button type="submit" variant="outline" aria-label="Search recovery accounts"><Search /></Button></form>
      <div className="credit-recovery-account-results" aria-live="polite">{search.length < 2 ? <p className="credit-caption">Enter at least two characters to find an account.</p> : query.isPending ? <p className="credit-caption"><Loader2 className="animate-spin" />Searching accounts…</p> : query.isError ? <p className="credit-form-error" role="alert">{query.error.message}<Button type="button" variant="outline" size="sm" onClick={() => query.refetch()}>Try again</Button></p> : !query.data?.items.length ? <p className="credit-caption">No matching client or reseller accounts.</p> : query.data.items.map(account => <button type="button" key={account._id} onClick={() => { setOpen(false); onSelect(account._id); }}><span><strong>{account.username}</strong><small>{account.role === "User" ? "Client" : "Reseller"} · {account._id}</small></span><ArrowRight /></button>)}</div>
      {query.data?.hasMore && <p className="credit-caption">Showing the first 20 matches. Refine your search to find the right account.</p>}
    </DialogContent></Dialog></>;
}
