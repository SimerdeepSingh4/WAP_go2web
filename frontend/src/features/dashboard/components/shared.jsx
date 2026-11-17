import { useId, useState } from "react";
import { useSearchParams } from "react-router";
import { AnimatedCollapse } from "@/components/ui/animated-collapse";
import MobileTableRows from "@/features/dashboard/components/MobileTableRows";
import AccountPicker from "@/features/accounts/components/AccountPicker";
import "@/features/dashboard/components/responsive-table.css";
import { Search, Inbox, RefreshCw, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { statusLabels } from "../../../lib/format";

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
      {action && <div className="portal-page-actions">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status }) {
  const tone = ["active", "completed", "sent"].includes(status)
    ? "success"
    : status === "pending"
    ? "warning"
    : ["scheduled", "ongoing"].includes(status)
    ? "info"
    : ["failed", "blocked", "expired"].includes(status)
    ? "danger"
    : "neutral";

  return <Badge variant="outline" className="portal-status font-normal" data-tone={tone}>{statusLabels[status] || status}</Badge>;
}

export function FilterSelect({ label, value, onChange, options, id, disabled = false, accountSearch, invalid, describedBy }) {
  if (accountSearch || options.some(option => /^[a-f\d]{24}$/i.test(String(option.value)))) return <AccountPicker {...{ label, value, onChange, options, id, disabled, invalid, describedBy }} accountSearch={accountSearch || {}} />;
  return <Select value={value} onValueChange={onChange} items={options} disabled={disabled}>
    <SelectTrigger id={id} aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy} className="h-9 min-w-36 max-w-full"><SelectValue /></SelectTrigger>
    <SelectContent align="start" alignItemWithTrigger={false}>{options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select>;
}

export function SearchBox({ value, onChange, label = "Search" }) {
  return <div className="portal-search-field relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" aria-hidden="true" /><Input className="h-9 pl-9 pr-10" type="search" aria-label={label} placeholder={label} value={value} onChange={(e) => onChange(e.target.value)} />{value && <button type="button" className="portal-search-clear" aria-label={`Clear ${label.toLowerCase()}`} onClick={(event) => { onChange(""); event.currentTarget.parentElement.querySelector("input")?.focus(); }}><X aria-hidden="true" /></button>}</div>;
}

export function ClearFiltersButton({ keys = ["search", "status"] }) {
  const [, setParams] = useSearchParams();
  return <Button type="button" variant="outline" size="sm" onClick={() => setParams(previous => { const next = new URLSearchParams(previous); keys.forEach(key => next.delete(key)); return next; }, { replace: true })}>Clear filters</Button>;
}

export function QueryState({ query, children, empty = false, emptyTitle = "No records yet", emptyDescription = "Records will appear here when they are available.", emptyAction }) {
  if (query.isPending) return <div role="status" aria-label="Loading records" className="space-y-3 p-6"><span className="sr-only">Loading records</span>{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;
  if (query.isError) return <div role="alert" className="portal-query-error space-y-3 rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-5"><p className="font-medium">Unable to load this information</p><p className="text-sm text-muted-foreground">{query.error?.message || "The request could not be completed."} Try again. If the problem continues, contact support.</p><Button variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw />{query.isFetching ? "Trying again…" : "Try again"}</Button></div>;
  if (empty) return <Empty className="py-12"><EmptyHeader><Inbox className="portal-empty-icon mx-auto mb-2 size-6" aria-hidden="true" /><EmptyTitle>{emptyTitle}</EmptyTitle><EmptyDescription>{emptyDescription}</EmptyDescription></EmptyHeader>{emptyAction}</Empty>;
  return children;
}

export function Field({ label, id, hint, children }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}{hint && <p className="text-xs text-muted-foreground" id={`${id}-hint`}>{hint}</p>}</div>;
}

export function FormError({ message }) {
  return <AnimatedCollapse open={Boolean(message)}><p role="alert" className="rounded-md border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] p-3 text-sm text-[var(--status-danger-text)]">{message}</p></AnimatedCollapse>;
}

export function Pager({ page, totalPages, total, onChange, disabled }) {
  return <div className="responsive-table-pager flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-xs text-muted-foreground"><span>{total} record{total === 1 ? "" : "s"}</span><nav aria-label="Table pagination" className="flex items-center gap-3"><span>Page {page} of {Math.max(1, totalPages)}</span><Button variant="outline" size="icon-sm" aria-label="Previous page" disabled={disabled || page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft /></Button><Button variant="outline" size="icon-sm" aria-label="Next page" disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)}><ChevronRight /></Button></nav></div>;
}

// Lists currently arrive unpaginated from the API; paginate and sort the complete result.
export function DataTable({ rows, columns, emptyTitle = "No matching records", emptyDescription = "Try another search or clear the filters.", emptyAction, pageSize = 10, caption, paginated = true, mobile, compact = false, className = "" }) {
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
  return <div data-tour="records" className={`responsive-data-table min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs ${className}`}>
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
        <TableHeader><TableRow className="bg-muted/50 hover:bg-muted/50">{columns.map((column) => <TableHead data-column={column.key} key={column.key} className={`${compact ? "py-2 px-3 text-xs font-semibold" : "py-3"} ${column.className || ""}`} aria-sort={column.sort ? sort?.key === column.key ? sort.direction === 1 ? "ascending" : "descending" : "none" : undefined}>
          {column.sort ? <button type="button" className="portal-table-sort" onClick={() => changeSort(column.key)}><span>{column.label}</span>{sort?.key === column.key ? sort.direction === 1 ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" /> : <ArrowUpDown aria-hidden="true" />}</button> : column.label}
        </TableHead>)}</TableRow></TableHeader>
        <TableBody>{visibleRows.map((row, index) => <TableRow key={row._id || row.id || row.rowNumber || index} className="hover:bg-muted/40 transition-colors">{columns.map((column) => <TableCell data-column={column.key} key={column.key} className={`${compact ? "py-2 px-3 text-xs" : "py-3.5"} ${column.className || ""}`}>{column.render(row)}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </div>
    {!rows.length && <Empty className="py-10"><EmptyHeader><Inbox className="portal-empty-icon mx-auto mb-2 size-6" aria-hidden="true" /><EmptyTitle>{emptyTitle}</EmptyTitle><EmptyDescription>{emptyDescription}</EmptyDescription></EmptyHeader>{emptyAction}</Empty>}
    {paginated && <Pager page={current} totalPages={pages} total={rows.length} onChange={setPage} />}
  </div>;
}
