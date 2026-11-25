import TransactionAmount from "@/features/credits/components/TransactionAmount";
import TransactionDetails from "@/features/credits/components/TransactionDetails";
import TransactionReference from "@/features/credits/components/TransactionReference";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Link, useSearchParams } from "react-router";
import { useState } from "react";
import {
  Plus,
  Lock,
  Users,
  CheckCircle2,
  MinusCircle,
  Zap,
  Send,
  PhoneCall,
  ReceiptText,
  ShoppingCart,
  Inbox,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogClose } from "@/components/ui/dialog";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";
import { CreditBalancePreview } from "@/features/dashboard/components/ActionReview";
import { useResellerQuery } from "../hooks/useReseller";
import { PageHeading, QueryState, FilterSelect, DataTable, Pager, ClearFiltersButton } from "@/features/dashboard/components/shared";
import ResellerActionForm from "../components/ResellerActionForm";
import { number, ownerName } from "@/lib/format";
import { getAccountBalanceAfter, getTransactionDisplay, getCategoryDisplay } from "@/features/credits/lib/creditTransactionDisplay";
import RechargeModal from "@/features/credits/components/RechargeModal";
import PurchasesTable from "@/features/credits/components/PurchasesTable";
import RateSettingsCard from "@/features/credits/components/RateSettingsCard";
import CreditWorkspaceNav from "@/features/credits/components/CreditWorkspaceNav";
import "@/features/credits/components/credit-history.css";

const resellerCreditSections = [
  { value: "ledger", label: "Transaction Ledger", shortLabel: "Ledger", icon: ReceiptText },
  { value: "requests", label: "Client Recharge Requests", shortLabel: "Requests", icon: Inbox },
  { value: "my-orders", label: "My Credit Recharges", shortLabel: "Recharges", icon: ShoppingCart },
  { value: "rates", label: "Rates & Bank Details", shortLabel: "Rates", icon: Settings },
];

