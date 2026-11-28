import TransactionAmount from "@/features/credits/components/TransactionAmount";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCheck, ChevronLeft, ChevronRight, Clock3, FileSearch, History, ReceiptText, RefreshCw, Search, ShieldAlert, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { toast } from "@/components/ui/toast";
import { dateTime } from "@/lib/format";
import { TableSkeleton, ListSkeleton, MetricCardsSkeleton } from "@/components/ui/page-skeletons";
import { reconciliationApi } from "../services/reconciliation.api";
import ReconciliationWorkspace from "../components/ReconciliationWorkspace";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";
import CorrectionPanel from "../components/CorrectionPanel";
import "../reconciliation.css";

const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const statusText = { confirmed: "Mismatch confirmed", cannot_confirm: "Cannot confirm yet", matched: "Balances match" };
const categoryNames = { CAMPAIGN: "Campaign Credits", NUMBER_FILTERING: "Number Filtering Credits", LEGACY: "Legacy credits" };
const movements = { RESERVE: "Recharge hold", RELEASE: "Recharge hold release", ALLOCATE: "Credit transfer", REFUND: "Refund", DEDUCT: "Credit usage", RECLAIM: "Credit reclaim", REQUEST: "Request only · No balance change", RECOVERY: "Restored ledger evidence" };
const historyLabels = { detected: "Account flagged for review", cleared_by_check: "Balances match; flag cleared by a fresh check", reopened: "Account needs review again", rechecked: "Check result changed", review_prepared: "Correction review prepared", repair_started: "Confirmation started", repair_completed: "Correction completed and checked", repair_failed: "Correction attempt failed", repair_outcome_unconfirmed: "Confirmation needs a receipt check", ledger_restored: "Missing ledger evidence restored", closed_without_change: "Flag closed without changing credits" };

function Pager({ page, pages = 1, onChange, busy }) { return <div className="credit-pager"><span>Page {page} of {pages}</span><div><Button type="button" size="icon-sm" variant="outline" aria-label="Previous page" disabled={page <= 1 || busy} onClick={() => onChange(page - 1)}><ChevronLeft /></Button><Button type="button" size="icon-sm" variant="outline" aria-label="Next page" disabled={page >= pages || busy} onClick={() => onChange(page + 1)}><ChevronRight /></Button></div></div>; }
function QueryError({ query }) { return <div className="credit-form-error" role="alert">{query.error?.message || "The check could not complete."}<Button type="button" size="sm" variant="outline" onClick={() => query.refetch()}>Try again</Button></div>; }

