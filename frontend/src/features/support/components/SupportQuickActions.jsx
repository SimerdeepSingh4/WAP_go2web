import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, CircleHelp, ClipboardCheck, History, Loader2, LockKeyhole, Plus, ReceiptText, RefreshCw, Search, Settings2, ShieldCheck, UnlockKeyhole, UserRound, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useSocket } from "@/features/socket/context/socket.context.jsx";
import { supportApi } from "../services/support.api";
import { accountActionPayload, supportDate, supportMenuActions } from "../lib/quickActions";
import { accountRestriction } from "../../../../../shared/accountAccess.js";
import { RadialMenu } from "@/components/ui/radial-menu";
import SupportTransactionCard from "./SupportTransactionCard";
import "./support-quick-actions.css";

const issues = [
  { id: "credit", label: "Credits", title: "Credit help", description: "Check the wallet or get help with credits.", Icon: Wallet },
  { id: "transaction", label: "Transaction", title: "Transaction help", description: "Find an entry and share its reference in this conversation.", Icon: ReceiptText },
  { id: "expired", label: "Expired account", title: "Account renewal", description: "Check account validity and request or review a renewal.", Icon: CalendarDays },
  { id: "blocked", label: "Blocked account", title: "Account access", description: "Review the restriction and the next step to restore access.", Icon: LockKeyhole },
  { id: "allocate", label: "Allocate credits", title: "Allocate credits", description: "Transfer credits to this conversation’s account after reviewing the amount.", Icon: Plus },
  { id: "escalate", label: "Request Super Admin", title: "Request Super Admin", description: "Bring in specialist help with the issue and the checks you have performed.", Icon: ShieldCheck },
  { id: "credit-validity", label: "Credit validity", title: "Credit validity and lock", description: "Super Admin can manage credit expiry and wallet restrictions independently of account access.", Icon: Settings2 },
  { id: "ledger-audit", label: "Ledger audit", title: "Ledger audit", description: "Compare the wallet with recorded credit movements. This check does not modify any balance.", Icon: ClipboardCheck },
];
const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function Action({ Icon, title, description, onClick, disabled, primary }) {
  return <button type="button" className="support-tool-action" data-primary={primary || undefined} onClick={onClick} disabled={disabled}>
    <span className="support-tool-action-icon"><Icon aria-hidden="true" /></span><span><strong>{title}</strong>{description && <small>{description}</small>}</span><ArrowUpRight className="support-tool-action-arrow" aria-hidden="true" />
  </button>;
}

