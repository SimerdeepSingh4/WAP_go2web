import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowDownLeft, ArrowUpRight, Check, Clock3, Copy, Hash, MoreHorizontal, Paperclip, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { supportDate } from "../lib/quickActions";

const labels = { ALLOCATE: "Credits allocated", DEDUCT: "Credits deducted", REFUND: "Credits refunded", RECLAIM: "Credits reclaimed", REQUEST: "Credit request" };
const number = value => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function SupportTransactionCard({ transaction, onAttach, onReview, campaignUrl, disabled, canReview, reviewDisabled }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const request = transaction.type === "REQUEST";
  const incoming = !request && transaction.type !== "DEDUCT" && transaction.direction === "in";
  const Icon = request ? Clock3 : incoming ? ArrowDownLeft : ArrowUpRight;
  async function copyReference() {
    try {
      await navigator.clipboard.writeText(transaction.reference);
      setCopied(true); clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { toast.add({ title: "Could not copy the reference", description: "You can select and copy the reference directly.", type: "error" }); }
  }
  return <article className="support-tool-transaction" data-direction={request ? "request" : incoming ? "in" : "out"}>
    <header className="support-transaction-heading">
      <span className="support-transaction-icon"><Icon aria-hidden="true" /></span>
      <div className="support-transaction-title"><h3>{labels[transaction.type] || transaction.type}</h3><time dateTime={transaction.createdAt}>{supportDate(transaction.createdAt)}</time></div>
      <div className="support-transaction-amount"><strong>{request ? "" : incoming ? "+" : "−"}{number(transaction.amount)}</strong><span>credits{request ? " requested" : ""}</span></div>
    </header>
    <div className="support-transaction-reference"><Hash aria-hidden="true" /><code title={transaction.reference}>{transaction.reference}</code><button type="button" onClick={copyReference} aria-label={copied ? "Reference copied" : `Copy ${transaction.reference}`} title={copied ? "Copied" : "Copy reference"}>{copied ? <Check /> : <Copy />}</button></div>
    {transaction.balanceAfter != null && <div className="support-transaction-balance"><span>Balance after transaction</span><strong>{number(transaction.balanceAfter)} <small>credits</small></strong></div>}
    <footer className="support-tool-transaction-actions">
      <Button readOnlySafe type="button" size="sm" variant="secondary" disabled={disabled} onClick={onAttach}><Paperclip />Attach to reply</Button>
      {(campaignUrl || canReview) && <DropdownMenu><DropdownMenuTrigger aria-label={`More actions for ${transaction.reference}`} render={<Button readOnlySafe type="button" size="icon-sm" variant="ghost" />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent side="bottom" align="end" sideOffset={6} className="support-transaction-menu">
        {campaignUrl && <DropdownMenuItem render={<Link to={campaignUrl} />}><ArrowUpRight />View campaign</DropdownMenuItem>}
        {canReview && <DropdownMenuItem disabled={reviewDisabled} onClick={onReview}><ShieldCheck />Request review</DropdownMenuItem>}
      </DropdownMenuContent></DropdownMenu>}
    </footer>
  </article>;
}
