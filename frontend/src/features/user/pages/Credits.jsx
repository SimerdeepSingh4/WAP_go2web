import TransactionAmount from "@/features/credits/components/TransactionAmount";
import TransactionDetails from "@/features/credits/components/TransactionDetails";
import TransactionReference from "@/features/credits/components/TransactionReference";
import { useSearchParams } from "react-router";
import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useUserQuery } from "../hooks/useUser";
import { PageHeading, QueryState, FilterSelect, DataTable, Pager, ClearFiltersButton } from "@/features/dashboard/components/shared";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";
import { Lock, Coins, Send, PhoneCall, Zap, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { number, formatCreditRatePaisa } from "@/lib/format";
import { getAccountBalanceAfter, getTransactionDisplay, getCategoryDisplay } from "@/features/credits/lib/creditTransactionDisplay";
import RechargeModal from "@/features/credits/components/RechargeModal";
import PurchasesTable from "@/features/credits/components/PurchasesTable";
import { useCreditRates } from "@/features/credits/hooks/useCredits";
import "@/features/credits/components/credit-history.css";

const labels = { ALLOCATE: "Allocation", DEDUCT: "Credit usage", REFUND: "Refund", RECLAIM: "Reclaim", REQUEST: "Credit request" };

export default function UserCredits({ activity = false }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("history"); // 'history' | 'recharges'

  const page = Math.max(1, Number(params.get("page")) || 1);
  const type = params.get("type") || "all";
  const categoryFilter = params.get("category") || "all";
  const transactionId = params.get("transaction");
  const rechargeParam = params.get("recharge");
  const rechargeCategory = rechargeParam === "number-filtering" ? "NUMBER_FILTERING" : undefined;

  const balance = useUserQuery("myBalance", {}, !activity);
  const ratesQuery = useCreditRates({}, !activity);
  const ledger = useUserQuery("transactions", {
    page,
    limit: 10,
    ...(transactionId ? { transactionId } : {}),
    ...(type !== "all" ? { type } : {}),
    ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
  });

  function update(key, value) {
    setParams(old => {
      const next = new URLSearchParams(old);
      value ? next.set(key, value) : next.delete(key);
      if (key === "type" || key === "category") next.delete("page");
      return next;
    }, { replace: true });
  }

  const accountId = user?.id || user?._id;

  const columns = [
    {
      key: "transactionId",
      label: "Transaction",
      render: transaction => <TransactionReference transaction={transaction} showDate />,
    },
    {
      key: "type",
      label: "Type",
      render: transaction => {
        const info = getTransactionDisplay(transaction, user);
        const Icon = info.icon;
        return (
          <span className={`credit-ledger-badge ${info.badgeClass}`}>
            <Icon className="size-3 shrink-0" aria-hidden="true" />
            {info.label}
          </span>
        );
      },
    },
    {
      key: "category",
      label: "Category",
      render: transaction => {
        const catInfo = getCategoryDisplay(transaction.category);
        return (
          <span className={`credit-ledger-badge ${catInfo.badgeClass}`}>
            {catInfo.label}
          </span>
        );
      },
    },
    {
      key: "amount",
      label: "Credits",
      className: "text-right",
      render: t => <TransactionAmount transaction={t} viewer={user} />,
    },
    {
      key: "balance",
      label: "Balance after",
      className: "text-right",
      render: t => <span className="text-sm tabular-nums">{number(getAccountBalanceAfter(t, accountId))}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: transaction => <TransactionDetails transaction={transaction} />,
    },
  ];

  const campaignCredits = balance.data?.wallet?.creditBalances?.CAMPAIGN?.available ?? 0;
  const filteringCredits = balance.data?.wallet?.creditBalances?.NUMBER_FILTERING?.available ?? 0;

  const campaignPaisa = formatCreditRatePaisa(ratesQuery.data?.purchaseRates?.CAMPAIGN?.unitPriceInr);
  const filterPaisa = formatCreditRatePaisa(ratesQuery.data?.purchaseRates?.NUMBER_FILTERING?.unitPriceInr);

  return (
    <>
      <PageHeading
        title={activity ? "Transactions" : "Credits & Recharge"}
        description={activity ? "Your credit allocations, charges and history." : "Your available balances across campaign broadcast and number filtering, recharge quotes, and credit history."}
        action={!activity ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-tour="recharge-credits"
              className="credit-recharge-button gap-1.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={user?.isPreview}
              onClick={() => setRechargeOpen(true)}
            >
              <Zap className="size-4" /> Recharge Credits
            </Button>
          </div>
        ) : undefined}
      />

      {!activity && (
        <QueryState query={balance} variant="cards">
          <div data-tour="user-credit-summary">
            <OverviewMetricCards
              columns={4}
              label="Credit summary"
              items={[
                {
                  label: "Campaign Credits",
                  value: campaignCredits,
                  loading: balance.isPending,
                  caption: balance.data?.wallet?.isLocked
                    ? "Locked · contact your admin"
                    : "Available for broadcast campaigns",
                  icon: balance.data?.wallet?.isLocked ? Lock : Send,
                  accent: true,
                },
                {
                  label: "Filtering Credits",
                  tone: "purple-filled",
                  value: filteringCredits,
                  loading: balance.isPending,
                  caption: "Available for number filtering",
                  icon: PhoneCall,
                },
                {
                  label: "Rate per campaign credit",
                  tone: "blue-filled",
                  value: campaignPaisa != null ? campaignPaisa : "—",
                  valueSuffix: campaignPaisa != null ? "Paisa" : undefined,
                  loading: ratesQuery.isPending,
                  caption: campaignPaisa != null ? "Price per campaign broadcast credit" : "Rate not configured",
                  icon: Coins,
                },
                {
                  label: "Rate per filter campaign",
                  tone: "rose-filled",
                  value: filterPaisa != null ? filterPaisa : "—",
                  valueSuffix: filterPaisa != null ? "Paisa" : undefined,
                  loading: ratesQuery.isPending,
                  caption: filterPaisa != null ? "Price per number verification credit" : "Rate not configured",
                  icon: PhoneCall,
                },
              ]}
            />
          </div>
        </QueryState>
      )}

      {/* Tabs between Ledger and Recharge Orders */}
      {!activity && (
        <div className="flex border-b border-border my-4 gap-4">
          <button
            type="button"
            className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px ${
              activeTab === "history"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("history")}
          >
            Transaction History
          </button>
          <button
            type="button"
            className={`pb-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
              activeTab === "recharges"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("recharges")}
          >
            <ShoppingCart className="size-4" />
            My Recharge Orders
          </button>
        </div>
      )}

      {activeTab === "recharges" && !activity ? (
        <PurchasesTable scope="my" title="My Recharge Orders" description="Status of your credit purchase quotes and payment proofs." />
      ) : (
        <section className="credit-history" aria-labelledby="user-transactions-title">
          <div className="credit-ledger-toolbar">
            <div className="credit-ledger-heading">
              <h2 id="user-transactions-title" className="text-sm font-semibold text-foreground">Transaction history</h2>
              <p>Allocations, recharges and credit usage.</p>
            </div>
            <div className="credit-ledger-filters flex items-center gap-2">
              <FilterSelect
                label="Category"
                value={categoryFilter}
                onChange={v => update("category", v)}
                options={[
                  { value: "all", label: "All Categories" },
                  { value: "CAMPAIGN", label: "Campaign Credits" },
                  { value: "NUMBER_FILTERING", label: "Number Filtering Credits" },
                ]}
              />
              <FilterSelect
                label="Transaction type"
                value={type}
                onChange={v => update("type", v)}
                options={[
                  { value: "all", label: "All transaction types" },
                  ...Object.entries(labels).map(([value, label]) => ({ value, label })),
                ]}
              />
            </div>
          </div>

          {transactionId && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm">
              <span>Showing selected transaction</span>
              <button
                type="button"
                className="font-medium text-indigo-700 underline"
                onClick={() => setParams((previous) => { const next = new URLSearchParams(previous); next.delete("transaction"); next.delete("page"); return next; }, { replace: true })}
              >
                View all transactions
              </button>
            </div>
          )}

          <QueryState query={ledger}>
            <div className="credit-ledger">
              <DataTable
                caption="Credit transactions"
                compact
                rows={ledger.data?.transactions || []}
                columns={columns}
                mobile={{ primary: "transactionId", featured: ["amount", "balance", "type", "category"] }}
                paginated={false}
                emptyTitle="No transactions found"
                emptyDescription={type !== "all" || categoryFilter !== "all" || transactionId ? "No transactions match your selected filters." : "Your credit allocations, campaign charges, and refunds will appear here."}
                emptyAction={(type !== "all" || categoryFilter !== "all" || transactionId) && <ClearFiltersButton keys={["type", "category", "transaction", "page"]} />}
              />
              <Pager
                page={page}
                totalPages={ledger.data?.pagination?.totalPages || 1}
                total={ledger.data?.pagination?.total || 0}
                onChange={p => update("page", String(p))}
                disabled={ledger.isFetching}
              />
            </div>
          </QueryState>
        </section>
      )}

      {/* Recharge Modal */}
      <RechargeModal
        key={rechargeCategory}
        initialCategory={rechargeCategory}
        onViewOrders={() => {
          setRechargeOpen(false);
          if (rechargeParam) update("recharge", "");
          setActiveTab("recharges");
        }}
        open={rechargeOpen || Boolean(rechargeParam)}
        onOpenChange={(open) => {
          setRechargeOpen(open);
          if (!open && rechargeParam) update("recharge", "");
        }}
      />
    </>
  );
}