export default function SupportQuickActions({ children, conversation, user, disabled, onDraft, onEscalate, needsAdmin, onChanged }) {
  const { checkAuth } = useAuth();
  const { socket } = useSocket();
  const client = useQueryClient();
  const id = conversation?._id;
  const viewerId = String(user.id || user._id);
  const [issue, setIssue] = useState(null);
  const [view, setView] = useState("issue");
  const [values, setValues] = useState({ amount: "", note: "", expiresAt: "" });
  const [reviewing, setReviewing] = useState(false);
  const [reference, setReference] = useState("");
  const [lookup, setLookup] = useState("");
  const [formError, setFormError] = useState("");
  const [actionAccount, setActionAccount] = useState(null);
  const [actionWallet, setActionWallet] = useState(null);
  const submitting = useRef(false);
  const dialogRef = useRef(null);
  const contextKey = ["support", viewerId, "tools", id];
  const context = useQuery({
    queryKey: contextKey,
    queryFn: async ({ signal }) => {
      const response = await supportApi.getContext(id, signal);
      if (!response.data?.account || !response.data?.wallet || !response.data?.capabilities) throw new Error("Account details are unavailable. Please try again.");
      return response;
    },
    enabled: Boolean(id && issue), refetchInterval: issue ? 30000 : false,
  });
  const data = context.data?.data;
  const { account, wallet, capabilities } = data || {};
  const isRequester = String(account?.id) === viewerId;
  const readOnly = Boolean(user.isPreview || accountRestriction(user));
  const canChange = Boolean(!disabled && !readOnly && data && !context.isError);
  const transactions = useQuery({ queryKey: [...contextKey, "transactions", account?.id, lookup], queryFn: async ({ signal }) => {
    const response = await supportApi.getTransactions(id, lookup, signal);
    if (String(response.accountId) !== String(account.id)) throw new Error("These entries do not belong to the selected account. Please refresh the conversation.");
    return response;
  }, enabled: Boolean(id && issue && data && view === "transactions"), retry: false });
  const ledger = useQuery({ queryKey: [...contextKey, "ledger"], queryFn: ({ signal }) => supportApi.getLedger(id, signal), enabled: Boolean(id && issue === "ledger-audit" && capabilities?.auditLedger), retry: false });
  const mutation = useMutation({
    mutationFn: async () => {
      if (view === "allocate") return supportApi.allocateCredits({ toUserId: actionAccount.id, amount: Number(values.amount), notes: values.note.trim(), supportConversationId: id, ...(user.role === "Super Admin" ? { expiryYears: 2 } : {}) });
      if (view === "request") return supportApi.requestCredits({ amount: Number(values.amount), note: values.note.trim(), supportConversationId: id });
      if (view === "wallet-settings") return supportApi.walletAction(id, { expiresAt: values.expiresAt || null, isLocked: values.isLocked, expectedUpdatedAt: actionWallet.updatedAt });
      return supportApi.accessAction(id, accountActionPayload(view, actionAccount, values.expiresAt));
    },
    onSuccess: () => {
      setIssue(null);
      void client.invalidateQueries({ queryKey: ["support", viewerId] });
      void client.invalidateQueries({ queryKey: ["reseller"] });
      void client.invalidateQueries({ queryKey: ["admin"] });
      onChanged();
      toast.add({ title: "Action completed", description: "The result has been recorded in this conversation.", type: "success" });
    },
  });
  useEffect(() => {
    if (!socket || !id || !issue) return;
    const refresh = () => { void client.invalidateQueries({ queryKey: ["support", viewerId, "tools", id] }); };
    const events = ["WALLET_UPDATED", "ACCOUNT_ACCESS_CHANGED", "SUPPORT_CONVERSATION_UPDATED"];
    events.forEach(event => socket.on(event, refresh));
    return () => events.forEach(event => socket.off(event, refresh));
  }, [socket, client, viewerId, id, issue]);

  function openIssue(next) {
    setIssue(next); setView(next === "transaction" ? "transactions" : "issue");
    setReference(""); setLookup(""); setFormError(""); mutation.reset();
  }
  function openAction(action) {
    mutation.reset(); setActionAccount(account); setFormError(""); setReviewing(false);
    setActionWallet(wallet);
    setValues({ amount: "", note: "", expiresAt: action === "wallet-settings" ? wallet.expiresAt?.slice(0, 10) || "" : "", isLocked: Boolean(wallet.lockEnabled) }); setView(action);
  }
  function close() { if (!mutation.isPending) setIssue(null); }
  function draft(text) { if (onDraft(text)) setIssue(null); }
  function escalate(text) { setIssue(null); onEscalate(text); }
  async function refreshAccess() {
    const results = await Promise.allSettled([context.refetch(), ...(isRequester ? [checkAuth()] : [])]);
    if (results.some(result => result.status === "rejected" || result.value?.isError)) toast.add({ title: "Could not refresh account details", type: "error" });
  }
  function submit(event) {
    event.preventDefault(); event.stopPropagation();
    if (submitting.current || mutation.isPending || !canChange) return;
    if (!reviewing) {
      if (["allocate", "request"].includes(view) && (!Number.isFinite(Number(values.amount)) || Number(values.amount) < 0.01)) { setFormError("Enter at least 0.01 credits."); return; }
      if (view === "extend-expiry") {
        const expiry = new Date(`${values.expiresAt}T23:59:59.999Z`);
        if (!values.expiresAt || !Number.isFinite(expiry.getTime()) || expiry <= new Date() || (actionAccount.expiresAt && expiry <= new Date(actionAccount.expiresAt))) { setFormError("Choose a future date later than the current expiry."); return; }
      }
      if (view === "wallet-settings" && values.expiresAt && new Date(`${values.expiresAt}T23:59:59.999Z`) <= new Date()) { setFormError("Choose a future credit expiry date, or clear it for no expiry."); return; }
      setFormError(""); setReviewing(true); return;
    }
    submitting.current = true;
    mutation.mutate(undefined, { onSettled: () => { submitting.current = false; } });
  }
  if (!["Reseller", "Super Admin"].includes(user.role)) return children;
  const selected = issues.find(item => item.id === issue);
  const Icon = selected?.Icon || CircleHelp;
  const isForm = ["allocate", "request", "extend-expiry", "unblock", "wallet-settings"].includes(view);
  const titles = { allocate: "Allocate credits", request: "Request credits", "extend-expiry": "Extend account expiry", unblock: "Review account unblock", transactions: "Transaction history", wallet: "Credit balance", "wallet-settings": "Edit credit validity" };
  const menuItems = supportMenuActions(user.role).map(action => issues.find(item => item.id === action));
  const base = user.role === "Super Admin" ? "/admin" : user.role === "Reseller" ? "/reseller" : "/user";

  return <>
    <RadialMenu menuItems={menuItems} disabled={disabled || !id} onSelect={item => openIssue(item.id)}>{children}</RadialMenu>
    <Dialog open={Boolean(issue)} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent ref={dialogRef} className="support-tool-dialog" data-view={view} showCloseButton={!mutation.isPending} initialFocus={dialogRef}>
        <DialogHeader className="support-tool-dialog-header"><div className="support-tool-heading"><span className="support-tool-dialog-icon"><Icon aria-hidden="true" /></span><div><span className="support-tool-eyebrow">Support tools</span><DialogTitle>{reviewing && isForm ? "Review your changes" : titles[view] || selected?.title}</DialogTitle></div></div><DialogDescription>{isForm ? "Review the change before confirming. The result will be recorded in this conversation." : selected?.description}</DialogDescription>{account && <div className="support-tool-account-context"><UserRound aria-hidden="true" /><span>For <strong>{account.username}</strong></span><span className="support-tool-account-role">{account.role === "User" ? "Client" : account.role}</span></div>}</DialogHeader>
        <div className="support-tool-body" data-view={view}>
        {view !== "issue" && issue !== "transaction" && <button type="button" className="support-tool-back" disabled={mutation.isPending} onClick={() => { setView("issue"); setReviewing(false); setFormError(""); mutation.reset(); }}><ArrowLeft />Back to {selected?.label.toLowerCase()}</button>}
        {context.isPending ? <p className="support-tools-loading" role="status"><Loader2 className="animate-spin" />Checking details…</p> : context.isError ? <div className="support-tool-error" role="alert"><span>{context.error.message}</span><Button readOnlySafe type="button" size="xs" variant="outline" onClick={() => context.refetch()}>Try again</Button></div> : data && <>
          {view === "issue" && <div className="support-tool-actions">
            {issue === "credit" && <>
              <Action Icon={Wallet} title={isRequester ? "Check my balance" : "Check client wallet"} onClick={() => setView("wallet")} />
              {capabilities.allocate && <Action Icon={Plus} title="Allocate credits" description="Review a transfer to this account" primary disabled={!canChange} onClick={() => openAction("allocate")} />}
              {capabilities.requestCredits && <Action Icon={Plus} title="Request credits" primary disabled={!canChange} onClick={() => openAction("request")} />}
              <Action Icon={History} title="Credit history" onClick={() => setView("transactions")} />
              {isRequester && <Action Icon={CircleHelp} title="Report a credit issue" disabled={disabled} onClick={() => draft("I need help with my credit balance. Please check my wallet and recent deductions.")} />}
              {capabilities.escalate && <Action Icon={ShieldCheck} title={needsAdmin ? "Review requested" : "Request specialist review"} disabled={!canChange || needsAdmin} onClick={() => escalate(`Please review the credit issue for ${account.username}.\nChecks performed: `)} />}
            </>}
            {["expired", "blocked"].includes(issue) && <>
              <div className="support-tool-account-state"><span>{account.username}</span><strong>{account.restriction === "blocked" ? "Account blocked" : account.restriction === "expired" ? "Account expired" : "Account active"}</strong><p>{issue === "blocked" ? account.accessReason || "No restriction reason provided." : `Account expiry: ${supportDate(account.expiresAt)}`}</p></div>
              {capabilities.manageAccount && issue === "expired" && <Action Icon={CalendarDays} title="Extend account expiry" primary disabled={!canChange} onClick={() => openAction("extend-expiry")} />}
              {capabilities.manageAccount && issue === "blocked" && account.status === "blocked" && <Action Icon={UnlockKeyhole} title="Review and unblock" primary disabled={!canChange} onClick={() => openAction("unblock")} />}
              {isRequester && <Action Icon={issue === "blocked" ? ShieldCheck : CalendarDays} title={issue === "blocked" ? "Request account review" : "Request renewal"} primary disabled={disabled} onClick={() => draft(issue === "blocked" ? "Please review the block on my account and help me restore access." : "Please renew my account and extend its expiry date.")} />}
              <Action Icon={RefreshCw} title="Check access again" disabled={context.isFetching} onClick={refreshAccess} />
              {capabilities.escalate && <Action Icon={ShieldCheck} title={needsAdmin ? "Review requested" : "Request specialist review"} disabled={!canChange || needsAdmin} onClick={() => escalate(`Please review ${issue === "blocked" ? "the block" : "the account expiry"} for ${account.username}.\nChecks performed: `)} />}
            </>}
            {issue === "allocate" && (capabilities.allocate ? <Action Icon={Plus} title="Allocate credits" description={user.role === "Super Admin" ? "Allocate from the platform credit pool" : "Transfer from your available reseller wallet"} primary disabled={!canChange} onClick={() => openAction("allocate")} /> : <p className="support-tool-dialog-hint">You can allocate credits only to accounts you manage.</p>)}
            {issue === "escalate" && (capabilities.escalate ? <Action Icon={ShieldCheck} title={needsAdmin ? "Already requested" : "Prepare escalation"} description="Review your reason before notifying Super Admin" primary disabled={!canChange || needsAdmin} onClick={() => escalate(`Please review this issue for ${account.username}.\nIssue: \nChecks performed: `)} /> : <p className="support-tool-dialog-hint">Escalation is available for your assigned client conversations.</p>)}
            {issue === "credit-validity" && (capabilities.manageCreditValidity ? <Action Icon={Settings2} title="Edit credit expiry and lock" description="Account expiry and credit balance stay unchanged" primary disabled={!canChange} onClick={() => openAction("wallet-settings")} /> : <p className="support-tool-dialog-hint">Only Super Admin can manage credit validity for another account.</p>)}
            {issue === "ledger-audit" && (capabilities.auditLedger ? ledger.isPending ? <p className="support-tools-loading" role="status"><Loader2 className="animate-spin" />Checking the credit ledger…</p> : ledger.isError ? <div className="support-tool-error" role="alert">{ledger.error.message}<Button readOnlySafe type="button" variant="outline" size="xs" onClick={() => ledger.refetch()}>Try again</Button></div> : ledger.data?.data && <div className="support-tool-wallet"><span>{account.username}</span><strong className="support-tool-audit-state">{ledger.data.data.isReconciled ? "Balances match" : "Review needed"}</strong><dl><div><dt>Current wallet</dt><dd>{number(ledger.data.data.currentBalance)} credits</dd></div><div><dt>Recorded balance</dt><dd>{number(ledger.data.data.calculatedBalance)} credits</dd></div><div><dt>Difference</dt><dd>{number(ledger.data.data.drift)} credits</dd></div></dl><Button readOnlySafe type="button" variant="outline" disabled={ledger.isFetching} onClick={() => ledger.refetch()}><RefreshCw />Run check again</Button></div> : <p className="support-tool-dialog-hint">Only Super Admin can audit managed accounts.</p>)}
          </div>}
          {view === "wallet" && <><div className="support-tool-wallet"><span>Available balance</span><strong>{number(wallet.balance)}<small> credits</small></strong><dl><div><dt>Credit validity</dt><dd>{supportDate(wallet.expiresAt)}</dd></div><div><dt>Wallet status</dt><dd>{wallet.isExpired ? "Credits expired" : wallet.isLocked ? "Locked" : "Available"}</dd></div></dl></div><Button readOnlySafe type="button" variant="outline" onClick={() => context.refetch()} disabled={context.isFetching}><RefreshCw />Refresh balance</Button></>}
          {view === "transactions" && <>
            <form className="support-tool-lookup" onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (reference.trim() === lookup) void transactions.refetch(); else setLookup(reference.trim()); }}><Search className="support-tool-search-icon" aria-hidden="true" /><label className="sr-only" htmlFor="support-transaction-search">Complete transaction reference</label><Input id="support-transaction-search" placeholder="Search by transaction reference…" value={reference} maxLength={28} onChange={event => setReference(event.target.value)} />{(reference || lookup) && <button className="support-tool-search-clear" type="button" aria-label="Clear transaction search" onClick={() => { setLookup(""); setReference(""); }}><X /></button>}<Button readOnlySafe type="submit" variant="secondary" disabled={transactions.isFetching} aria-label="Find transaction">{transactions.isFetching ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}<span>Find</span></Button></form>
            <div className="support-transaction-list-heading"><span>{lookup ? "Search results" : "Recent activity"}</span><span>{transactions.isSuccess ? `${transactions.data.data.length} ${transactions.data.data.length === 1 ? "entry" : "entries"}` : "Credit history"}</span></div>
            <div className="support-tool-transactions" aria-busy={transactions.isFetching}>
              {transactions.isPending ? <p className="support-tools-loading" role="status"><Loader2 className="animate-spin" />Loading transactions…</p> : transactions.isError ? <div className="support-tool-error" role="alert"><p>{transactions.error.message}</p><Button readOnlySafe type="button" size="xs" variant="outline" onClick={() => transactions.refetch()}>Try again</Button></div> : !transactions.data?.data?.length ? <div className="support-tool-empty"><ReceiptText /><strong>{lookup ? "No matching transaction" : "No transactions yet"}</strong><p>{lookup ? "Check the complete reference. Only this account’s entries appear here." : "Recorded credit movements will appear here."}</p></div> : transactions.data.data.map(item => <SupportTransactionCard key={item.id} transaction={item} disabled={disabled} canReview={capabilities.escalate} reviewDisabled={!canChange || needsAdmin}
                campaignUrl={item.campaignId ? `${base}/campaigns/${item.campaignId}` : null}
                onAttach={() => draft(`Please check this transaction.\nTransaction ID: ${item.reference}${item.campaignId ? `\nCampaign ID: CMP-${String(item.campaignId).toUpperCase()}` : ""}`)}
                onReview={() => escalate(`Please review transaction ${item.reference} for ${account.username}.\nType: ${item.type}; credits: ${number(item.amount)}.\nChecks performed: `)} />)}
            </div><div className="support-transaction-list-footer"><ShieldCheck aria-hidden="true" /><p>Only this account’s entries. Up to 20 recent records.</p></div>
          </>}
          {isForm && <form className="support-tool-form" onSubmit={submit}>
            {reviewing ? <div className="support-tool-review"><span>Review for {actionAccount.username}</span><strong>{view === "allocate" ? `Allocate ${number(values.amount)} credits` : view === "request" ? `Request ${number(values.amount)} credits` : view === "extend-expiry" ? `Extend through ${supportDate(values.expiresAt)}` : view === "wallet-settings" ? "Update credit validity and lock" : "Remove account block"}</strong>{values.note && <p>{values.note}</p>}<p>{view === "wallet-settings" ? `Credit expiry: ${supportDate(values.expiresAt || null)}. Wallet: ${values.isLocked ? "locked" : "unlocked"}. Account access and credit balance stay unchanged.` : view === "extend-expiry" ? `Current expiry: ${supportDate(actionAccount.expiresAt)}. ${actionAccount.status === "blocked" ? "The account will remain blocked." : "An expired account will become active."} Credit validity stays separate.` : view === "unblock" ? `Account expiry stays ${supportDate(actionAccount.expiresAt)}.${actionAccount.expiresAt && new Date(actionAccount.expiresAt) <= new Date() ? " Renewal is still required." : ""}` : view === "allocate" ? `${user.role === "Super Admin" ? "Credit validity will be set to 2 years." : "Credits come from your available wallet. Credit expiry stays the same."} Allocation clears the wallet lock. Account access stays the same.` : "Your administrator will receive the request. Your balance stays the same until credits are allocated."}</p></div> : <>
              {["allocate", "request"].includes(view) && <><label htmlFor="support-credit-amount">Credits<Input id="support-credit-amount" type="number" autoFocus min="0.01" step="0.01" required value={values.amount} onChange={event => setValues(previous => ({ ...previous, amount: event.target.value }))} placeholder="e.g. 500" /></label><label htmlFor="support-credit-note">Note <small>Optional</small><textarea id="support-credit-note" maxLength={500} rows={3} value={values.note} onChange={event => setValues(previous => ({ ...previous, note: event.target.value }))} placeholder="Add a note…" /></label></>}
              {view === "extend-expiry" && <label htmlFor="support-account-expiry">New account expiry<Input id="support-account-expiry" type="date" autoFocus required value={values.expiresAt} onChange={event => setValues(previous => ({ ...previous, expiresAt: event.target.value }))} /><small>Current expiry: {supportDate(actionAccount.expiresAt)}. Choose a later date.</small></label>}
              {view === "unblock" && <div className="support-tool-review"><span>Reason for restriction</span><p>{actionAccount.accessReason || "No reason provided."}</p><p>Review this restriction before removing the block.</p></div>}
              {view === "wallet-settings" && <><label htmlFor="support-credit-expiry">Credit expiry<Input id="support-credit-expiry" type="date" value={values.expiresAt} onChange={event => setValues(previous => ({ ...previous, expiresAt: event.target.value }))} /><small>Leave blank for no expiry. This does not renew the account.</small></label><label className="support-wallet-lock" htmlFor="support-wallet-lock"><input id="support-wallet-lock" type="checkbox" checked={values.isLocked} onChange={event => setValues(previous => ({ ...previous, isLocked: event.target.checked }))} />Lock this wallet</label></>}
            </>}
            {(formError || mutation.isError) && <p className="support-tool-error" role="alert">{formError || mutation.error.message}</p>}
            <div className="support-tool-dialog-actions"><Button readOnlySafe type="button" variant="outline" disabled={mutation.isPending} onClick={() => { if (reviewing) { setReviewing(false); mutation.reset(); } else setView("issue"); }}>{reviewing ? "Back" : "Cancel"}</Button><Button type="submit" disabled={mutation.isPending || !canChange}>{mutation.isPending ? <Loader2 className="animate-spin" /> : reviewing ? <Check /> : <ArrowUpRight />}{mutation.isPending ? "Saving…" : reviewing ? "Confirm action" : "Review action"}</Button></div>
          </form>}
        </>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
