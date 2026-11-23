import RecordReference from "../../../components/ui/RecordReference";
import { dateTime } from "@/lib/format";

export default function TransactionReference({ transaction, showDate = false }) {
  const id = transaction.transactionId || (transaction._id ? `TXN-${String(transaction._id).toUpperCase()}` : "");
  const reference = <RecordReference id={id} prefix="TXN" label="Transaction ID" compact />;
  if (!showDate) return reference;

  const date = new Date(transaction.createdAt);
  const label = dateTime(transaction.createdAt).replace(/ (?=[ap]m$)/i, "\u00a0");
  return (
    <div className="credit-ledger-reference">
      {reference}
      <time className="credit-ledger-date" dateTime={transaction.createdAt && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined}>{label}</time>
    </div>
  );
}
