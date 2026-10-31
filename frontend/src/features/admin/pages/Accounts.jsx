import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Plus, MoreHorizontal, Eye, Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PageHeading, QueryState, SearchBox, FilterSelect, StatusBadge, DataTable } from "../components/shared";
import ActionForm from "../components/ActionForm";
import { useAdminQuery } from "../hooks/useAdmin";
import { number, dateTime } from "../lib/format";

function AccountDetail({ account, onClose }) {
  const balance = useAdminQuery("balance", { id: account._id });
  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}><SheetContent className="w-full overflow-y-auto sm:max-w-md"><SheetHeader><SheetTitle>{account.username}</SheetTitle><SheetDescription>{account.role} account details</SheetDescription></SheetHeader><div className="space-y-5 px-4"><StatusBadge status={account.status} /><dl className="space-y-4 text-sm">{[["Email", account.email], ["Rate", `${number(account.ratePerMsg)} credits / recipient`], ["Assigned reseller", account.resellerId?.username || "—"], ["Created", dateTime(account.createdAt)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value}</dd></div>)}</dl><div className="border-t pt-4"><p className="mb-2 text-sm font-medium">Wallet balance</p><QueryState query={balance}><p className="text-2xl font-semibold tabular-nums">{number(balance.data?.wallet?.balance)} <span className="text-sm font-normal text-muted-foreground">credits</span></p></QueryState></div></div></SheetContent></Sheet>;
}

export default function Accounts({ role }) {
  const query = useAdminQuery("accounts");
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const status = params.get("status") || "all";
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const accounts = query.data?.users || [];
  const resellers = accounts.filter((a) => a.role === "Reseller" && a.status === "active");
  const rows = accounts.filter((a) => a.role === role && (status === "all" || a.status === status) && `${a.username} ${a.email} ${a.resellerId?.username || ""}`.toLowerCase().includes(search.toLowerCase()));
  function update(key, value) { setParams((old) => { const next = new URLSearchParams(old); next.set(key, value); return next; }, { replace: true }); }
  const columns = [
    { key: "name", label: "Account", sort: (a) => a.username, render: (a) => <button className="max-w-48 truncate text-left font-medium hover:underline" onClick={() => setDetail(a)}>{a.username}</button> },
    { key: "email", label: "Email", render: (a) => <span className="text-muted-foreground">{a.email}</span> },
    ...(role === "User" ? [{ key: "reseller", label: "Reseller", render: (a) => a.resellerId?.username || <span className="text-muted-foreground">Unassigned</span> }] : [{ key: "users", label: "Users", render: (a) => number(accounts.filter((u) => u.role === "User" && (u.resellerId?._id || u.resellerId) === a._id).length) }]),
    { key: "rate", label: "Credits / recipient", sort: (a) => a.ratePerMsg, render: (a) => <span className="tabular-nums">{number(a.ratePerMsg)}</span> },
    { key: "status", label: "Status", render: (a) => <StatusBadge status={a.status} /> },
    { key: "actions", label: <span className="sr-only">Actions</span>, render: (a) => <DropdownMenu><DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Actions for ${a.username}`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-44"><DropdownMenuItem onClick={() => setDetail(a)}><Eye />Account details</DropdownMenuItem><DropdownMenuItem onClick={() => setModal({ type: "rate", account: a })}><Pencil />Change rate</DropdownMenuItem>{role === "Reseller" && <DropdownMenuItem render={<Link to={`/admin/credits?allocate=${a._id}`} />}><Wallet />Allocate credits</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu> },
  ];
  return <><PageHeading title={role === "Reseller" ? "Resellers" : "Users"} description={role === "Reseller" ? "Manage your reseller network, account rates, and credit access." : "Review user accounts and their assigned resellers."} action={<Button disabled={query.isPending || query.isError || (role === "User" && !resellers.length)} onClick={() => setModal({ type: "create" })}><Plus />Add {role.toLowerCase()}</Button>} />
    {role === "User" && query.isSuccess && !resellers.length && <p className="rounded-md border bg-muted/50 p-3 text-sm">Create an active reseller before adding a user. <Link className="font-medium underline" to="/admin/resellers">Manage resellers</Link></p>}
    <div className="flex flex-wrap justify-between gap-3"><SearchBox label="Search name or email" value={search} onChange={(value) => update("search", value)} /><FilterSelect label="Account status" value={status} onChange={(value) => update("status", value)} options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }]} /></div>
    <QueryState query={query} empty={!accounts.some((a) => a.role === role)} emptyTitle={`No ${role.toLowerCase()} accounts yet`} emptyDescription={`Use Add ${role.toLowerCase()} to create the first account.`}><DataTable key={`${role}-${search}-${status}`} caption={`${role} accounts`} rows={rows} columns={columns} /></QueryState>
    {detail && <AccountDetail account={detail} onClose={() => setDetail(null)} />}
    {modal?.type === "create" && <ActionForm title={`Add ${role.toLowerCase()}`} description={role === "User" ? "Create a user under their account provider." : "Create a reseller account. Credits can be allocated after creation."} action="createAccount" successMessage={`${role} account created`} onClose={() => setModal(null)} initialValues={{ username: "", email: "", password: "", ratePerMsg: "", resellerId: "" }} fields={[
      { key: "username", label: "Account name", required: true, maxLength: 100 }, { key: "email", label: "Email", type: "email", required: true }, { key: "password", label: "Initial password", type: "password", required: true, hint: "Use at least 8 characters." }, { key: "ratePerMsg", label: "Rate (credits / recipient)", type: "number", min: 0.01, step: 0.01, required: true },
      ...(role === "User" ? [{ key: "resellerId", label: "Assigned reseller", required: true, options: [{ value: "", label: "Select reseller" }, ...resellers.map((a) => ({ value: a._id, label: a.username }))] }] : []),
    ]} validate={(v) => v.password.trim().length < 8 ? "The initial password must contain at least 8 characters." : ""} payload={(v) => ({ username: v.username.trim(), email: v.email.trim(), password: v.password, role, ratePerMsg: Number(v.ratePerMsg), ...(role === "User" ? { resellerId: v.resellerId } : {}) })} review={(v) => <><p className="font-medium">{v.username}</p><p>{v.email}</p><p>Role: {role}</p><p>Rate: {number(Number(v.ratePerMsg))} credits / recipient</p>{role === "User" && <p>Reseller: {resellers.find((a) => a._id === v.resellerId)?.username}</p>}</>} submitLabel="Create account" />}
    {modal?.type === "rate" && <ActionForm title="Change account rate" description="This rate applies to future campaign submissions. Existing campaign charges are not recalculated." action="rate" successMessage="Account rate updated" onClose={() => setModal(null)} initialValues={{ ratePerMsg: String(modal.account.ratePerMsg) }} fields={[{ key: "ratePerMsg", label: "Rate (credits / recipient)", required: true, type: "number", min: 0.01, step: 0.01 }]} payload={(v) => ({ userId: modal.account._id, ratePerMsg: Number(v.ratePerMsg) })} review={(v) => <><p className="font-medium">{modal.account.username}</p><p>{number(modal.account.ratePerMsg)} → {number(Number(v.ratePerMsg))} credits / recipient</p></>} submitLabel="Update rate" />}
  </>;
}
