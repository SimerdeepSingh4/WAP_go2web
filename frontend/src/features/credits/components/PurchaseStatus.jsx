import { AlertTriangle, CheckCircle2, Clock, FileCheck2, Flag, Hourglass, ReceiptText, XCircle } from "lucide-react";

const statuses = {
  QUOTED: ["Awaiting payment", "info", ReceiptText],
  PENDING: ["Awaiting review", "info", Clock],
  FLAGGED: ["Flagged for correction", "warning", Flag],
  REVIEW_REQUIRED: ["Manual review", "warning", AlertTriangle],
  APPROVED: ["Credits added", "success", CheckCircle2],
  REJECTED: ["Rejected", "danger", XCircle],
  EXPIRED: ["Quote expired", "neutral", Hourglass],
};

export default function PurchaseStatus({ purchase }) {
  const [label, tone, Icon] = purchase.status === "PENDING" && purchase.fixAttempts > 0
    ? ["Correction submitted", "info", FileCheck2]
    : statuses[purchase.status] || [purchase.status || "Unknown", "neutral", ReceiptText];
  return <span className="portal-status inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-medium" data-tone={tone}><Icon className="size-3.5 shrink-0" aria-hidden="true" />{label}</span>;
}
