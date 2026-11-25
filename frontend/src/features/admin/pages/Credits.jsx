import TransactionAmount from "@/features/credits/components/TransactionAmount";
import TransactionReference from "@/features/credits/components/TransactionReference";
import "./admin-transactions.css";
import "@/features/credits/components/credit-history.css";
import { Popover } from "@base-ui/react/popover";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Plus,
  Wallet,
  RotateCcw,
  Coins,
  ReceiptText,
  MoreHorizontal,
  Lock,
  Send,
  PhoneCall,
  Inbox,
  Settings,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import OverviewMetricCards from "@/features/dashboard/components/OverviewMetricCards";
import { CreditBalancePreview } from "@/features/dashboard/components/ActionReview";
import "@/features/accounts/components/account-list.css";
import { useAdminQuery } from "../hooks/useAdmin";
import {
  PageHeading,
  QueryState,
  FilterSelect,
  SearchBox,
  ClearFiltersButton,
  StatusBadge,
  DataTable,
  Pager,
} from "../../dashboard/components/shared";
import ActionForm from "../components/ActionForm";
import { number, ownerName } from "../../../lib/format";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getTransactionDisplay, getCategoryDisplay, getTransactionNote } from "@/features/credits/lib/creditTransactionDisplay";
import PurchasesTable from "@/features/credits/components/PurchasesTable";
import RateSettingsCard from "@/features/credits/components/RateSettingsCard";
import CreditWorkspaceNav from "@/features/credits/components/CreditWorkspaceNav";

const adminCreditSections = [
  { value: "wallets", label: "Account Wallets & Balances", shortLabel: "Wallets", icon: Wallet },
  { value: "requests", label: "Platform Recharge Requests", shortLabel: "Requests", icon: Inbox },
  { value: "rates", label: "Rates & Bank Details", shortLabel: "Rates", icon: Settings },
];

const transactionLabels = {
  REQUEST: "Credit request",
  ALLOCATE: "Credit Added",
  DEDUCT: "Credit usage",
  REFUND: "Refund",
  RECLAIM: "Credit Deducted",
};

