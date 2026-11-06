import { useId, useState } from "react";
import MobileTableRows from "@/components/dashboard/MobileTableRows";
import AccountPicker from "@/components/dashboard/AccountPicker";
import "@/components/dashboard/responsive-table.css";
import { Search, Inbox, RefreshCw, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { statusLabels } from "../lib/format";

export function PageHeading({ title, description, action, eyebrow }) {
  return (
    <div className="portal-page-heading">
      <div className="min-w-0">
        {eyebrow && (
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }) {
  const tone = ["active", "completed", "sent"].includes(status)
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : status === "pending"
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : status === "scheduled"
    ? "border-purple-200 bg-purple-50 text-purple-700"
    : status === "ongoing"
    ? "border-blue-200 bg-blue-50 text-blue-700"
    : status === "stopped"
    ? "border-stone-300 bg-stone-100 text-stone-800"
    : ["failed", "blocked", "expired"].includes(status)
    ? "border-red-200 bg-red-50 text-red-800"
    : "bg-muted text-muted-foreground";

  return <Badge variant="outline" className={`rounded-md font-normal ${tone}`}>{statusLabels[status] || status}</Badge>;
}

export function FilterSelect({ label, value, onChange, options, id, disabled = false, accountSearch }) {
  if (accountSearch || options.some(option => /^[a-f\d]{24}$/i.test(String(option.value)))) return <AccountPicker {...{ label, value, onChange, options, id, disabled }} accountSearch={accountSearch || {}} />;
  return <Select value={value} onValueChange={onChange} items={options} disabled={disabled}>
    <SelectTrigger id={id} aria-label={label} className="h-9 min-w-36 max-w-full"><SelectValue /></SelectTrigger>
    <SelectContent align="start" alignItemWithTrigger={false}>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}

export function SearchBox({ value, onChange, label = "Search" }) {
  return <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" /><Input className="h-9 pl-9" aria-label={label} placeholder={label} value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}

export function QueryState({ query, children, empty = false, emptyTitle = "No records yet", emptyDescription = "Records will appear here when they are available." }) {
  if (query.isPending) return <div role="status" aria-label="Loading records" className="space-y-3 p-6"><span className="sr-only">Loading records</span>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;
  if (query.isError) return <div role="alert" className="space-y-3 rounded-lg border border-red-200 bg-red-50/40 p-5"><p className="font-medium">Unable to load this information</p><p className="text-sm text-muted-foreground">{query.error.message}</p><Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw />Retry</Button></div>;
  if (empty) return <Empty className="py-12"><EmptyHeader><Inbox className="mx-auto mb-2 size-6 text-muted-foreground" aria-hidden="true" /><EmptyTitle>{emptyTitle}</EmptyTitle><EmptyDescription>{emptyDescription}</EmptyDescription></EmptyHeader></Empty>;
  return children;
}

export function Field({ label, id, hint, children }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground" id={`${id}-hint`}>{hint}</p>}</div>;
}

export function FormError({ message }) {
  return message ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{message}</p> : null;
}

export function Pager({ page, totalPages, total, onChange, disabled }) {
  return <div className="responsive-table-pager flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground"><span>{total} record{total === 1 ? "" : "s"}</span><nav aria-label="Table pagination" className="flex items-center gap-3"><span>Page {page} of {Math.max(1, totalPages)}</span><Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft /></Button><Button variant="outline" size="icon-sm" aria-label="Next page" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}><ChevronRight /></Button></nav></div>;
}

// Lists currently arrive unpaginated from the API; paginate and sort the complete result.
export function DataTable({ rows, columns, emptyTitle = "No matching records", pageSize = 10, caption, paginated = true, mobile }) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(null);
  const sortId = useId();
  const sortColumn = columns.find((column) => column.key === sort?.key && column.sort);
  const sorted = sortColumn ? [...rows].sort((a, b) => {
    const left = sortColumn.sort(a), right = sortColumn.sort(b);
    return (typeof left === "number" ? left - right : String(left).localeCompare(String(right))) * sort.direction;
  }) : rows;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages);
  const visibleRows = paginated ? sorted.slice((current - 1) * pageSize, current * pageSize) : sorted;
  const sortable = columns.filter((column) => column.sort);
  function changeSort(key) {
    setSort(key ? { key, direction: sort?.key === key ? -sort.direction : 1 } : null);
    setPage(1);
  }
  return <div data-tour="records" className="responsive-data-table min-w-0 overflow-hidden rounded-lg border bg-card">
    {rows.length > 0 && sortable.length > 0 && <div className="mobile-table-sort">
      <label htmlFor={sortId}>Sort by</label>
      <select id={sortId} value={sortColumn?.key || ""} onChange={(event) => { setSort(event.target.value ? { key: event.target.value, direction: 1 } : null); setPage(1); }}>
        <option value="">Original order</option>
        {sortable.map((column) => <option key={column.key} value={column.key}>{column.mobileLabel || (typeof column.label === "string" ? column.label : column.key)}</option>)}
      </select>
      {sortColumn && <Button type="button" variant="outline" size="sm" onClick={() => changeSort(sortColumn.key)} aria-label={`Sort ${sortColumn.mobileLabel || sortColumn.key} ${sort.direction === 1 ? "descending" : "ascending"}`}><ArrowUpDown aria-hidden="true" />{sort.direction === 1 ? "Ascending" : "Descending"}</Button>}
    </div>}
    <MobileTableRows rows={visibleRows} columns={columns} caption={caption} mobile={mobile} />
    <div className="responsive-table-desktop max-w-full overflow-x-auto" role="region" aria-label={caption} tabIndex={0}>
      <Table><caption className="sr-only">{caption}</caption>
        <TableHeader><TableRow className="bg-muted/60 hover:bg-muted/60">{columns.map((column) => <TableHead key={column.key} className={column.className} aria-sort={sort?.key === column.key ? sort.direction === 1 ? "ascending" : "descending" : undefined}>
          {column.sort ? <button className="inline-flex items-center gap-1.5 py-3 text-xs font-medium" onClick={() => changeSort(column.key)}>{column.label}<ArrowUpDown className="size-3" aria-hidden="true" /></button> : column.label}
        </TableHead>)}</TableRow></TableHeader>
        <TableBody>{visibleRows.map((row, index) => <TableRow key={row._id || row.id || row.rowNumber || index}>{columns.map((column) => <TableCell key={column.key} className={`py-3.5 ${column.className || ""}`}>{column.render(row)}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </div>
    {!rows.length && <Empty className="py-10"><EmptyHeader><EmptyTitle>{emptyTitle}</EmptyTitle><EmptyDescription>Try another search or clear the filters.</EmptyDescription></EmptyHeader></Empty>}
    {paginated && <Pager page={current} totalPages={pages} total={rows.length} onChange={setPage} />}
  </div>;
}
