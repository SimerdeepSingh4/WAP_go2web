import { useId, useMemo, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { SectionCard } from "@/features/campaigns/components/create/CampaignDetailsSection";
import { FormError } from "@/features/dashboard/components/shared";
import { number } from "@/lib/format";
import {
  FILTERING_RESULT_CATEGORIES, LEGACY_FILTERING_CATEGORY, MAX_FILTERING_CATEGORIES, MAX_FILTERING_CATEGORY_LABEL,
  matchCategorizedFilteringResults, parseFilteringRows,
} from "../../../../../shared/numberFiltering.js";
import { useSaveFilteringResults } from "../hooks/useNumberFiltering";
import FilteringNumberActions from "./FilteringNumberActions";

const presetIds = new Set(FILTERING_RESULT_CATEGORIES.map(category => category.id));

function makeEditorCategories(request, submittedRows) {
  const saved = request.draftResults ?? request.publishedResults;
  if (saved) {
    const numbers = new Map(saved.categories.map(category => [category.id, []]));
    for (const row of saved.rows) numbers.get(row.category)?.push(row.phoneNumber);
    return saved.categories.map(category => ({ ...category, numbers: numbers.get(category.id).join("\n") }));
  }
  const oldNumbers = request.draftNumbers || request.publishedNumbers;
  if (oldNumbers) return [
    ...FILTERING_RESULT_CATEGORIES.map(category => ({ ...category, numbers: "" })),
    { ...LEGACY_FILTERING_CATEGORY, numbers: oldNumbers },
  ];

  const repeats = [];
  const seen = new Set();
  for (const row of submittedRows) {
    if (seen.has(row.phoneNumber)) repeats.push(row.phoneNumber);
    seen.add(row.phoneNumber);
  }
  return FILTERING_RESULT_CATEGORIES.map(category => ({
    ...category,
    numbers: category.id === "duplicates" ? repeats.join("\n") : "",
  }));
}

export default function FilteringResultEditor({ request, onCancel, onPublished }) {
  const idPrefix = useId();
  const [edit, setEdit] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const mutation = useSaveFilteringResults();
  const submittedRows = useMemo(() => parseFilteringRows(request.submittedNumbers || "").rows, [request.submittedNumbers]);
  const initial = useMemo(() => makeEditorCategories(request, submittedRows), [request, submittedRows]);
  const categories = edit?.categories ?? initial;
  const revision = edit?.revision ?? request.revision;
  const stale = revision !== request.revision;
  const preview = useMemo(() => matchCategorizedFilteringResults(categories, submittedRows), [categories, submittedRows]);
  const counts = useMemo(() => {
    const values = new Map();
    for (const row of preview.rows) values.set(row.category, (values.get(row.category) || 0) + 1);
    return values;
  }, [preview.rows]);
  const readOnly = mutation.isPending || stale;
  const canSave = !readOnly && !preview.error && !preview.invalidCount;
  const label = name.trim();
  const duplicateName = categories.some(category => category.label.toLowerCase() === label.toLowerCase());
  const canAdd = !readOnly && Boolean(label) && label.length <= MAX_FILTERING_CATEGORY_LABEL && !duplicateName && categories.length < MAX_FILTERING_CATEGORIES;

  function updateCategories(update) {
    setEdit(previous => ({
      revision: previous?.revision ?? request.revision,
      categories: update(previous?.categories ?? initial),
    }));
  }

  function addCategory(event) {
    event.preventDefault();
    if (!canAdd) return;
    const id = `category-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
    updateCategories(previous => [...previous, { id, label, numbers: "" }]);
    setAddOpen(false);
    setName("");
  }

  function save(mode) {
    if (readOnly || (mode !== "close" && !canSave)) return;
    mutation.mutate({ id: request.id, revision, mode, ...(mode === "close" ? {} : { categories }) }, {
      onSuccess: () => {
        setEdit(null);
        setConfirmation(null);
        if (mode === "publish" && onPublished) onPublished();
        toast.add({ title: { draft: "Draft saved", publish: request.publishedAt ? "Results updated" : "Results published", close: "Request closed" }[mode], type: "success" });
      },
    });
  }

  return (
    <section className="min-w-0 space-y-4" data-tour="number-filtering-results" aria-labelledby="filtering-result-editor-title">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="filtering-result-editor-title" className="text-base font-semibold">Result categories</h2>
          <p className="mt-1 text-xs text-muted-foreground">Paste one submitted number per line. All submitted rows count toward the credit charge.</p>
        </div>
        <Button type="button" variant="outline" disabled={readOnly || categories.length >= MAX_FILTERING_CATEGORIES} onClick={() => setAddOpen(true)}>
          <Plus aria-hidden="true" />Add category
        </Button>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {categories.map(category => {
          const fieldId = `${idPrefix}-${category.id}`;
          const errors = preview.issues.filter(issue => issue.categoryId === category.id);
          return (
            <SectionCard
              key={category.id}
              icon={Pencil}
              title={<><span className="wrap-anywhere">{category.label}</span><span className="rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{number(counts.get(category.id) || 0)}</span></>}
              aside={<div className="flex items-center gap-2">
                <FilteringNumberActions numbers={category.numbers} />
                {!presetIds.has(category.id) && !category.numbers.trim() && <Button
                  type="button" variant="ghost" size="icon-sm" disabled={readOnly}
                  aria-label={`Remove ${category.label}`}
                  onClick={() => updateCategories(previous => previous.filter(item => item.id !== category.id))}
                ><Trash2 aria-hidden="true" /></Button>}
              </div>}
            >
              <label className="text-xs font-medium" htmlFor={fieldId}>Phone numbers<span className="sr-only"> for {category.label}</span></label>
              <Textarea
                id={fieldId} rows={5} inputMode="numeric" spellCheck={false} readOnly={readOnly}
                className="mt-2 field-sizing-fixed h-32 min-h-24 resize-y bg-background font-mono text-xs leading-6"
                placeholder="Paste phone numbers, one per line"
                value={category.numbers}
                onChange={event => {
                  const numbers = event.target.value;
                  updateCategories(previous => previous.map(item => item.id === category.id ? { ...item, numbers } : item));
                }}
                aria-invalid={errors.length > 0} aria-describedby={errors.length ? `${fieldId}-errors` : undefined}
              />
              {errors.length > 0 && <ul id={`${fieldId}-errors`} className="mt-2 space-y-1 text-xs text-destructive">
                {errors.map(issue => <li key={issue.lineNumber}>Line {issue.lineNumber} · {issue.message}</li>)}
              </ul>}
            </SectionCard>
          );
        })}
      </div>
      {preview.error && <FormError message={preview.error} />}
      {stale && <div className="flex flex-wrap items-center gap-2">
        <FormError message="Another review changed this request. Load the latest draft before saving." />
        <Button type="button" variant="outline" onClick={() => { setEdit(null); mutation.reset(); }}>Load latest draft</Button>
      </div>}
      {mutation.isError && !confirmation && <FormError message={mutation.error.message} />}
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{number(preview.rows.length)} of {number(request.submittedRowCount)} rows categorized</p>
        <div className="flex flex-wrap items-center gap-2">
          {onCancel && <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>}
          <Button type="button" variant="outline" disabled={!canSave} onClick={() => save("draft")}>Save draft</Button>
          <Button type="button" disabled={!canSave} onClick={() => setConfirmation("publish")}>
            {request.publishedAt ? "Update results" : "Publish results"}
          </Button>
          {request.status !== "CLOSED" && <Button type="button" variant="ghost" disabled={readOnly} onClick={() => setConfirmation("close")}>Close request</Button>}
        </div>
      </footer>
      <Dialog open={addOpen} onOpenChange={open => { setAddOpen(open); if (!open) setName(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add result category</DialogTitle><DialogDescription>The category name appears in the published results.</DialogDescription></DialogHeader>
          <form className="space-y-4" onSubmit={addCategory}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor={`${idPrefix}-category-name`}>Category name</label>
              <Input id={`${idPrefix}-category-name`} value={name} onChange={event => setName(event.target.value)}
                maxLength={MAX_FILTERING_CATEGORY_LABEL} required aria-invalid={duplicateName || undefined} />
              {duplicateName && <FormError message="A category with this name already exists." />}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setAddOpen(false); setName(""); }}>Cancel</Button>
              <Button type="submit" disabled={!canAdd}>Add category</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(confirmation)} onOpenChange={open => {
        if (!open && !mutation.isPending) { setConfirmation(null); mutation.reset(); }
      }}>
        <DialogContent showCloseButton={!mutation.isPending}>
          <DialogHeader>
            <DialogTitle>{confirmation === "close" ? "Close this request?" : request.publishedAt ? "Update filtering results?" : "Publish filtering results?"}</DialogTitle>
            <DialogDescription>{confirmation === "close" ? "The requester can still open any published results."
              : `The requester will see ${number(preview.rows.length)} categorized numbers. Billing is based on all submitted rows.`}</DialogDescription>
          </DialogHeader>
          {mutation.isError && <FormError message={mutation.error.message} />}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => { setConfirmation(null); mutation.reset(); }}>Back</Button>
            <Button type="button" disabled={readOnly || (confirmation === "publish" && !canSave)} onClick={() => save(confirmation)}>
              {mutation.isPending ? "Saving…" : confirmation === "close" ? "Close request" : request.publishedAt ? "Update results" : "Publish results"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
