// src/features/user/pages/Credits.jsx
import { useSearchParams } from "react-router";
import { useNavigate } from "react-router";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUserQuery, useUserMutation } from "../hooks/useUser";
import { PageHeading, QueryState, FilterSelect, DataTable, Pager } from "@/features/admin/components/shared";
import { dateTime, number, ownerName } from "@/features/admin/lib/format";

/**
 * User Credits page — shows the user's wallet balance and credit transaction history.
 * Users cannot allocate credits, only view their balance and transactions.
 */
export default function UserCredits({ activity = false }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [openDeduct, setOpenDeduct] = useState(false);
  const { mutate: deductCredits, isLoading: deducting } = useUserMutation("deductCredits", "Credits deducted", null);
  const handleDeduct = (e) => {
    e.preventDefault();
    const form = e.target;
    const amount = form.amount.value;
    const note = form.note.value;
    deductCredits({ amount, note });
    setOpenDeduct(false);
  };
  const [open, setOpen] = useState(false);
  const { mutate: addCredits, isLoading: adding } = useUserMutation("addCredits", "Credits added", null);
  const handleAdd = (e) => {
    e.preventDefault();
    const form = e.target;
    const amount = form.amount.value;
    const note = form.note.value;
    addCredits({ amount, note });
    setOpen(false);
  };
  const page = Math.max(1, Number(params.get("page")) || 1);
  const type = params.get("type") || "all";

  const myBalance = useUserQuery("myBalance");
  const ledger = useUserQuery("transactions", { page, limit: 10, ...(type !== "all" ? { type } : {}) });

  function update(key, value) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      value ? next.set(key, value) : next.delete(key);
      if (key !== "page") next.delete("page");
      return next;
    }, { replace: true });
  }

  const transactionLabels = {
    ALLOCATE: "Allocation",
    DEDUCT: "Deduction",
    REFUND: "Refund",
    RECLAIM: "Reclaim",
  };

  const columns = [
    { key: "date", label: "Date", render: (t) => <span className="text-xs">{dateTime(t.createdAt)}</span> },
    { key: "type", label: "Type", render: (t) => transactionLabels[t.type] || t.type },
    { key: "from", label: "From", render: (t) => t.fromUser ? ownerName(t.fromUser) : "—" },
    { key: "to", label: "To", render: (t) => ownerName(t.toUser) },
    { key: "amount", label: "Credits", className: "text-right", render: (t) => <span className="font-medium tabular-nums">{number(t.amount)}</span> },
    { key: "balanceAfterFrom", label: "Bal From", className: "text-right", render: (t) => <span className="font-medium tabular-nums">{number(t.balanceAfterFrom)}</span> },
    { key: "balanceAfterTo", label: "Bal To", className: "text-right", render: (t) => <span className="font-medium tabular-nums">{number(t.balanceAfterTo)}</span> },
    { key: "note", label: "Note", render: (t) => <span className="block max-w-60 whitespace-normal break-words text-xs text-muted-foreground">{t.notes || "—"}</span> },
  ];

  return (
    <>
      <PageHeading
        title={activity ? "Activity" : "Credits"}
        description={activity ? "Trace your credit movements over time." : "View your credit balance and transaction history."}
      />
      {/* Credit button */}
      <div className="flex justify-end mt-4 space-x-2">
        <Button onClick={() => setOpen(true)}>Add Credits</Button>
        <Button variant="destructive" onClick={() => setOpenDeduct(true)}>Deduct Credits</Button>
      </div>
      {/* Add Credits Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Credits</DialogTitle>
            <DialogDescription>Enter the amount of credits to add to your wallet.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAdd} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Amount</label>
              <input name="amount" type="number" min="0" required className="w-full rounded-md border border-gray-300 p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Note (optional)</label>
              <textarea name="note" rows={3} className="w-full rounded-md border border-gray-300 p-2" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={adding}>Cancel</Button>
              <Button type="submit" disabled={adding}>
                {adding ? "Adding…" : "Add Credits"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Deduct Credits Dialog */}
      <Dialog open={openDeduct} onOpenChange={setOpenDeduct}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Deduct Credits</DialogTitle>
            <DialogDescription>Enter the amount of credits to deduct from your wallet.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDeduct} className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-1">Amount</label>
              <input name="amount" type="number" min="0" required className="w-full rounded-md border border-gray-300 p-2" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Note (optional)</label>
              <textarea name="note" rows={3} className="w-full rounded-md border border-gray-300 p-2" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDeduct(false)} disabled={deducting}>Cancel</Button>
              <Button type="submit" disabled={deducting}>
                {deducting ? "Deducting…" : "Deduct Credits"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {!activity && (
        <QueryState query={myBalance}>
          <div className="grid gap-3 sm:grid-cols-3">
            {["Your wallet balance"].map((label) => (
              <Card key={label} className="rounded-lg">
                <CardContent>
                  <p className="flex items-center justify-between text-xs text-muted-foreground">
                    {label}
                    <Wallet className="size-4" />
                  </p>
                  <p className="mt-3 text-2xl font-semibold tabular-nums">
                    {number(myBalance.data?.wallet?.balance)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </QueryState>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
        <h2 className="text-sm font-medium">Transaction history</h2>
        <FilterSelect
          label="Transaction type"
          value={type}
          onChange={(value) => update("type", value)}
          options={[{ value: "all", label: "All transactions" }, ...Object.entries(transactionLabels).map(([value, label]) => ({ value, label }))]}
        />
      </div>
      <QueryState query={ledger}>
        <div>
          <DataTable
            caption="Credit transaction history"
            paginated={false}
            rows={ledger.data?.transactions || []}
            columns={columns}
            emptyTitle="No transactions found"
          />
          <Pager
            page={page}
            totalPages={ledger.data?.pagination?.totalPages || 1}
            total={ledger.data?.pagination?.total || 0}
            onChange={(value) => update("page", String(value))}
            disabled={ledger.isFetching}
          />
        </div>
      </QueryState>
    </>
  );
}