function LedgerEntry({ row }) {
  const direction = row.delta > 0 ? "in" : row.delta < 0 ? "out" : "neutral";
  const amount = <TransactionAmount amount={row.delta} direction={direction} />;
  if (row.category) {
    const title = row.type === "DEDUCT" && row.originalTransactionId ? "Published refund correction" : movements[row.type] || row.type;
    return <details className="credit-ledger-entry">
      <summary><span className="credit-ledger-icon"><ReceiptText /></span><span className="credit-ledger-copy"><strong>{title}</strong>
        <small>{categoryNames[row.category]} ? {dateTime(row.createdAt)}</small></span>
        <span className="credit-ledger-numbers"><strong>{amount}</strong></span><ChevronRight />
      </summary>
      <div className="credit-ledger-detail">
        <code>{row.reference}</code>
        <dl>
          {row.buckets.map(bucket => <div key={bucket.bucket}>
            <dt>{bucket.bucket === "reserved" ? "Held" : "Available"}</dt><dd>{number(bucket.before)} ? {number(bucket.after)}</dd>
          </div>)}
          {row.purchaseId && <div><dt>Recharge order</dt><dd><code>{row.purchaseId}</code></dd></div>}
          {row.filterRequestId && <div><dt>Filtering request</dt><dd><code>{row.filterRequestId}</code></dd></div>}
          {row.campaignId && <div><dt>Campaign</dt><dd>{row.campaign ? <Link to={'/admin/campaigns/' + row.campaign.id}>{row.campaign.title}</Link> : <code>{row.campaignId}</code>}</dd></div>}
          {row.originalTransactionId && <div><dt>Original debit</dt><dd><code>TXN-{String(row.originalTransactionId).toUpperCase()}</code></dd></div>}
          <div><dt>Performed by</dt><dd>{row.actor?.name}</dd></div>
        </dl>
      </div>
    </details>;
  }
  const incoming = row.delta > 0;
  const Icon = row.type === "REQUEST" ? Clock3 : incoming ? ArrowDownLeft : ArrowUpRight;
  return <details className="credit-ledger-entry" data-gap={Boolean(row.snapshotGap) || undefined}>
    <summary><span className="credit-ledger-icon"><Icon /></span><span className="credit-ledger-copy"><strong>{row.walletApplied ? "Recovered transaction" : movements[row.type] || row.type}</strong><small>{dateTime(row.createdAt)}</small></span><span className="credit-ledger-numbers"><strong>{row.type === "REQUEST" ? "—" : amount}</strong><small>{row.snapshotGap ? "Saved balance differs" : row.type === "REQUEST" ? "No credits moved" : `Expected after: ${number(row.expectedAfter)}`}</small></span><ChevronRight /></summary>
    <div className="credit-ledger-detail"><code>{row.reference}</code><div className="credit-entry-values"><div><span>Expected before</span><strong>{number(row.expectedBefore)}</strong></div><div><span>Expected after</span><strong>{number(row.expectedAfter)}</strong></div><div><span>Saved balance after</span><strong>{row.recordedAfter == null ? "Not recorded" : number(row.recordedAfter)}</strong></div>{row.snapshotGap != null && <div><span>Change from previous saved balance</span><strong>{row.snapshotGap ? `${number(row.snapshotGap)} unexplained` : "Matches"}</strong></div>}</div>
      <dl>{row.notes && <div><dt>What the entry records</dt><dd>{row.notes}</dd></div>}<div><dt>Performed by</dt><dd>{row.actor?.name || "Not recorded"}{row.actor?.role && row.actor.role !== "Unknown" ? ` · ${row.actor.role}` : ""}</dd></div>{row.rate != null && <div><dt>Saved credit rate</dt><dd>{number(row.rate)} per recipient{row.billedCount != null ? ` · ${row.billedCount} entries from amount ÷ saved rate` : ""}</dd></div>}{row.restored && <><div><dt>Original movement</dt><dd>{movements[row.originalType] || row.originalType}</dd></div><div><dt>Original transaction time</dt><dd>{dateTime(row.originalEffectiveAt || row.createdAt)}</dd></div><div><dt>Original source evidence</dt><dd>{row.sourceReference}</dd></div><div><dt>Wallet effect</dt><dd>{row.walletApplied ? "Applied to the wallet and ledger together" : "Ledger evidence only; wallet unchanged"}</dd></div><div><dt>Restored on</dt><dd>{dateTime(row.recordedAt)}</dd></div></>}{row.campaign && <><div><dt>Related campaign</dt><dd><Link to={`/admin/campaigns/${row.campaign.id}`}>{row.campaign.title}<ArrowUpRight /></Link></dd></div><div><dt>Original campaign charge</dt><dd>{number(row.campaign.originalCharge)} credits</dd></div><div><dt>Refunds before this entry</dt><dd>{number(row.previousCampaignRefunds)} credits</dd></div><div><dt>Total campaign charges / refunds</dt><dd>{number(row.campaign.totalCharged)} / {number(row.campaign.totalRefunded)} credits</dd></div><div><dt>Remaining net charge</dt><dd>{number(row.campaign.remainingCharged)} credits</dd></div><div><dt>Current campaign recipients</dt><dd>{row.campaign.currentRecipientCount ?? "Not recorded"}</dd></div></>}{row.legacy && <div><dt>Record format</dt><dd>Historical entry; calculated from its recorded type and amount.</dd></div>}</dl>
    </div>
  </details>;
}

