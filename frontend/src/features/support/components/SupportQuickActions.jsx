import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, CircleHelp, ClipboardCheck, History, Loader2, LockKeyhole, Plus, ReceiptText, RefreshCw, Search, Settings2, ShieldCheck, UnlockKeyhole, UserRound, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useSocket } from "@/features/socket/context/socket-context";
import { supportApi } from "../services/support.api";
import { accountActionPayload, supportDate, supportMenuActions } from "../lib/quickActions";
import { accountRestriction } from "../../../../../shared/accountAccess.js";
import { RadialMenu } from "@/components/ui/radial-menu";
import { ListSkeleton } from "@/components/ui/page-skeletons";
import SupportTransactionCard from "./SupportTransactionCard";
import "./support-quick-actions.css";

const issues = [
  { id: "credit", label: "Credits", title: "Credit help", description: "Check the wallet or get help with credits.", Icon: Wallet },
  { id: "transaction", label: "Transaction", title: "Transaction help", description: "Find an entry and share its reference in this conversation.", Icon: ReceiptText },
  { id: "expired", label: "Expired account", title: "Account renewal", description: "Check account validity and request or review a renewal.", Icon: CalendarDays },
  { id: "blocked", label: "Blocked account", title: "Account access", description: "Review the restriction and the next step to restore access.", Icon: LockKeyhole },
  { id: "allocate", label: "Allocate credits", title: "Allocate credits", description: "Transfer credits to this conversation’s account after reviewing the amount.", Icon: Plus },
  { id: "escalate", label: "Request Super Admin", title: "Request Super Admin", description: "Bring in specialist help with the issue and the checks you have performed.", Icon: ShieldCheck },
  { id: "wallet-lock", label: "Wallet lock", title: "Wallet restrictions", description: "Super Admin can manage wallet locks independently of account access.", Icon: Settings2 },
  { id: "ledger-audit", label: "Ledger audit", title: "Ledger audit", description: "Compare the wallet with recorded credit movements. This check does not modify any balance.", Icon: ClipboardCheck },
];
const categoryNames = { CAMPAIGN: "Campaign Credits", NUMBER_FILTERING: "Number Filtering Credits" };
const categoryOptions = Object.entries(categoryNames).map(([value, label]) => ({ value, label }));
const toolViews = {
  allocate: { title: "Allocate credits", description: "Choose the credit category and amount to transfer.", Icon: Plus },
  request: { title: "Request credits", description: "Choose the credit category and amount to request from your admin.", Icon: Plus },
  "extend-expiry": { title: "Extend account expiry", description: "Set a new expiry date for this account.", Icon: CalendarDays },
  unblock: { title: "Review and unblock", description: "Check the restriction before restoring access.", Icon: UnlockKeyhole },
  transactions: { title: "Transaction history", description: "Look up a credit transaction for this account.", Icon: ReceiptText },
  wallet: { title: "Credit balance", description: "Check available and held credits by category.", Icon: Wallet },
  "wallet-settings": { title: "Edit wallet lock", description: "Change whether this account’s wallet is locked.", Icon: Settings2 },
};
const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function Action({ Icon, title, description, onClick, disabled, primary }) {
  return <button type="button" className="support-tool-action" data-primary={primary || undefined} onClick={onClick} disabled={disabled}>
    <span className="support-tool-action-icon"><Icon aria-hidden="true" /></span><span><strong>{title}</strong>{description && <small>{description}</small>}</span><ArrowUpRight className="support-tool-action-arrow" aria-hidden="true" />
  </button>;
}

