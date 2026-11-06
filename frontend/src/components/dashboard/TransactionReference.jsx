import RecordReference from "./RecordReference";

export default function TransactionReference({ transaction }) {
  const id = transaction.transactionId || (transaction._id ? `TXN-${String(transaction._id).toUpperCase()}` : "");
  return <RecordReference id={id} prefix="TXN" label="Transaction ID" compact />;
}