function AuditHistory({ userId }) {
  const [view, setView] = useState("reconciliation"), [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["credit-reconciliation", "history", userId, view, page], queryFn: ({ signal }) => view === "wallet" ? reconciliationApi.walletAudit(userId, page, signal) : reconciliationApi.history(userId, page, signal) });
  return <section className="credit-audit-history"><div className="credit-mini-tabs">{[["reconciliation", "Reconciliation history"], ["wallet", "Wallet audit records"]].map(([value, label]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => { setView(value); setPage(1); }}>{label}</button>)}</div><p className="credit-caption">Records are permanent. Wallet events show the saved before/after amounts; reconciliation events preserve investigation reasons and confirmation outcomes.</p>
    {query.isPending ? <ListSkeleton count={4} /> : query.isError ? <QueryError query={query} /> : !query.data.items.length ? <div className="credit-empty"><History /><strong>No records in this view</strong><p>Historical activity may predate detailed audit logging. Missing evidence is not treated as proof.</p></div> : <div className="credit-audit-events">{query.data.items.map(event => <details key={event._id}><summary><span><strong>{historyLabels[event.action] || event.action.replace(/^wallet\./, "Wallet ")}</strong><small>{event.actor?.name || event.actor?.role || "System"} · {dateTime(event.createdAt || event.occurredAt)}</small></span><ChevronRight /></summary><div><dl>{view === "wallet" ? <><div><dt>Balance before</dt><dd>{event.data?.before?.balance == null ? "Not recorded" : `${number(event.data.before.balance)} credits`}</dd></div><div><dt>Balance after</dt><dd>{event.data?.after?.balance == null ? "Not recorded" : `${number(event.data.after.balance)} credits`}</dd></div>{event.data?.reason && <div><dt>Reason</dt><dd>{event.data.reason}</dd></div>}</> : <>{event.details?.reason && <div><dt>Reason</dt><dd>{event.details.reason}</dd></div>}{event.details?.sourceReference && <div><dt>Source evidence</dt><dd>{event.details.sourceReference}</dd></div>}{event.details?.error && <div><dt>Result</dt><dd>{event.details.error}</dd></div>}{event.details?.before && <div><dt>Before</dt><dd>Wallet {number(event.details.before.walletBalance)} · Ledger {number(event.details.before.expectedBalance)}</dd></div>}{event.details?.after && <div><dt>After</dt><dd>Wallet {number(event.details.after.walletBalance)} · Ledger {number(event.details.after.expectedBalance)}</dd></div>}</>}<div><dt>Signed audit reference</dt><dd><code>{event.auditHash || event.hash || "Not recorded"}</code></dd></div></dl></div></details>)}</div>}
    {query.data?.pagination && <Pager page={page} pages={query.data.pagination.pages} onChange={setPage} busy={query.isFetching} />}
    <Link className="credit-text-link" to={`/admin/audit?search=${encodeURIComponent(userId)}&scope=all`}>Open full activity history<ArrowUpRight /></Link>
  </section>;
}