function LedgerAudit({ audit, accountId, isFetching, onRefresh }) {
  const uncertain = audit.classification === "cannot_confirm";
  return (
    <div className="support-tool-audit">
      {(audit.currentBalance || audit.calculatedBalance || audit.drift) ? (
        <section className="support-tool-wallet">
          <div className="support-tool-card-heading">
            <h3>Ledger comparison</h3>
            <span className="support-tool-state" data-tone={audit.isReconciled ? "success" : "warning"}>
              {audit.isReconciled ? "Balances match" : uncertain ? "Evidence verification needed" : "Review needed"}
            </span>
          </div>
          <dl>
            <div><dt>Legacy wallet</dt><dd>{number(audit.currentBalance)} credits</dd></div>
            <div><dt>Legacy ledger</dt><dd>{number(audit.calculatedBalance)} credits</dd></div>
            <div><dt>Difference</dt><dd>{number(audit.drift)} credits</dd></div>
          </dl>
          {uncertain && <p className="support-tool-dialog-hint">Resolve the conflicting source records before preparing a correction.</p>}
        </section>
      ) : null}
      {Object.entries(audit.categories || {}).map(([category, lane]) => (
        <section className="support-tool-wallet" key={category}>
          <div className="support-tool-card-heading">
            <h3>{categoryNames[category]}</h3>
            <span className="support-tool-state" data-tone={lane.matches ? "success" : "warning"}>{lane.matches ? "Matches" : "Review needed"}</span>
          </div>
          <dl>
            <div><dt>Wallet available / held</dt><dd>{number(lane.walletBalance.available)} / {number(lane.walletBalance.reserved)}</dd></div>
            <div><dt>Ledger available / held</dt><dd>{lane.expectedBalance.available ?? "Unavailable"} / {lane.expectedBalance.reserved ?? "Unavailable"}</dd></div>
          </dl>
        </section>
      ))}
      <div className="support-tool-inline-actions">
        <Button readOnlySafe type="button" variant="outline" disabled={isFetching} onClick={onRefresh}><RefreshCw />Run check again</Button>
        <Button readOnlySafe nativeButton={false} variant="outline" render={<Link to={`/admin/reconciliation?account=${accountId}`} />}>Open reconciliation <ArrowUpRight /></Button>
      </div>
    </div>
  );
}

function ActionReview({ view, values, account, isSuperAdmin }) {
  let title;
  let detail;
  switch (view) {
    case "allocate":
      title = `Allocate ${number(values.amount)} ${categoryNames[values.category]}`;
      detail = isSuperAdmin ? "Credits are added from the system pool." : "Credits come from your available wallet.";
      break;
    case "request":
      title = `Request ${number(values.amount)} ${categoryNames[values.category]}`;
      detail = "Your administrator will receive the request and can allocate the credits.";
      break;
    case "extend-expiry":
      title = `Extend through ${supportDate(values.expiresAt)}`;
      detail = account.status === "blocked" ? "A separate review is needed to remove the account block." : "An expired account will become active.";
      break;
    case "unblock":
      title = "Remove account block";
      if (account.expiresAt && new Date(account.expiresAt) <= new Date()) detail = "The account still requires renewal.";
      break;
    case "wallet-settings":
      title = values.isLocked ? "Lock wallet" : "Unlock wallet";
      break;
  }
  return (
    <div className="support-tool-review">
      <strong>{title}</strong>
      <dl className="support-tool-details">
        <div><dt>Account</dt><dd>{account.username}</dd></div>
        {["extend-expiry", "unblock"].includes(view) && <div><dt>Current expiry</dt><dd>{supportDate(account.expiresAt)}</dd></div>}
        {values.note && <div><dt>Note</dt><dd>{values.note}</dd></div>}
      </dl>
      {detail && <p>{detail}</p>}
    </div>
  );
}

