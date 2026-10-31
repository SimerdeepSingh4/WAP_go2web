import { useState } from "react";
import { useSearchParams } from "react-router";
import { Plus, MoreHorizontal, Eye, Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageHeading, QueryState, SearchBox, FilterSelect, StatusBadge, DataTable } from "@/features/admin/components/shared";
import ResellerActionForm from "../components/ResellerActionForm";
import { useResellerQuery } from "../hooks/useReseller";
import { number, dateTime } from "@/features/admin/lib/format";

function UserDetail({ account, onClose }) {
  const balance = useResellerQuery("balance", { id: account._id });
  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}><SheetContent className="w-full overflow-y-auto sm:max-w-md"><SheetHeader><SheetTitle>{account.username}</SheetTitle><SheetDescription>User account details</SheetDescription></SheetHeader><div className="space-y-5 px-4"><StatusBadge status={account.status} /><dl className="space-y-4 text-sm">{[["Email", account.email], ["Rate", `${number(account.ratePerMsg)} credits / recipient`], ["Created", dateTime(account.createdAt)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl><div className="border-t pt-4"><p className="mb-2 text-sm font-medium">Wallet balance</p><QueryState query={balance}><p className="text-2xl font-semibold tabular-nums">{number(balance.data?.wallet?.balance)} <span className="text-sm font-normal text-muted-foreground">credits</span></p></QueryState></div></div></SheetContent></Sheet>;
}

/**
 * Reseller Users page — shows only the users created by this reseller.
 * Backend GET /api/users already filters by resellerId for Reseller role.
 */
export default function ResellerUsers() {
  const query = useResellerQuery("accounts");
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const status = params.get("status") || "all";
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const accounts = query.data?.users || [];
  // Only show User role accounts (reseller can only manage users, not other resellers)
  const rows = accounts.filter((a) => a.role === "User" && (status === "all" || a.status === status) && `${a.username} ${a.email}`.toLowerCase().includes(search.toLowerCase()));
  function update(key, value) { setParams((old) => { const next = new URLSearchParams(old); next.set(key, value); return next; }, { replace: true }); }
  const columns = [
    { key: "name", label: "Account", sort: (a) => a.username, render: (a) => <button className="max-w-48 truncate text-left font-medium hover:underline" onClick={() => setDetail(a)}>{a.username}</button> },
    { key: "email", label: "Email", render: (a) => <span className="text-muted-foreground">{a.email}</span> },
    { key: "rate", label: "Credits / recipient", sort: (a) => a.ratePerMsg, render: (a) => <span className="tabular-nums">{number(a.ratePerMsg)}</span> },
    { key: "status", label: "Status", render: (a) => <StatusBadge status={a.status} /> },
    { key: "actions", label: <span className="sr-only">Actions</span>, render: (a) => <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${a.username}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-44"><DropdownMenuItem onClick={() => setDetail(a)}><Eye />Account details</DropdownMenuItem><DropdownMenuItem onClick={() => setModal({ type: "rate", account: a })}><Pencil />Change rate</DropdownMenuItem><DropdownMenuItem onClick={() => setModal({ type: "allocate", account: a })}><Wallet />Allocate credits</DropdownMenuItem></DropdownMenuContent></DropdownMenu> },
  ];
  return <><PageHeading title="Users" description="Manage your client user accounts. You can create users and allocate credits from your own balance." action={<Button disabled={query.isPending || query.isError} onClick={() => setModal({ type: "create" })}><Plus />Add user</Button>} />
    <div className="flex flex-wrap justify-between gap-3"><SearchBox label="Search name or email" value={search} onChange={(value) => update("search", value)} /><FilterSelect label="Account status" value={status} onChange={(value) => update("status", value)} options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }]} /></div>
    <QueryState query={query} empty={!rows.length} emptyTitle="No user accounts yet" emptyDescription="Use Add user to create the first user account."><DataTable key={`users-${search}-${status}`} caption="User accounts" rows={rows} columns={columns} /></QueryState>
    {detail && <UserDetail account={detail} onClose={() => setDetail(null)} />}
    {modal?.type === "create" && <ResellerActionForm title="Add user" description="Create a user under your reseller account. Credits can be allocated after creation." action="createAccount" successMessage="User account created" onClose={() => setModal(null)} initialValues={{ username: "", email: "", password: "", ratePerMsg: "12" }} fields={[
      { key: "username", label: "Account name", required: true, maxLength: 100 }, { key: "email", label: "Email", type: "email", required: true }, { key: "password", label: "Initial password", type: "password", required: true, hint: "Use at least 8 characters." }, { key: "ratePerMsg", label: "Rate (credits / recipient)", type: "number", min: 0.01, step: 0.01, required: true },
    ]} validate={(v) => v.password.trim().length < 8 ? "The initial password must contain at least 8 characters." : ""} payload={(v) => ({ username: v.username.trim(), email: v.email.trim(), password: v.password, role: "User", ratePerMsg: Number(v.ratePerMsg) })} review={(v) => <><p className="font-medium">{v.username}</p><p>{v.email}</p><p>Role: User</p><p>Rate: {number(Number(v.ratePerMsg))} credits / recipient</p></>} submitLabel="Create account" />}
    {modal?.type === "rate" && <ResellerActionForm title="Change account rate" description="This rate applies to future campaign submissions. Existing campaign charges are not recalculated." action="rate" successMessage="Account rate updated" onClose={() => setModal(null)} initialValues={{ ratePerMsg: String(modal.account.ratePerMsg) }} fields={[{ key: "ratePerMsg", label: "Rate (credits / recipient)", required: true, type: "number", min: 0.01, step: 0.01 }]} payload={(v) => ({ userId: modal.account._id, ratePerMsg: Number(v.ratePerMsg) })} review={(v) => <><p className="font-medium">{modal.account.username}</p><p>{number(modal.account.ratePerMsg)} → {number(Number(v.ratePerMsg))} credits / recipient</p></>} submitLabel="Update rate" />}
    {modal?.type === "allocate" && <ResellerActionForm title="Allocate credits" description="Credits will be deducted from your own wallet and added to this user's balance." action="allocate" successMessage="Credits allocated successfully" onClose={() => setModal(null)} initialValues={{ amount: "", notes: "" }} fields={[
      { key: "amount", label: "Credits to allocate", required: true, type: "number", min: 0.01, step: 0.01 },
      { key: "notes", label: "Transaction note", type: "textarea", maxLength: 500 },
    ]} payload={(v) => ({ toUserId: modal.account._id, amount: Number(v.amount), notes: v.notes.trim() })} review={(v) => <><p className="font-medium">{modal.account.username}</p><p>Add <strong>{number(Number(v.amount))} credits</strong> from your wallet.</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{v.notes || "No transaction note."}</p></>} submitLabel="Allocate credits" />}
  </>;
}