export default function ResellerCredits({ activity = false }) {
  const { user: signedInUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const type = params.get("type") || "all";
  const categoryFilter = params.get("category") || "all";
  const transactionId = params.get("transaction");
  const account = params.get("account") || "all";
  const allocation = params.get("allocate");
  const rechargeParam = params.get("recharge");
  const rechargeCategory = rechargeParam === "number-filtering" ? "NUMBER_FILTERING" : undefined;
  const [reclaimOpen, setReclaimOpen] = useState(false);
  const [rechargeOpen, setRechargeOpen] = useState(false);
  const activeTab = resellerCreditSections.find(({ value }) => value === params.get("tab"))?.value ?? "ledger";

  const accountsQuery = useResellerQuery("accounts");
  const myBalance = useResellerQuery("myBalance", {}, !activity);
  const ledger = useResellerQuery("transactions", {
    page,
    limit: 10,
    ...(transactionId ? { transactionId } : {}),
    ...(type !== "all" ? { type } : {}),
    ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
    ...(account !== "all" ? { userId: account } : {}),
  });

  const accounts = (accountsQuery.data?.users || []).filter((a) => a.role === "User");
  const ownId = signedInUser?.id || signedInUser?._id;
  const canReclaim = signedInUser?.role === "Super Admin" || signedInUser?.featureAccess?.reclaimCredit === true;
  const isWalletLocked = Boolean(myBalance.data?.wallet?.isLocked);
  const transactions = ledger.data?.transactions || [];

  const canAllocateRequest = (transaction) =>
    transaction.type === "REQUEST" &&
    Boolean(transaction.toUser?._id || transaction.toUser) &&
    String(transaction.toUser?._id || transaction.toUser) !== String(ownId);

  function update(key, value) {
    setParams(
      (old) => {
        const next = new URLSearchParams(old);
        value ? next.set(key, value) : next.delete(key);
        if (key !== "page") next.delete("page");
        return next;
      },
      { replace: true }
    );
  }

  const columns = [
    {
      key: "transactionId",
      label: "Transaction",
      render: transaction => <TransactionReference transaction={transaction} showDate />,
    },
    {
      key: "type",
      label: "Type",
      render: (t) => {
        const info = getTransactionDisplay(t, signedInUser);
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
      render: (t) => {
        const catInfo = getCategoryDisplay(t.category);
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
      render: t => <TransactionAmount transaction={t} viewer={signedInUser} />,
    },
    {
      key: "balance",
      label: "Balance after",
      className: "text-right",
      render: t => <span className="text-sm tabular-nums">{number(getAccountBalanceAfter(t, ownId))}{t.fromReserved && String(t.fromUser?._id ?? t.fromUser) === String(ownId) && <small className="block text-muted-foreground">Reserved</small>}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: transaction => (
        <TransactionDetails transaction={transaction} showActor>
          {canAllocateRequest(transaction) && (
            <DialogClose render={<Button
              size="sm"
              variant="outline"
              nativeButton={false}
              className="credit-ledger-allocate"
              disabled={signedInUser?.isPreview || isWalletLocked}
              aria-label={`Allocate credits to ${ownerName(transaction.toUser)}`}
              title="Allocate credits"
              render={
                <Link
                  to={`/reseller/credits?${new URLSearchParams({
                    allocate: String(transaction.toUser?._id || transaction.toUser),
                    amount: String(transaction.amount),
                    category: transaction.category || "CAMPAIGN",
                  })}`}
                />
              }
            />}>
              <Plus className="size-3.5" aria-hidden="true" />
              <span className="credit-ledger-action-label">Allocate</span>
            </DialogClose>
          )}
        </TransactionDetails>
      ),
    },
  ];

  const creditBalances = myBalance.data?.wallet?.creditBalances;
  const campaignCredits = creditBalances?.CAMPAIGN?.available ?? 0;
  const filteringCredits = creditBalances?.NUMBER_FILTERING?.available ?? 0;

  return (
    <>
      <PageHeading
        title={activity ? "Transactions" : "Credits & Reseller Hub"}
        description={
          activity
            ? "Audit trail of credit transfers, client allocations, and broadcast deductions."
            : "Allocate credits to clients, review recharge requests, and set pricing."
        }
        action={
          !activity ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="credit-recharge-button gap-1.5 font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={signedInUser?.isPreview}
                onClick={() => setRechargeOpen(true)}
              >
                <Zap className="size-4" />
                Recharge Credits
              </Button>
              <Button
                data-tour="reseller-allocate"
                onClick={() => update("allocate", "new")}
                disabled={signedInUser?.isPreview || !accounts.length || accountsQuery.isError || isWalletLocked}
                title={isWalletLocked ? "Your wallet is locked." : undefined}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Allocate credits
              </Button>
              {canReclaim && (
                <Button
                  data-tour="reseller-reclaim"
                  variant="outline"
                  onClick={() => setReclaimOpen(true)}
                  disabled={signedInUser?.isPreview || !accounts.length || accountsQuery.isError}
                  className="gap-1.5"
                >
                  <MinusCircle className="size-4" />
                  Reclaim credits
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {/* KPI Metrics Grid */}
      {!activity && (
        <QueryState query={myBalance} variant="cards">
          <div data-tour="reseller-credit-summary">
            <OverviewMetricCards
              columns={4}
              label="Credit summary"
              items={[
                {
                  label: "Campaign Credits",
                  value: campaignCredits,
                  loading: myBalance.isPending,
                  caption: isWalletLocked ? "Locked · contact administrator" : "Available for client allocation",
                  icon: isWalletLocked ? Lock : Send,
                  accent: true,
                },
                {
                  label: "Filtering Credits",
                  tone: "purple-filled",
                  value: filteringCredits,
                  loading: myBalance.isPending,
                  caption: "Available for number filtering",
                  icon: PhoneCall,
                },
                {
                  label: "Assigned Users",
                  tone: "rose-filled",
                  value: accountsQuery.isSuccess ? accounts.length : null,
                  loading: accountsQuery.isPending,
                  caption: "Registered client accounts",
                  icon: Users,
                  path: "/reseller/users",
                },
                {
                  label: "Active Accounts",
                  tone: "blue-filled",
                  value: accountsQuery.isSuccess
                    ? accounts.filter((a) => a.status === "active").length
                    : null,
                  loading: accountsQuery.isPending,
                  caption: "Eligible for campaigns",
                  icon: CheckCircle2,
                },
              ]}
            />
          </div>
        </QueryState>
      )}

      {!activity && (
        <CreditWorkspaceNav items={resellerCreditSections} active={activeTab} onChange={tab => update("tab", tab === "ledger" ? null : tab)} />
      )}

      {/* Tab Panels */}
      {activeTab === "requests" && !activity ? (
        <PurchasesTable
          scope="client"
          title="Client Recharge Requests"
          description="Review payment proofs and approve credit top-ups for your client users."
        />
      ) : activeTab === "my-orders" && !activity ? (
        <PurchasesTable
          scope="my"
          title="My Credit Purchases"
          description="Track your credit purchases from Super Admin."
        />
      ) : activeTab === "rates" && !activity ? (
        <RateSettingsCard showPurchaseRates />
      ) : (
        <section className="credit-history" aria-labelledby="reseller-transactions-title">
          <div className="credit-ledger-toolbar">
            <div className="credit-ledger-heading">
              <h2 id="reseller-transactions-title" className="text-sm font-semibold text-foreground">
                Transaction Ledger
              </h2>
              <p>Audit trail of all client allocations, deductions, and reclaims.</p>
            </div>
            <div className="credit-ledger-filters flex items-center gap-2">
              <FilterSelect
                label="Category"
                value={categoryFilter}
                onChange={(v) => update("category", v)}
                options={[
                  { value: "all", label: "All Categories" },
                  { value: "CAMPAIGN", label: "Campaign Credits" },
                  { value: "NUMBER_FILTERING", label: "Number Filtering Credits" },
                  { value: "legacy", label: "Legacy Credits" },
                ]}
              />
              <FilterSelect
                label="Account"
                value={account}
                onChange={(v) => update("account", v)}
                options={[
                  { value: "all", label: "All accounts" },
                  ...accounts.map((a) => ({ value: a._id, label: a.username })),
                ]}
              />
              <FilterSelect
                label="Transaction type"
                value={type}
                onChange={(v) => update("type", v)}
                options={[
                  { value: "all", label: "All transaction types" },
                  { value: "ALLOCATE", label: "Allocations" },
                  { value: "DEDUCT", label: "Credit usage" },
                  { value: "REFUND", label: "Refunds" },
                  { value: "RECLAIM", label: "Reclaims" },
                  { value: "REQUEST", label: "Requests" },
                ]}
              />
            </div>
          </div>

          {accountsQuery.isError && <QueryState query={accountsQuery} />}

          {transactionId && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm">
              <span>Showing selected transaction</span>
              <button
                type="button"
                className="font-medium text-indigo-700 underline"
                onClick={() =>
                  setParams((previous) => {
                    const next = new URLSearchParams(previous);
                    next.delete("transaction");
                    next.delete("page");
                    return next;
                  }, { replace: true })
                }
              >
                View all transactions
              </button>
            </div>
          )}

          <QueryState query={ledger}>
            <div className="credit-ledger">
              <DataTable
                caption="Credit transaction history"
                compact
                paginated={false}
                rows={transactions}
                columns={columns}
                mobile={{ primary: "transactionId", featured: ["amount", "balance", "type", "category"] }}
                emptyTitle="No transactions found"
                emptyDescription={
                  type !== "all" || categoryFilter !== "all" || account !== "all" || transactionId
                    ? "No transactions match your selected filters."
                    : "Allocations, campaign charges, and refunds will appear here."
                }
                emptyAction={
                  (type !== "all" || categoryFilter !== "all" || account !== "all" || transactionId) && (
                    <ClearFiltersButton keys={["type", "category", "account", "transaction", "page"]} />
                  )
                }
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
        </section>
      )}

      {/* Allocation Dialog */}
      {!signedInUser?.isPreview && allocation && accountsQuery.isSuccess && accounts.length > 0 && (
        <ResellerActionForm
          title="Allocate credits"
          description="Transfer credits from your wallet to the selected client in the chosen category."
          action="allocate"
          successMessage="Credits allocated successfully"
          onClose={() => update("allocate", null)}
          initialValues={{
            toUserId: accounts.some((a) => a._id === allocation) ? allocation : "",
            category: params.get("category") || "CAMPAIGN",
            amount: params.get("amount") || "",
            notes: "",
          }}
          fields={[
            {
              key: "toUserId",
              label: "Client user",
              required: true,
              options: [
                { value: "", label: "Select client user" },
                ...accounts.map((a) => ({
                  value: a._id,
                  label: `${a.username} · ${a.email}`,
                })),
              ],
            },
            {
              key: "category",
              label: "Credit Category",
              required: true,
              options: [
                { value: "CAMPAIGN", label: `Campaign Credits (${number(campaignCredits)} available)` },
                { value: "NUMBER_FILTERING", label: `Filtering Credits (${number(filteringCredits)} available)` },
              ],
            },
            {
              key: "amount",
              label: "Credits to allocate",
              required: true,
              type: "number",
              min: 1,
              step: 1,
            },
            {
              key: "notes",
              label: "Transaction note",
              type: "textarea",
              maxLength: 500,
              placeholder: "e.g. Package topup",
            },
          ]}
          payload={(v) => ({
            toUserId: v.toUserId,
            category: v.category || "CAMPAIGN",
            amount: Number(v.amount),
            notes: v.notes.trim(),
          })}
          review={(v) => {
            const availableCredits = v.category === "NUMBER_FILTERING" ? filteringCredits : campaignCredits;
            return (
              <>
                <p className="font-medium text-foreground">
                  {accounts.find((a) => a._id === v.toUserId)?.username}
                </p>
                <p className="text-xs mt-1">
                  Category: <strong>{v.category === "NUMBER_FILTERING" ? "Number Filtering Credits" : "Campaign Credits"}</strong>
                </p>
                <p className="text-xs mt-1">
                  Transfer{" "}
                  <strong className="text-primary font-bold">
                    {number(Number(v.amount))} credits
                  </strong>{" "}
                  from your wallet.
                </p>
                <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground mt-1">
                  {v.notes || "No transaction note provided."}
                </p>
                <CreditBalancePreview balance={availableCredits} amount={v.amount} deduct label="Your available credits" />
              </>
            );
          }}
          submitLabel="Allocate credits"
        />
      )}

      {/* Manual Request credits modal */}
      {params.get("request") && !signedInUser?.isPreview && (
        <ResellerActionForm
          title="Request credits"
          description="Send a credit request to the super admin. Your balance changes only when credits are allocated."
          action="requestCredits"
          successMessage="Credit request sent to super admin"
          onClose={() => update("request", null)}
          initialValues={{ category: "CAMPAIGN", amount: "", note: "" }}
          fields={[
            {
              key: "category",
              label: "Credit Category",
              required: true,
              options: [
                { value: "CAMPAIGN", label: "Campaign Credits" },
                { value: "NUMBER_FILTERING", label: "Number Filtering Credits" },
              ],
            },
            { key: "amount", label: "Credits requested", type: "number", required: true, min: 1, step: 1 },
            { key: "note", label: "Note (optional)", type: "textarea", maxLength: 500 },
          ]}
          payload={(v) => ({ category: v.category, amount: Number(v.amount), note: v.note.trim() })}
          review={(v) => (
            <div className="space-y-2 text-xs">
              <p>Category: <strong>{v.category === "NUMBER_FILTERING" ? "Number Filtering Credits" : "Campaign Credits"}</strong></p>
              <p>Requested credits: <strong>{number(Number(v.amount))}</strong></p>
              <p>Sent to: <strong>Super Admin</strong></p>
              {v.note && <p className="whitespace-pre-wrap break-words">{v.note}</p>}
            </div>
          )}
          submitLabel="Submit request"
        />
      )}

      {/* Reclaim credits Dialog */}
      {reclaimOpen && canReclaim && accountsQuery.isSuccess && (
        <ResellerActionForm
          title="Reclaim credits"
          description="Deduct unused credits from a client user and return them to your reseller wallet."
          action="reclaim"
          successMessage="Credits reclaimed successfully"
          onClose={() => setReclaimOpen(false)}
          initialValues={{ fromUserId: "", category: "CAMPAIGN", amount: "", notes: "" }}
          fields={[
            {
              key: "fromUserId",
              label: "Select Client User",
              required: true,
              options: [
                { value: "", label: "Select client user" },
                ...accounts.map((a) => ({ value: a._id, label: `${a.username} · ${a.email}` })),
              ],
            },
            {
              key: "category",
              label: "Credit Category",
              required: true,
              options: [
                { value: "CAMPAIGN", label: "Campaign Credits" },
                { value: "NUMBER_FILTERING", label: "Number Filtering Credits" },
              ],
            },
            { key: "amount", label: "Credits to deduct", required: true, type: "number", min: 1, step: 1 },
            {
              key: "notes",
              label: "Reason",
              required: true,
              type: "textarea",
              maxLength: 500,
              placeholder: "Enter mandatory reason for reclaiming credits",
            },
          ]}
          payload={(v) => ({
            fromUserId: v.fromUserId,
            category: v.category || "CAMPAIGN",
            amount: Number(v.amount),
            notes: v.notes.trim(),
          })}
          review={(v) => (
            <>
              <p className="font-semibold text-destructive">Reclaim credits</p>
              <p className="text-xs mt-1">
                Category: <strong>{v.category === "NUMBER_FILTERING" ? "Number Filtering Credits" : "Campaign Credits"}</strong>
              </p>
              <p className="text-xs mt-1">
                Deducting{" "}
                <strong className="text-destructive font-bold">
                  {number(Number(v.amount))} credits
                </strong>{" "}
                from {accounts.find((a) => a._id === v.fromUserId)?.username}.
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                Reason: {v.notes}
              </p>
            </>
          )}
          submitLabel="Reclaim credits"
        />
      )}

      <RechargeModal
        key={rechargeCategory}
        initialCategory={rechargeCategory}
        onViewOrders={() => {
          setRechargeOpen(false);
          setParams(old => {
            const next = new URLSearchParams(old);
            next.delete("recharge");
            next.delete("page");
            next.set("tab", "my-orders");
            return next;
          }, { replace: true });
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
