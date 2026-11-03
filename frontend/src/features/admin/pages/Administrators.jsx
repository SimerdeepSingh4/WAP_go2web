import { useState } from "react";
import { PageHeading, SearchBox, QueryState, DataTable, StatusBadge } from "../components/shared";
import { useAdminQuery } from "../hooks/useAdmin";
import { dateTime } from "../lib/format";

export default function Administrators() {
  const query = useAdminQuery("accounts");
  const [search, setSearch] = useState("");
  const rows = (query.data?.users || []).filter(a => a.role === "Super Admin" && `${a.username} ${a.email}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <PageHeading title="Super admins" description="Accounts with platform-wide management access." />
    <SearchBox value={search} onChange={setSearch} label="Search super admins" />
    <QueryState query={query}><DataTable key={search} caption="Super admin accounts" rows={rows} columns={[
      { key: "name", label: "Name", sort: a => a.username, render: a => a.username },
      { key: "email", label: "Email", render: a => a.email },
      { key: "status", label: "Status", render: a => <StatusBadge status={a.status} /> },
      { key: "created", label: "Added", sort: a => new Date(a.createdAt).getTime(), render: a => dateTime(a.createdAt) },
    ]} /></QueryState>
    <p className="text-sm text-muted-foreground">Role changes and removal of super admin accounts are not available in this dashboard.</p>
  </>;
}