export default function SupportQuickActions({ children, conversation, user, disabled, onDraft, onEscalate, needsAdmin, onChanged }) {
  const { checkAuth } = useAuth();
  const { socket } = useSocket();
  const client = useQueryClient();
  const id = conversation?._id;
  const viewerId = String(user.id || user._id);
  const [issue, setIssue] = useState(null);
  const [view, setView] = useState("issue");
  const [values, setValues] = useState({ amount: "", category: "", note: "", expiresAt: "" });
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
      if (view === "allocate") return supportApi.allocateCredits({ toUserId: actionAccount.id, amount: Number(values.amount), category: values.category, notes: values.note.trim(), supportConversationId: id  });
      if (view === "request") return supportApi.requestCredits({ amount: Number(values.amount), category: values.category, note: values.note.trim(), supportConversationId: id });
      if (view === "wallet-settings") return supportApi.walletAction(id, { isLocked: values.isLocked, expectedUpdatedAt: actionWallet.updatedAt });
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
    setValues({ amount: "", category: "", note: "", expiresAt: "", isLocked: Boolean(wallet.lockEnabled) }); setView(action);
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
      if (["allocate", "request"].includes(view) && (!Object.hasOwn(categoryNames, values.category) || !Number.isSafeInteger(Number(values.amount)) || Number(values.amount) < 1)) { setFormError("Choose a category and enter a positive whole credit quantity."); return; }
      if (view === "extend-expiry") {
        const expiry = new Date(`${values.expiresAt}T23:59:59.999Z`);
        if (!values.expiresAt || !Number.isFinite(expiry.getTime()) || expiry <= new Date() || (actionAccount.expiresAt && expiry <= new Date(actionAccount.expiresAt))) { setFormError("Choose a future date later than the current expiry."); return; }
      }
      setFormError(""); setReviewing(true); return;
    }
    submitting.current = true;
    mutation.mutate(undefined, { onSettled: () => { submitting.current = false; } });
  }
  if (!["Reseller", "Super Admin"].includes(user.role)) return children;
  const selected = issues.find(item => item.id === issue);
  const currentView = toolViews[view];
  const Icon = currentView?.Icon || selected?.Icon || CircleHelp;
  const isForm = ["allocate", "request", "extend-expiry", "unblock", "wallet-settings"].includes(view);
  const accountState = account?.restriction;
  const audit = ledger.data?.data;
  const menuItems = supportMenuActions(user.role).map(action => issues.find(item => item.id === action));
  const base = user.role === "Super Admin" ? "/admin" : user.role === "Reseller" ? "/reseller" : "/user";

  return <>
    <RadialMenu menuItems={menuItems} disabled={disabled || !id} onSelect={item => openIssue(item.id)}>{children}</RadialMenu>
    <Dialog open={Boolean(issue)} onOpenChange={open => { if (!open) close(); }}>
      <DialogContent ref={dialogRef} className="support-tool-dialog" data-view={view} showCloseButton={!mutation.isPending} initialFocus={dialogRef}>
        <DialogHeader className="support-tool-dialog-header">
          <div className="support-tool-heading">
            <span className="support-tool-dialog-icon"><Icon aria-hidden="true" /></span>
            <div>
              <DialogTitle>{reviewing && isForm ? "Review your changes" : currentView?.title || selected?.title}</DialogTitle>
              <DialogDescription>{reviewing && isForm ? "The confirmed action will be recorded in this conversation." : currentView?.description || selected?.description}</DialogDescription>
            </div>
          </div>
          {account && <div className="support-tool-account-context">
            <UserRound aria-hidden="true" />
            <strong>{account.username}</strong>
            <span className="support-tool-account-role">{account.role === "User" ? "Client" : account.role}</span>
          </div>}
        </DialogHeader>
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
              <div className="support-tool-account-state">
                <div className="support-tool-card-heading">
                  <h3>Account access</h3>
                  <span className="support-tool-state" data-tone={accountState === "blocked" ? "danger" : accountState === "expired" ? "warning" : "success"}>
                    {accountState === "blocked" ? "Blocked" : accountState === "expired" ? "Expired" : "Active"}
                  </span>
                </div>
                {issue === "blocked" && <p>{account.accessReason || "No restriction reason provided."}</p>}
                <dl><div><dt>Account expiry</dt><dd>{supportDate(account.expiresAt)}</dd></div></dl>
              </div>
              {capabilities.manageAccount && issue === "expired" && <Action Icon={CalendarDays} title="Extend account expiry" primary disabled={!canChange} onClick={() => openAction("extend-expiry")} />}
              {capabilities.manageAccount && issue === "blocked" && account.status === "blocked" && <Action Icon={UnlockKeyhole} title="Review and unblock" primary disabled={!canChange} onClick={() => openAction("unblock")} />}
              {isRequester && <Action Icon={issue === "blocked" ? ShieldCheck : CalendarDays} title={issue === "blocked" ? "Request account review" : "Request renewal"} primary disabled={disabled} onClick={() => draft(issue === "blocked" ? "Please review the block on my account and help me restore access." : "Please renew my account and extend its expiry date.")} />}
              <Action Icon={RefreshCw} title="Check access again" disabled={context.isFetching} onClick={refreshAccess} />
              {capabilities.escalate && <Action Icon={ShieldCheck} title={needsAdmin ? "Review requested" : "Request specialist review"} disabled={!canChange || needsAdmin} onClick={() => escalate(`Please review ${issue === "blocked" ? "the block" : "the account expiry"} for ${account.username}.\nChecks performed: `)} />}
            </>}
            {issue === "allocate" && (capabilities.allocate ? <Action Icon={Plus} title="Allocate credits" description={user.role === "Super Admin" ? "Allocate from the platform credit pool" : "Transfer from your available reseller wallet"} primary disabled={!canChange} onClick={() => openAction("allocate")} /> : <p className="support-tool-dialog-hint">You can allocate credits only to accounts you manage.</p>)}
            {issue === "escalate" && (capabilities.escalate ? <Action Icon={ShieldCheck} title={needsAdmin ? "Already requested" : "Prepare escalation"} description="Review your reason before notifying Super Admin" primary disabled={!canChange || needsAdmin} onClick={() => escalate(`Please review this issue for ${account.username}.\nIssue: \nChecks performed: `)} /> : <p className="support-tool-dialog-hint">Escalation is available for your assigned client conversations.</p>)}
            {issue === "wallet-lock" && (capabilities.manageWalletLocks ? <Action Icon={Settings2} title="Edit wallet lock" description="Account expiry and credit balance stay unchanged" primary disabled={!canChange} onClick={() => openAction("wallet-settings")} /> : <p className="support-tool-dialog-hint">Only Super Admin can manage wallet locks for another account.</p>)}
            {issue === "ledger-audit" && <>
              {!capabilities.auditLedger && <p className="support-tool-dialog-hint">Only Super Admin can audit managed accounts.</p>}
              {capabilities.auditLedger && ledger.isPending && <p className="support-tools-loading" role="status"><Loader2 className="animate-spin" />Checking the credit ledger…</p>}
              {capabilities.auditLedger && ledger.isError && <div className="support-tool-error" role="alert">{ledger.error.message}<Button readOnlySafe type="button" variant="outline" size="xs" onClick={() => ledger.refetch()}>Try again</Button></div>}
              {capabilities.auditLedger && audit && !ledger.isError && <LedgerAudit audit={audit} accountId={account.id} isFetching={ledger.isFetching} onRefresh={() => ledger.refetch()} />}
            </>}
          </div>}
          {view === "wallet" && <>
            <div className="support-tool-card-heading">
              <h3>Wallet status</h3>
              <span className="support-tool-state" data-tone={wallet.isLocked ? "warning" : "success"}>{wallet.isLocked ? "Locked" : "Available"}</span>
            </div>
            <div className="support-tool-balances">
              {categoryOptions.map(({ value, label }) => (
                <section className="support-tool-wallet" key={value}>
                  <h3>{label}</h3>
                  <dl>
                    <div><dt>Available</dt><dd>{number(wallet.creditBalances?.[value]?.available)}</dd></div>
                    <div><dt>Held</dt><dd>{number(wallet.creditBalances?.[value]?.reserved)}</dd></div>
                  </dl>
                </section>
              ))}
            </div>
            <div className="support-tool-inline-actions"><Button readOnlySafe type="button" variant="outline" onClick={() => context.refetch()} disabled={context.isFetching}><RefreshCw />Refresh balance</Button></div>
          </>}
          {view === "transactions" && <>
            <div className="support-tool-field">
              <label htmlFor="support-transaction-search">Transaction reference</label>
              <form className="support-tool-lookup" onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (reference.trim() === lookup) void transactions.refetch(); else setLookup(reference.trim()); }}>
                <Search className="support-tool-search-icon" aria-hidden="true" />
                <Input id="support-transaction-search" placeholder="Enter the full reference" value={reference} maxLength={28} onChange={event => setReference(event.target.value)} />
                {(reference || lookup) && <button className="support-tool-search-clear" type="button" aria-label="Clear transaction search" onClick={() => { setLookup(""); setReference(""); }}><X /></button>}
                <Button readOnlySafe type="submit" variant="secondary" disabled={transactions.isFetching} aria-label="Find transaction">
                  {transactions.isFetching ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}<span>Find</span>
                </Button>
              </form>
            </div>
            <div className="support-transaction-list-heading"><span>{lookup ? "Search results" : "Recent activity"}</span><span>{transactions.isSuccess ? `${transactions.data.data.length} ${transactions.data.data.length === 1 ? "entry" : "entries"}` : "Credit history"}</span></div>
            <div className="support-tool-transactions" aria-busy={transactions.isFetching}>
              {transactions.isPending ? <ListSkeleton count={3} /> : transactions.isError ? <div className="support-tool-error" role="alert"><p>{transactions.error.message}</p><Button readOnlySafe type="button" size="xs" variant="outline" onClick={() => transactions.refetch()}>Try again</Button></div> : !transactions.data?.data?.length ? <div className="support-tool-empty"><ReceiptText /><strong>{lookup ? "No matching transaction" : "No transactions yet"}</strong><p>{lookup ? "Check the complete reference. Only this account’s entries appear here." : "Recorded credit movements will appear here."}</p></div> : transactions.data.data.map(item => <SupportTransactionCard key={item.id} transaction={item} disabled={disabled} canReview={capabilities.escalate} reviewDisabled={!canChange || needsAdmin}
                campaignUrl={item.campaignId ? `${base}/campaigns/${item.campaignId}` : null}
                onAttach={() => draft(`Please check this transaction.\nTransaction ID: ${item.reference}${item.campaignId ? `\nCampaign ID: CMP-${String(item.campaignId).toUpperCase()}` : ""}`)}
                onReview={() => escalate(`Please review transaction ${item.reference} for ${account.username}.\nType: ${item.type}; credits: ${number(item.amount)}.\nChecks performed: `)} />)}
            </div><div className="support-transaction-list-footer"><ShieldCheck aria-hidden="true" /><p>Only this account’s entries. Up to 20 recent records.</p></div>
          </>}
          {isForm && <form className="support-tool-form" onSubmit={submit}>
            {reviewing ? <ActionReview view={view} values={values} account={actionAccount} isSuperAdmin={user.role === "Super Admin"} /> : <>
              {["allocate", "request"].includes(view) && <>
                <div className="support-tool-credit-fields">
                  <div className="support-tool-field">
                    <label htmlFor="support-credit-category">Credit category</label>
                    <Select
                      name="creditCategory"
                      required
                      items={categoryOptions}
                      value={values.category || null}
                      onValueChange={category => setValues(previous => ({ ...previous, category: category ?? "" }))}
                    >
                      <SelectTrigger id="support-credit-category" className="w-full" autoFocus>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent align="start" alignItemWithTrigger={false} className="w-(--anchor-width) p-1">
                        {categoryOptions.map(({ value, label }) => <SelectItem key={value} value={value} className="min-h-9 px-3 pr-8">{label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="support-tool-field" htmlFor="support-credit-amount">
                    Credits
                    <Input id="support-credit-amount" type="number" inputMode="numeric" min="1" step="1" required
                      value={values.amount} onChange={event => setValues(previous => ({ ...previous, amount: event.target.value }))}
                      onWheel={event => event.currentTarget.blur()} placeholder="e.g. 500" />
                  </label>
                </div>
                <label className="support-tool-field" htmlFor="support-credit-note">
                  <span>Note <small>Optional</small></span>
                  <textarea id="support-credit-note" maxLength={500} rows={3}
                    value={values.note} onChange={event => setValues(previous => ({ ...previous, note: event.target.value }))}
                    placeholder="Add a note…" />
                </label>
              </>}
              {view === "extend-expiry" && <>
                <dl className="support-tool-details support-tool-current">
                  <div><dt>Current expiry</dt><dd>{supportDate(actionAccount.expiresAt)}</dd></div>
                </dl>
                <label className="support-tool-field" htmlFor="support-account-expiry">
                  New account expiry
                  <Input id="support-account-expiry" type="date" autoFocus required value={values.expiresAt}
                    onChange={event => setValues(previous => ({ ...previous, expiresAt: event.target.value }))} />
                </label>
              </>}
              {view === "unblock" && <div className="support-tool-review">
                <h3>Reason for restriction</h3>
                <p>{actionAccount.accessReason || "No reason provided."}</p>
              </div>}
              {view === "wallet-settings" && <label className="support-wallet-lock">
                <span className="support-wallet-lock-label">
                  <strong id="support-wallet-lock-label">Lock this wallet</strong>
                  <small id="support-wallet-lock-state">{values.isLocked ? "Wallet will be locked" : "Wallet will be unlocked"}</small>
                </span>
                <input id="support-wallet-lock" className="sr-only" type="checkbox" role="switch" checked={values.isLocked}
                  aria-labelledby="support-wallet-lock-label" aria-describedby="support-wallet-lock-state"
                  onChange={event => setValues(previous => ({ ...previous, isLocked: event.target.checked }))} />
                <span className="support-wallet-lock-control" aria-hidden="true" />
              </label>}
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
