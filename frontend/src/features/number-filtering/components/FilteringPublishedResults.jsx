import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, FilterSelect, SearchBox } from "@/features/dashboard/components/shared";
import { number } from "@/lib/format";
import { FILTERING_RESULT_CATEGORIES, LEGACY_FILTERING_CATEGORY, parseFilteringRows } from "../../../../../shared/numberFiltering.js";
import FilteringNumberActions from "./FilteringNumberActions";

const tones = { valid: "success", duplicates: "info", wrong: "danger", "not-on-whatsapp": "warning" };
const mobileLayout = { primary: "phoneNumber", featured: ["category"] };

export default function FilteringPublishedResults({ request, onEdit }) {
  const heading = useRef(null);
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === "#published-results") {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start" });
    }
  }, [hash]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const result = useMemo(() => {
    if (request.publishedResults) return request.publishedResults;
    const rows = parseFilteringRows(request.publishedNumbers || "").rows;
    return {
      categories: [...FILTERING_RESULT_CATEGORIES, ...(rows.length ? [LEGACY_FILTERING_CATEGORY] : [])],
      rows: rows.map(row => ({ ...row, category: LEGACY_FILTERING_CATEGORY.id })),
    };
  }, [request.publishedResults, request.publishedNumbers]);
  const summary = useMemo(() => {
    const counts = new Map();
    for (const row of result.rows) counts.set(row.category, (counts.get(row.category) || 0) + 1);
    return result.categories.map(item => ({ ...item, count: counts.get(item.id) || 0 }));
  }, [result]);
  const labels = new Map(summary.map(item => [item.id, item.label]));
  const activeCategory = labels.has(category) ? category : "all";
  const keyword = search.trim();
  const rows = useMemo(() => result.rows.filter(row =>
    (activeCategory === "all" || row.category === activeCategory) && (!keyword || row.phoneNumber.includes(keyword))
  ), [result.rows, activeCategory, keyword]);
  const numbers = useMemo(() => rows.map(row => row.phoneNumber).join("\n"), [rows]);
  const unclassified = Math.max(0, request.submittedRowCount - result.rows.length);
  const columns = [
    { key: "rowNumber", label: "Submitted row", render: row => <span className="tabular-nums">{number(row.rowNumber)}</span> },
    { key: "phoneNumber", label: "Phone number", render: row => <span className="font-mono">{row.phoneNumber}</span> },
    { key: "category", label: "Result category", render: row => (
      <Badge variant="outline" className="portal-status h-auto whitespace-normal" data-tone={tones[row.category] || "neutral"}>
        {labels.get(row.category) || "Returned numbers"}
      </Badge>
    ) },
  ];

  return (
    <section className="filtering-result-view min-w-0 space-y-4" aria-labelledby="published-results">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="published-results" ref={heading} tabIndex={-1} className="scroll-mt-20 text-base font-semibold">Published results</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {number(result.rows.length)} of {number(request.submittedRowCount)} submitted rows categorized
            {unclassified > 0 && <> · {number(unclassified)} without a category</>}
          </p>
        </div>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit} className="h-8 gap-1.5 text-xs">
            <Pencil className="size-3.5" />
            Edit results
          </Button>
        )}
      </header>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
        {summary.map(item => (
          <button key={item.id} type="button" aria-pressed={activeCategory === item.id}
            className="grid min-w-0 gap-1 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:bg-muted aria-pressed:border-ring aria-pressed:bg-accent"
            onClick={() => setCategory(item.id)}>
            <span className="wrap-anywhere text-xs font-medium text-muted-foreground">{item.label}</span>
            <span className="text-xl font-semibold tabular-nums">{number(item.count)}</span>
          </button>
        ))}
      </div>
      <div className="filtering-history">
        <div className="filtering-history-toolbar">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <FilterSelect label="Filter by result category" value={activeCategory} onChange={setCategory}
              options={[{ value: "all", label: "All categories" }, ...summary.map(item => ({ value: item.id, label: item.label }))]} />
            <SearchBox label="Search phone numbers" value={search} onChange={setSearch} />
          </div>
          <FilteringNumberActions numbers={numbers} fileName={`filtering-${request.id}-results.txt`} />
        </div>
        <DataTable
          key={`${activeCategory}:${keyword}`}
          caption="Published filtering results"
          rows={rows}
          columns={columns}
          mobile={mobileLayout}
          pageSize={25}
          emptyTitle={result.rows.length ? "No matching results" : "No categorized numbers"}
          emptyDescription={result.rows.length ? "Try a different category or phone number." : "This publication contains no categorized rows."}
        />
      </div>
    </section>
  );
}
