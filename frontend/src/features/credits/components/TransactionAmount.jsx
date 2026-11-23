import { number } from "@/lib/format";
import { getTransactionDirection } from "../lib/creditTransactionDisplay";

const styles = {
  in: ["Incoming credits", "text-emerald-700 dark:text-emerald-400"],
  out: ["Outgoing credits", "text-red-700 dark:text-red-400"],
  request: ["Requested credits", "text-muted-foreground"],
  transfer: ["Transfer between accounts", "text-muted-foreground"],
  neutral: ["Credits", "text-foreground"],
};

export default function TransactionAmount({ transaction, viewer, amount, direction }) {
  const value = transaction?.amount ?? amount;
  const movement = direction ?? (transaction && getTransactionDirection(transaction, viewer));
  const [label, color] = styles[movement] || styles.neutral;
  return <span title={label} className={"inline-block whitespace-nowrap tabular-nums font-semibold " + color}>
    <span className="sr-only">{label} </span>{number(value == null ? null : Math.abs(value))}
  </span>;
}