export default function AdminCredits({ activity = false }) {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const type = params.get("type") || "all";
  const categoryFilter = params.get("category") || "all";
  const account = params.get("account") || "all";
  const allocation = params.get("allocate");
  const transactionId = params.get("transaction");
  const [reclaimOpen, setReclaimOpen] = useState(false);
  const [reclaimAccount, setReclaimAccount] = useState(null);
  const [walletSearch, setWalletSearch] = useState("");
  const [walletRole, setWalletRole] = useState("all");
  const adminTab = adminCreditSections.find(({ value }) => value === params.get("tab"))?.value ?? "wallets";

  const accountsQuery = useAdminQuery("accounts");
  const overview = useAdminQuery("overview", {}, !activity);
  const ledger = useAdminQuery(
    "transactions",
    {
      page,
      limit: 10,
      ...(transactionId ? { transactionId } : {}),
      ...(type !== "all" ? { type } : {}),
      ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
      ...(account !== "all" ? { userId: account } : {}),
    },
    activity
  );

  const accounts = (accountsQuery.data?.users || []).filter((a) => a.role !== "Super Admin");
  const activeAccounts = accounts.filter((a) => a.status === "active");

  const filteredAccounts = accounts.filter((a) => {
    const matchesSearch = `${a.username} ${a.email} ${a.resellerId?.username || ""}`
      .toLowerCase()
      .includes(walletSearch.toLowerCase());
    const matchesRole = walletRole === "all" || a.role === walletRole;
    return matchesSearch && matchesRole;
  });

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

  // Columns for the Transaction History Table
  const transactionColumns = [
    {
      key: "transactionId",
      label: "Transaction ID",
      render: transaction => <TransactionReference transaction={transaction} showDate />,
    },
    {
      key: "type",
      label: "Type",
      render: (t) => {
        const info = getTransactionDisplay(t, user);
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
      key: "from",
      label: "From",
      render: (t) => (t.fromUser ? <span className="credit-ledger-account text-xs" title={ownerName(t.fromUser)}>{ownerName(t.fromUser)}</span> : <span className="text-xs font-medium text-muted-foreground">Super Admin</span>),
    },
    {
      key: "to",
      label: "To",
      render: (t) => <span className="credit-ledger-account text-xs font-medium" title={ownerName(t.toUser)}>{ownerName(t.toUser)}</span>,
    },
    {
      key: "amount",
      label: "Credits",
      className: "text-right",
      render: t => <TransactionAmount transaction={t} viewer={user} />,
    },
    {
      key: "actor",
      label: "By",
      render: (t) => <span className="credit-ledger-account text-xs text-muted-foreground" title={ownerName(t.performedBy)}>{ownerName(t.performedBy)}</span>,
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (t) => (
        <Popover.Root>
          <Popover.Trigger render={<Button variant="ghost" size="icon" aria-label={`Actions for transaction ${t.transactionId || t._id}`} />}>
            <MoreHorizontal aria-hidden="true" />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner align="end" sideOffset={4} className="z-50">
              <Popover.Popup className="w-64 max-w-(--available-width) max-h-(--available-height) overflow-y-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
                <Popover.Title className="text-xs font-medium text-muted-foreground">Transaction note</Popover.Title>
                <p className="mt-1 whitespace-pre-wrap wrap-anywhere text-sm">{getTransactionNote(t) || "No note recorded."}</p>
                {t.type === "REQUEST" && (
                  <Button size="sm" variant="outline" nativeButton={false} className="mt-3"
                    render={<Link to={`/admin/credits?allocate=${t.toUser?._id || t.toUser}&amount=${t.amount}&category=${t.category || "CAMPAIGN"}`} />}>
                    <Plus aria-hidden="true" /> Allocate credits
                  </Button>
                )}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      ),
    },
  ];

  // Columns for the Account Wallets & Balances Table (Credits view)
  const walletColumns = [
    {
      key: "account",
      label: "Account",
      sort: (a) => a.username,
      render: (a) => (
        <div className="max-w-44 truncate">
          <p className="font-medium text-foreground truncate">{a.username}</p>
          <p className="text-xs text-muted-foreground truncate">{a.email}</p>
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      sort: (a) => a.role,
      render: (a) => (
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium border ${
            a.role === "Reseller"
              ? "border-blue-200 bg-blue-50 text-blue-800"
              : "border-stone-200 bg-stone-50 text-stone-700"
          }`}
        >
          {a.role}
        </span>
      ),
    },
    {
      key: "reseller",
      label: "Reseller",
      render: (a) =>
        a.role === "User" ? (
          <span className="text-xs text-muted-foreground">{a.resellerId?.username || "Direct (Admin)"}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "balance",
      label: "Wallet balance",
      sort: (a) => a.wallet?.balance ?? 0,
      render: (a) => {
        const isLocked = a.wallet?.isLocked;
        return (
          <div className="flex items-center gap-1.5">
            <span className={`tabular-nums font-semibold text-sm ${isLocked ? "text-red-700" : "text-foreground"}`}>
              {number(a.wallet?.balance ?? 0)}
            </span>
            <span className="text-[11px] text-muted-foreground">credits</span>
            {isLocked && <Lock className="size-3 text-red-600" title="Wallet locked" />}
          </div>
        );
      },
    },
    {
      key: "rate",
      label: "Rate per campaign credit",
      sort: (a) => a.ratePerMsg,
      render: (a) => <span className="tabular-nums text-xs">{number(a.ratePerMsg)}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (a) => <StatusBadge status={a.isExpired ? "expired" : a.status} />,
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (a) => (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Wallet actions for ${a.username}`} />}>
            <MoreHorizontal aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => update("allocate", a._id)}>
              <Plus aria-hidden="true" /> Allocate credits
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              setReclaimAccount(a);
              setReclaimOpen(true);
            }}>
              <RotateCcw aria-hidden="true" /> Reclaim credits
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link to={`/admin/activity?account=${a._id}`} />}>
              <ReceiptText aria-hidden="true" /> View transactions
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  // Modals for Allocation & Reclaim
  const modals = (
    <>
      {/* Credit Allocation Dialog */}
      {allocation && accountsQuery.isSuccess && activeAccounts.length > 0 && (
        <ActionForm
          title="Allocate credits"
          description="Add credits to the selected reseller or user wallet."
          action="allocate"
          successMessage="Credits added successfully"
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
              label: "Select Account (User or Reseller)",
              required: true,
              options: [
                { value: "", label: "Select account" },
                ...accounts
                  .filter((a) => a.status === "active" || a._id === allocation)
                  .map((a) => ({ value: a._id, label: `${a.username} (${a.role}) · ${a.email}` })),
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
            { key: "amount", label: "Credits to allocate", required: true, type: "number", min: 1, step: 1 },
            { key: "notes", label: "Note (Optional)", type: "textarea", maxLength: 500 },
          ]}
          payload={(v) => ({
            toUserId: v.toUserId,
            category: v.category || "CAMPAIGN",
            amount: Number(v.amount),
            notes: v.notes.trim(),
          })}
          review={(v) => {
            const target = accounts.find((a) => a._id === v.toUserId);
            return (
              <>
                <p className="font-medium text-foreground">{target?.username} <span className="text-xs text-muted-foreground font-normal">({target?.role})</span></p>
                <p className="text-xs mt-1">
                  Category: <strong>{v.category === "NUMBER_FILTERING" ? "Number Filtering Credits" : "Campaign Credits"}</strong>
                </p>
                <p className="text-xs mt-1">
                  Add <strong>{number(Number(v.amount))} credits</strong> to this account.
                </p>
                <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs mt-1">
                  {v.notes || "No note."}
                </p>
                <CreditBalancePreview balance={target?.wallet?.balance} amount={v.amount} />
              </>
            );
          }}
          submitLabel="Allocate credits"
        />
      )}

      {/* Reclaim credits Dialog */}
      {reclaimOpen && accountsQuery.isSuccess && activeAccounts.length > 0 && (
        <ActionForm
          title="Reclaim credits"
          description="Take back unused credits from an account."
          action="reclaim"
          successMessage="Credits deducted successfully"
          onClose={() => {
            setReclaimOpen(false);
            setReclaimAccount(null);
          }}
          initialValues={{
            fromUserId: reclaimAccount ? reclaimAccount._id : "",
            category: "CAMPAIGN",
            amount: "",
            notes: "",
          }}
          fields={[
            {
              key: "fromUserId",
              label: "Select Account (User or Reseller)",
              required: true,
              options: [
                { value: "", label: "Select account" },
                ...accounts
                  .filter((a) => a.status === "active")
                  .map((a) => ({ value: a._id, label: `${a.username} (${a.role}) · ${a.email}` })),
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
            { key: "notes", label: "Reason (optional)", type: "textarea", maxLength: 500, placeholder: "e.g. Account closure, overpayment reversal" },
          ]}
          payload={(v) => ({
            fromUserId: v.fromUserId,
            category: v.category || "CAMPAIGN",
            amount: Number(v.amount),
            notes: v.notes.trim(),
          })}
          review={(v) => {
            const target = accounts.find((a) => a._id === v.fromUserId);
            return (
              <>
                <p className="font-medium text-foreground">{target?.username} <span className="text-xs text-muted-foreground font-normal">({target?.role})</span></p>
                <p className="text-xs mt-1">
                  Category: <strong>{v.category === "NUMBER_FILTERING" ? "Number Filtering Credits" : "Campaign Credits"}</strong>
                </p>
                <p className="text-xs mt-1">
                  Reclaim <strong>{number(Number(v.amount))} credits</strong> from this account.
                </p>
                <p className="whitespace-pre-wrap break-words text-muted-foreground text-xs mt-1">
                  {v.notes || "No reason specified."}
                </p>
              </>
            );
          }}
          submitLabel="Reclaim credits"
        />
      )}
    </>
  );

  // ─────────────────────────────────────────────────────────────
  // VIEW 1: CREDITS & WALLETS (Activity = false)
  // ─────────────────────────────────────────────────────────────
  if (!activity) {
    const stats = overview.data?.stats;
    const campaignCirculating = stats?.credits?.categoryBalances?.CAMPAIGN?.available ?? stats?.credits?.totalCreditsInCirculation ?? 0;
    const filteringCirculating = stats?.credits?.categoryBalances?.NUMBER_FILTERING?.available ?? 0;

    return (
      <>
        <PageHeading
          title="Credits & Wallets"
          description="Manage wallet balances, allocate credits to users and resellers, and track network balances."
          action={
            <div data-tour="credit-actions" className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setReclaimAccount(null);
                  setReclaimOpen(true);
                }}
                disabled={!activeAccounts.length || accountsQuery.isError}
                className="gap-1.5 text-xs"
              >
                <RotateCcw className="size-3.5 text-amber-600" />
                Reclaim credits
              </Button>
              <Button
                onClick={() => update("allocate", "new")}
                disabled={!activeAccounts.length || accountsQuery.isError}
                className="gap-1.5"
              >
                <Plus className="size-4" />
                Allocate credits
              </Button>
            </div>
          }
        />

        {/* Overview Stats Cards */}
        <QueryState query={overview} variant="cards">
          <div data-tour="credit-summary">
            <OverviewMetricCards
              columns={4}
              label="Credit summary"
              items={[
                { label: "Admin Balance", value: "Unlimited", caption: "Unlimited minting pool", icon: Wallet, accent: true },
                { label: "Campaign Circulating", tone: "blue-filled", value: campaignCirculating, caption: "Campaign broadcast credits in wallets", icon: Send },
                { label: "Filtering Circulating", tone: "purple-filled", value: filteringCirculating, caption: "Number verification credits in wallets", icon: PhoneCall },
                { label: "Total Allocated", tone: "rose-filled", value: stats?.credits?.totalAllocatedBySuperAdmin, caption: "Lifetime allocated by Super Admin", icon: Coins },
              ]}
            />
          </div>
        </QueryState>

        <CreditWorkspaceNav items={adminCreditSections} active={adminTab} onChange={tab => update("tab", tab === "wallets" ? null : tab)} />

        {/* Panels */}
        {adminTab === "requests" ? (
          <PurchasesTable
            scope="all"
            title="Platform Recharge Requests"
            description="Review payment proofs and fulfill credit top-up quotes for resellers and direct client users."
          />
        ) : adminTab === "rates" ? (
          <RateSettingsCard />
        ) : (
          /* Account Wallets & Balances Section */
          <div className="space-y-3 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Account Wallet Balances</h2>
                <p className="text-xs text-muted-foreground">Live wallet balances across all resellers and client users</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SearchBox
                  label="Search account..."
                  value={walletSearch}
                  onChange={setWalletSearch}
                />
                <FilterSelect
                  label="Filter by role"
                  value={walletRole}
                  onChange={setWalletRole}
                  options={[
                    { value: "all", label: "All accounts" },
                    { value: "Reseller", label: "Resellers" },
                    { value: "User", label: "Users" },
                  ]}
                />
              </div>
            </div>

            <QueryState query={accountsQuery} empty={!accounts.length} emptyTitle="No account wallets yet" emptyDescription="Add a user or reseller account before allocating credits." emptyAction={<Button variant="outline" nativeButton={false} render={<Link to="/admin/users" />}>Manage users</Button>}>
              <DataTable
                caption="Account wallets and balances"
                compact
                className="account-list-table account-list-table-wallets"
                rows={filteredAccounts}
                emptyTitle="No accounts match your filters"
                emptyAction={<Button variant="outline" onClick={() => { setWalletSearch(""); setWalletRole("all"); }}>Clear filters</Button>}
                columns={walletColumns}
                pageSize={10}
              />
            </QueryState>
          </div>
        )}

        {modals}
      </>
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VIEW 2: TRANSACTIONS AUDIT LEDGER (Activity = true)
  // ─────────────────────────────────────────────────────────────
  return (
    <>
      <PageHeading
        title="Transactions"
        description="Complete audit log of all credit allocations, campaign charges, refunds, and deductions."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/admin/credits" />}
              className="gap-1.5 text-xs"
            >
              <Wallet className="size-3.5 text-primary" />
              Manage Wallets
            </Button>
            <Button
              onClick={() => update("allocate", "new")}
              disabled={!activeAccounts.length || accountsQuery.isError}
              className="gap-1.5"
            >
              <Plus className="size-4" />
              Allocate credits
            </Button>
          </div>
        }
      />

      {/* Transaction Filter Header */}
      <div className="transaction-ledger-toolbar">
        <h2 className="text-sm font-semibold">Transaction Audit Ledger</h2>
        <div className="transaction-ledger-filters">
          <FilterSelect
            label="Category"
            value={categoryFilter}
            onChange={(value) => update("category", value)}
            options={[
              { value: "all", label: "All Categories" },
              { value: "CAMPAIGN", label: "Campaign Credits" },
              { value: "NUMBER_FILTERING", label: "Number Filtering Credits" },
              { value: "legacy", label: "Legacy Credits" },
            ]}
          />
          <div className="transaction-type-filter">
            <FilterSelect
              label="Transaction type"
              value={type}
              onChange={(value) => update("type", value)}
              options={[
                { value: "all", label: "All types" },
                ...Object.entries(transactionLabels).map(([value, label]) => ({ value, label })),
              ]}
            />
          </div>
          <div className="transaction-account-filter">
            <FilterSelect
              label="Filter by account"
              accountSearch={{}}
              value={account}
              onChange={(value) => update("account", value)}
              disabled={!accountsQuery.isSuccess}
              options={[
                { value: "all", label: "All accounts" },
                ...accounts.map((a) => ({ value: a._id, label: `${a.username} (${a.role})` })),
              ]}
            />
          </div>
        </div>
      </div>

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
        <div className="credit-ledger transaction-ledger-table">
          <DataTable
            caption="Credit transaction history"
            compact
            paginated={false}
            rows={ledger.data?.transactions || []}
            columns={transactionColumns}
            mobile={{ primary: "transactionId", secondary: "to", featured: ["amount", "type", "category"] }}
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

      {modals}
    </>
  );
}