function AccountEvidence({ userId }) {
  const [params] = useSearchParams();
  const recoveryRequested = params.get("action") === "recover";
  const [correctionMode, setCorrectionMode] = useState(recoveryRequested ? "transaction" : "");
  const [tab, setTab] = useState(recoveryRequested ? "correct" : "evidence"), [page, setPage] = useState(1), [search, setSearch] = useState(""), [draftSearch, setDraftSearch] = useState(""), [type, setType] = useState(""), [category, setCategory] = useState("");
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["credit-reconciliation", "evidence", userId, page, search, type, category], queryFn: ({ signal }) => reconciliationApi.evidence(userId, { page, limit: 50, search, type, category }, signal), retry: false });
  const check = useMutation({ mutationFn: () => reconciliationApi.check(userId), onSuccess: () => { void client.invalidateQueries({ queryKey: ["credit-reconciliation"] }); }, onError: error => toast.add({ title: "Check could not complete", description: error.message, type: "error" }) });
  if (query.isPending) return <div className="space-y-6 p-4"><MetricCardsSkeleton count={3} /><TableSkeleton rows={6} /></div>;
  if (query.isError) return <QueryError query={query} />;
  const data = query.data, s = data.summary;
  function showEntry(reference) { setTab("ledger"); setPage(1); setSearch(reference); setDraftSearch(reference); setType(""); setCategory(""); }
  return <section className="credit-account-panel" aria-label={`Evidence for ${s.account.username}`}>
    <header className="credit-account-heading"><div className="credit-account-identity"><span className="credit-account-avatar">{s.account.username.slice(0, 2).toUpperCase()}</span><div><span className="credit-eyebrow">{s.account.role === "User" ? "Client account" : "Reseller account"}</span><h1>{s.account.username}</h1></div><span className="credit-state" data-state={s.classification}>{statusText[s.classification]}</span></div><div className="credit-account-actions"><Button type="button" variant="outline" size="sm" disabled={check.isPending || query.isFetching} onClick={() => check.mutate()}><RefreshCw className={check.isPending ? "animate-spin" : ""} />Run check</Button><Button type="button" size="sm" onClick={() => { setCorrectionMode(s.classification === "matched" ? "transaction" : ""); setTab("correct"); }}>{s.classification === "matched" ? "Recover transaction" : "Review correction"}<ArrowRight /></Button></div></header>
    <nav className="credit-detail-tabs" aria-label="Reconciliation sections">{[["evidence", "Balance explanation", FileSearch], ["ledger", "Complete ledger", Wallet], ["audit", "Audit trail", History], ["correct", "Correction workspace", ShieldCheck]].map(([value, label, Icon]) => <button type="button" key={value} aria-current={tab === value ? "page" : undefined} onClick={() => setTab(value)}><Icon />{label}</button>)}</nav>
    <div className="credit-account-content">
      {tab === "evidence" && <>
        <div className="credit-proof-grid">
          {Object.entries(s.categories || {}).map(([category, lane]) => <section className="credit-proof-section" key={category}>
            <div className="credit-section-title"><h3>{categoryNames[category]}</h3><span>{lane.matches ? "Balances match" : "Review needed"}</span></div>
            <dl className="credit-formula">
              <div><dt>Wallet available / held</dt><dd>{number(lane.walletBalance.available)} / {number(lane.walletBalance.reserved)}</dd></div>
              <div><dt>Ledger available / held</dt><dd>{lane.expectedBalance.available ?? "Unavailable"} / {lane.expectedBalance.reserved ?? "Unavailable"}</dd></div>
            </dl>
          </section>)}
        </div>
        {(s.walletBalance || s.expectedBalance || s.difference || s.transactionCount > 0) && (
          <OverviewMetricCards columns={3} label="Legacy balance comparison" items={[
            { label: "Legacy wallet", value: s.walletBalance, caption: "Credits available in this account", icon: Wallet, accent: true },
            { label: "Legacy ledger", value: s.expectedBalance, caption: "Credits calculated from all movements", icon: ReceiptText },
            { label: "Balance difference", value: s.difference, signDisplay: "exceptZero", caption: s.difference > 0 ? "Wallet has more than the ledger" : s.difference < 0 ? "Wallet has less than the ledger" : "Wallet and ledger match", icon: ShieldAlert },
          ]} />
        )}
        {s.concerns.length > 0 && <div className="credit-evidence-note"><strong>Evidence needs review</strong><ul>{s.concerns.map(concern => <li key={concern}>{concern}</li>)}</ul></div>}
        <div className="credit-proof-grid"><section className="credit-proof-section"><div className="credit-section-title"><h3>The balance, explained</h3><span>{s.transactionCount} entries</span></div><p className="credit-caption">Every recorded movement is included, from the first credit onward.</p><dl className="credit-formula"><div><dt>Starting balance</dt><dd>0</dd></div><div><dt>Credits received & refunds</dt><dd className="credit-positive">+{number(s.totals.inflow)}</dd></div><div><dt>Usage, transfers & reclaims</dt><dd>−{number(s.totals.outflow)}</dd></div><div><dt>Recorded ledger balance</dt><dd>{number(s.expectedBalance)}</dd></div></dl><p className="credit-caption">{s.totals.requestCount ? `${s.totals.requestCount} credit requests excluded. ` : ""}Requests do not move credits.</p></section>
        <section className="credit-proof-section"><div className="credit-section-title"><h3>Where the difference begins</h3>{s.firstBreak && <span className="credit-state" data-state="cannot_confirm">First mismatch</span>}</div>{s.firstBreak ? <><p className="credit-caption">{dateTime(s.firstBreak.at)} · {movements[s.firstBreak.type] || s.firstBreak.type}</p><dl className="credit-formula"><div><dt>Previous saved balance</dt><dd>{number(s.firstBreak.previousRecorded)}</dd></div><div><dt>Movement since that balance</dt><dd>{s.firstBreak.movement >= 0 ? "+" : ""}{number(s.firstBreak.movement)}</dd></div><div><dt>Expected afterward</dt><dd>{number(s.firstBreak.expectedAfter)}</dd></div><div data-warning="true"><dt>Actually saved</dt><dd>{number(s.firstBreak.savedAfter)}</dd></div></dl><div className="credit-break-result"><span>{number(s.firstBreak.difference)} credits unexplained</span><Button type="button" size="sm" variant="ghost" onClick={() => showEntry(s.firstBreak.reference)}>Inspect entry<ArrowUpRight /></Button></div><code className="credit-proof-reference">{s.firstBreak.reference}</code></> : <div className="credit-no-break"><FileSearch /><strong>No earlier break found</strong><p>The available saved transaction balances are consistent. Inspect the latest wallet activity for changes after the last ledger entry.</p><Button type="button" size="sm" variant="outline" onClick={() => setTab("audit")}>View wallet activity<ArrowRight /></Button></div>}</section></div>
        <details className="credit-validation"><summary><span><ShieldCheck />Validation checks</span><span>Checked {dateTime(s.checkedAt)}<ChevronRight /></span></summary><ul className="credit-check-list"><li data-passed="true"><ShieldCheck /><span>Zero starting balance; all recorded movements included</span></li><li data-passed={s.calculationsAgree}><CheckCheck /><span>{s.calculationsAgree ? "Transaction types and postings agree" : "The two ledger calculations disagree"}</span></li><li data-passed={s.audit.verified === true}><History /><span>{s.audit.count ? `${s.audit.count} wallet audit events · ${s.audit.verified ? "Signature chain verified" : "Verification failed"}` : "No older wallet audit records available"}</span></li><li data-passed={!s.minorMismatch}><Wallet /><span>{s.minorMismatch ? "Stored balance formats disagree" : "Stored balance formats agree"}</span></li></ul></details>
      </>}
      {tab === "ledger" && <><div className="credit-ledger-controls"><form onSubmit={event => { event.preventDefault(); setSearch(draftSearch.trim()); setPage(1); }}><Input value={draftSearch} onChange={event => setDraftSearch(event.target.value)} placeholder="Search reference, campaign or notes" aria-label="Search complete ledger" maxLength={120} /><Button type="submit" variant="outline" aria-label="Search ledger"><Search /></Button></form><select aria-label="Movement type" value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="">All movements</option>{Object.entries(movements).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Credit category" value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}><option value="">All categories</option>{Object.entries(categoryNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{(search || type || category) && <Button type="button" variant="ghost" onClick={() => { setSearch(""); setDraftSearch(""); setType(""); setCategory(""); setPage(1); }}>Clear</Button>}</div><p className="credit-caption">The calculation always includes the complete ledger. These filters change only the entries shown below. Open an entry to see its source, rate, campaign, and saved balance.</p><div className="credit-ledger-entries">{data.entries.length ? data.entries.map(row => <LedgerEntry key={row.id} row={row} />) : <div className="credit-empty"><Search /><strong>No matching entries</strong><p>Clear the filters to inspect this account’s complete history.</p></div>}</div><Pager page={page} pages={data.pagination.pages} onChange={setPage} busy={query.isFetching} /></>}
      {tab === "audit" && <AuditHistory userId={userId} />}
      {tab === "correct" && <CorrectionPanel key={correctionMode} initialMode={correctionMode} evidence={data} onChanged={() => { void query.refetch(); }} />}
    </div>
  </section>;
}

export default function ReconciliationPage() { return <ReconciliationWorkspace renderAccount={id => <AccountEvidence key={id} userId={id} />} />; }
