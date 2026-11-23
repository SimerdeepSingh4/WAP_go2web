import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ownerName } from "@/lib/format";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getCategoryDisplay, getTransactionNote } from "../lib/creditTransactionDisplay";
import TransactionReference from "./TransactionReference";

export default function TransactionDetails({ transaction, showActor = false, children }) {
  const { user } = useAuth();
  const viewerRole = user?.role;
  const isUser = viewerRole === "User";

  const formatAccount = (account) => {
    if (!account) return isUser ? "Admin" : "Super Admin";
    return ownerName(account, viewerRole);
  };

  const fields = [
    ["Category", getCategoryDisplay(transaction.category).label],
    ["From", formatAccount(transaction.fromUser)],
    ["To", formatAccount(transaction.toUser)],
  ];
  if (showActor) fields.push(["By", formatAccount(transaction.performedBy)]);

  return (
    <Dialog>
      <DialogTrigger render={<Button readOnlySafe variant="ghost" size="icon-sm" aria-label={`View details for ${transaction.transactionId || transaction._id}`} />}>
        <MoreHorizontal aria-hidden="true" />
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Transaction details</DialogTitle></DialogHeader>
        <TransactionReference transaction={transaction} showDate />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-y py-3">
          {fields.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h3 className="mb-1 font-medium">Note</h3>
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere] text-muted-foreground">{getTransactionNote(transaction) || "No note was added."}</p>
        </div>
        {children}
      </DialogContent>
    </Dialog>
  );
}
