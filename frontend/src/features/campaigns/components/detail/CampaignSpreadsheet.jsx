import RecipientNumberHighlight, { recipientMarkMap } from "./RecipientNumberHighlight";
import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, GripVertical, Plus, Redo2, Undo2, Sigma } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { columnLetter, createSheetEvaluator } from "@campaign-sheet";

const STATUSES = ["queued", "sent", "delivered", "read", "failed"];
const display = (value) => typeof value === "boolean" ? value ? "Yes" : "No" : String(value ?? "");

export default function CampaignSpreadsheet({ entries, columns, visibleRows, onChange, onColumnsChange, onRowsSelect, tabs, activeTab, scope, rate, revision, inputAudit }) {
  const numberMarks = useMemo(() => recipientMarkMap(inputAudit), [inputAudit]);
  const [pageState, setPageState] = useState({ scope, page: 0 });
  const [pageSize, setPageSize] = useState(100);
  const [sort, setSort] = useState(null);
  const [selection, setSelection] = useState(null);
  const [editing, setEditing] = useState(null);
  const [history, setHistory] = useState({ undo: [], redo: [], revision });
  const [columnDialog, setColumnDialog] = useState(null);
  const [columnLabel, setColumnLabel] = useState("");
  const [columnFormula, setColumnFormula] = useState("");
  const [showSummary, setShowSummary] = useState(false);
  const [draggingRow, setDraggingRow] = useState(null);
  const [draggingColumn, setDraggingColumn] = useState(null);
  const skipBlur = useRef(false);
  const gridRef = useRef(null);
  const evaluator = useMemo(() => createSheetEvaluator(entries, columns), [entries, columns]);
  const rowMap = useMemo(() => new Map(entries.map((entry) => [entry.rowNumber, entry])), [entries]);
  const ordered = useMemo(() => {
    if (!sort) return visibleRows;
    const col = columns.find((column) => column.id === sort.id);
    if (!col) return visibleRows;
    return [...visibleRows].sort((a, b) => String(evaluator.get(a, col)).localeCompare(String(evaluator.get(b, col)), undefined, { numeric: true }) * sort.direction);
  }, [visibleRows, sort, columns, evaluator]);
  const pages = Math.max(1, Math.ceil(ordered.length / pageSize));
  const page = Math.min(pages - 1, pageState.scope === scope ? pageState.page : 0);
  const pageRows = ordered.slice(page * pageSize, (page + 1) * pageSize);
  const selectedRow = selection && visibleRows.some((row) => row.rowNumber === selection.end.row) && rowMap.get(selection.end.row);
  const selectedColumn = selection && columns.find((col) => col.id === selection.end.col);
  const selectedRaw = selectedRow && selectedColumn ? evaluator.raw(selectedRow, selectedColumn) : "";
  const addresses = selectedColumn && selectedRow ? `${selectedColumn.letter}${selectedRow.rowNumber}` : "";
  const currentHistory = history.revision === revision ? history : { undo: [], redo: [], revision };

  const commit = (nextRows, nextColumns = columns) => {
    setHistory({ undo: [...currentHistory.undo.slice(-19), { entries, columns }], redo: [], revision });
    onChange(nextRows); onColumnsChange(nextColumns);
  };
  const undo = (redo = false) => {
    const source = redo ? currentHistory.redo : currentHistory.undo;
    if (!source.length) return;
    const snapshot = source[source.length - 1];
    setHistory({
      undo: redo ? [...currentHistory.undo, { entries, columns }] : source.slice(0, -1),
      redo: redo ? source.slice(0, -1) : [...currentHistory.redo, { entries, columns }], revision,
    });
    onChange(snapshot.entries); onColumnsChange(snapshot.columns);
  };
  const updateCell = (row, col, input) => {
    const value = String(input ?? "").slice(0, 2000);
    if (col.field === "custom") return { ...row, cells: { ...row.cells, [col.id]: value } };
    if (col.field === "phoneNumber") {
      const phoneNumber = value.replace(/\D/g, "");
      if (!phoneNumber) throw new Error("A phone number cannot be empty.");
      return { ...row, phoneNumber };
    }
    if (col.field === "status") {
      if (!STATUSES.includes(value.toLowerCase())) throw new Error("Choose queued, sent, delivered, read, or failed.");
      return { ...row, status: value.toLowerCase() };
    }
    if (col.field === "category") {
      const tab = tabs.find((item) => item.key !== "clean" && [item.key.toLowerCase(), item.label.toLowerCase()].includes(value.toLowerCase()));
      if (!tab) throw new Error("Create the category using the + button first.");
      return { ...row, category: tab.label, tabKey: tab.key, billingAction: tab.defaultBilling || "keep" };
    }
    if (col.field === "billingAction") {
      const action = /^(refund|refund credits)$/i.test(value) ? "refund" : /^(keep|deduct|keep charged|charged)$/i.test(value) ? "keep" : null;
      if (!action) throw new Error("Credit treatment must be keep or refund.");
      return { ...row, billingAction: action };
    }
    return { ...row, [col.field]: value };
  };
  const saveCell = (rowId, columnId, value) => {
    const row = rowMap.get(rowId), col = columns.find((column) => column.id === columnId);
    if (!row || !col || String(evaluator.raw(row, col)) === String(value)) return;
    try { const updated = updateCell(row, col, value); commit(entries.map((item) => item.rowNumber === rowId ? updated : item)); }
    catch (error) { toast.add({ title: error.message, type: "error" }); }
  };
  const choose = (row, col, extend = false) => {
    const position = { row: row.rowNumber, col: col.id };
    setSelection((previous) => ({ start: extend && previous && ordered.some((item) => item.rowNumber === previous.start.row) ? previous.start : position, end: position }));
  };
  const rectangle = () => {
    if (!selection) return null;
    const r1 = ordered.findIndex((row) => row.rowNumber === selection.start.row), r2 = ordered.findIndex((row) => row.rowNumber === selection.end.row);
    const c1 = columns.findIndex((col) => col.id === selection.start.col), c2 = columns.findIndex((col) => col.id === selection.end.col);
    if (Math.min(r1, r2, c1, c2) < 0) return null;
    return { r1: Math.min(r1, r2), r2: Math.max(r1, r2), c1: Math.min(c1, c2), c2: Math.max(c1, c2) };
  };
  const range = rectangle();
  const paste = (event) => {
    if (editing || !selectedRow || !selectedColumn) return;
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain").replace(/\r/g, "").replace(/\n$/, "");
    if (!text) return;
    const lines = text.split("\n").map((line) => line.split("\t"));
    const rowStart = ordered.findIndex((row) => row.rowNumber === selectedRow.rowNumber), colStart = columns.findIndex((col) => col.id === selectedColumn.id);
    if (rowStart < 0) return;
    const updates = new Map(), appended = [];
    let nextRow = entries.reduce((max, row) => Math.max(max, row.rowNumber), 0) + 1;
    const tab = tabs.find((item) => item.key === activeTab && item.key !== "clean") || tabs[0];
    try {
      lines.forEach((values, index) => {
        let row = ordered[rowStart + index];
        if (!row) {
          if (selectedColumn.field !== "phoneNumber") throw new Error("Paste new rows starting in the phone-number column.");
          row = { rowNumber: nextRow++, phoneNumber: "", status: "queued", tabKey: tab.key, category: tab.label, billingAction: tab.defaultBilling || "keep", notes: "", cells: {} };
        }
        for (const [offset, value] of values.entries()) if (columns[colStart + offset]) row = updateCell(row, columns[colStart + offset], value);
        if (rowMap.has(row.rowNumber)) updates.set(row.rowNumber, row); else appended.push(row);
      });
      commit([...entries.map((row) => updates.get(row.rowNumber) || row), ...appended]);
      toast.add({ title: `${lines.length} rows pasted`, type: "success" });
    } catch (error) { toast.add({ title: error.message, type: "error" }); }
  };
  const copy = (event, cut = false) => {
    if (editing || !range) return;
    event.preventDefault();
    const rows = ordered.slice(range.r1, range.r2 + 1), cols = columns.slice(range.c1, range.c2 + 1);
    event.clipboardData.setData("text/plain", rows.map((row) => cols.map((col) => String(evaluator.raw(row, col)).replace(/[\t\r\n]/g, " ")).join("\t")).join("\n"));
    if (cut) {
      if (cols.some((col) => col.field !== "custom" && col.field !== "notes")) {
        toast.add({ title: "Core recipient cells were copied. Move the whole row using its handle.", type: "info" }); return;
      }
      const ids = new Set(rows.map((row) => row.rowNumber));
      commit(entries.map((row) => ids.has(row.rowNumber) ? cols.reduce((next, col) => updateCell(next, col, ""), row) : row));
    }
  };
  const moveRow = (rowId, targetId) => {
    if (rowId === targetId) return;
    const row = rowMap.get(rowId);
    if (!row) return;
    const next = entries.filter((entry) => entry.rowNumber !== rowId);
    const target = next.findIndex((entry) => entry.rowNumber === targetId);
    next.splice(target < 0 ? next.length : target, 0, row);
    setSort(null); commit(next);
  };
  const moveSelection = (direction) => {
    if (!selectedRow) return;
    const index = ordered.findIndex((row) => row.rowNumber === selectedRow.rowNumber);
    const adjacent = ordered[index + direction];
    if (!adjacent) return;
    if (direction < 0) moveRow(selectedRow.rowNumber, adjacent.rowNumber);
    else moveRow(adjacent.rowNumber, selectedRow.rowNumber);
  };
  const keyboard = (event) => {
    if (editing || event.target.tagName === "INPUT" || event.target.tagName === "SELECT") return;
    if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); undo(event.key.toLowerCase() === "y" || event.shiftKey); return; }
    if (!selectedRow || !selectedColumn) return;
    if (["Enter", "F2"].includes(event.key) || (event.key.length === 1 && !event.ctrlKey && !event.metaKey)) {
      event.preventDefault(); skipBlur.current = false;
      setEditing({ row: selectedRow.rowNumber, col: selectedColumn.id, value: event.key.length === 1 ? event.key : String(selectedRaw) }); return;
    }
    const rowDelta = { ArrowUp: -1, ArrowDown: 1 }[event.key] || 0;
    const colDelta = { ArrowLeft: -1, ArrowRight: 1, Tab: event.shiftKey ? -1 : 1 }[event.key] || 0;
    if (!rowDelta && !colDelta) return;
    event.preventDefault();
    const rowIndex = Math.max(0, Math.min(ordered.length - 1, ordered.findIndex((row) => row.rowNumber === selectedRow.rowNumber) + rowDelta));
    const colIndex = Math.max(0, Math.min(columns.length - 1, columns.indexOf(selectedColumn) + colDelta));
    choose(ordered[rowIndex], columns[colIndex], event.shiftKey && event.key !== "Tab");
    setPageState({ scope, page: Math.floor(rowIndex / pageSize) });
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-cell="${ordered[rowIndex].rowNumber}-${columns[colIndex].id}"]`)?.focus());
  };
  const openColumn = (col = null) => { setColumnDialog(col || {}); setColumnLabel(col?.label || ""); setColumnFormula(col?.formula || ""); };
  const saveColumn = () => {
    if (!columnLabel.trim()) return;
    if (columnDialog.id) commit(entries, columns.map((col) => col.id === columnDialog.id ? { ...col, label: columnLabel.trim(), formula: columnFormula } : col));
    else {
      if (columns.length >= 40) return;
      let index = 0;
      while (columns.some((col) => col.letter === columnLetter(index))) index++;
      commit(entries, [...columns, { id: `col_${crypto.randomUUID().replace(/-/g, "")}`, label: columnLabel.trim(), letter: columnLetter(index), field: "custom", width: 190, formula: columnFormula }]);
    }
    setColumnDialog(null);
  };
  const stats = useMemo(() => {
    const delivered = entries.filter((row) => ["delivered", "read"].includes(row.status)).length;
    return { delivered, refund: entries.filter((row) => row.billingAction === "refund").length, percent: entries.length ? Math.round(delivered / entries.length * 100) : 0 };
  }, [entries]);

  return (
    <div className="min-w-0 bg-background">
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-3 py-2">
        <Button type="button" variant="ghost" size="icon-sm" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!currentHistory.undo.length} onClick={() => undo()}><Undo2 className="size-4" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" title="Redo (Ctrl+Y)" aria-label="Redo" disabled={!currentHistory.redo.length} onClick={() => undo(true)}><Redo2 className="size-4" /></Button>
        <span className="mx-1 h-5 border-l" />
        <Button type="button" variant="ghost" size="sm" onClick={() => openColumn()} disabled={columns.length >= 40}><Plus className="size-3.5" /> Add column</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setShowSummary(!showSummary)}><Sigma className="size-3.5" /> Summary</Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Move selected row up" title="Move whole row up" disabled={!selectedRow} onClick={() => moveSelection(-1)}><ArrowUp className="size-3.5" /></Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Move selected row down" title="Move whole row down" disabled={!selectedRow} onClick={() => moveSelection(1)}><ArrowDown className="size-3.5" /></Button>
        {sort && <Button type="button" variant="ghost" size="sm" onClick={() => setSort(null)}>Clear sort</Button>}
        <span className="ml-auto text-[11px] text-muted-foreground">All indexes stay fixed · Double-click to edit</span>
      </div>
      {showSummary && <div className="grid grid-cols-2 gap-3 border-b p-3 text-xs sm:grid-cols-4">
        {[["Recipients", entries.length], ["Delivered", stats.delivered], ["Delivery rate", `${stats.percent}%`], ["Refund entries", stats.refund]].map(([label, value]) => <div key={label} className="rounded-lg bg-muted/40 p-3"><p className="text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{value}</p></div>)}
      </div>}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="w-16 shrink-0 rounded border bg-muted/30 px-2 py-1 text-center font-mono text-xs">{addresses || "—"}</span>
        <span className="font-serif text-sm italic text-muted-foreground">fx</span>
        <Input key={`${addresses}:${selectedRaw}`} defaultValue={String(selectedRaw)} disabled={!addresses} placeholder="Select a cell · Custom columns support formulas" className="h-8 min-w-0 border-0 bg-transparent font-mono text-xs shadow-none" onBlur={(event) => selectedRow && saveCell(selectedRow.rowNumber, selectedColumn.id, event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
      </div>
      <p className="recipient-scroll-hint">Swipe sideways for more columns. Tap a cell to select it; edit its value in the field above.</p><div ref={gridRef} role="grid" aria-label="Campaign spreadsheet" aria-rowcount={ordered.length + 1} aria-colcount={columns.length + 1} className="recipient-table-scroll max-h-[480px] outline-none" tabIndex={0} onKeyDown={keyboard} onPaste={paste} onCopy={copy} onCut={(event) => copy(event, true)}>
        <table className="recipient-comparison w-max min-w-full table-fixed border-collapse text-xs">
          <thead className="sticky top-0 z-20 bg-muted"><tr role="row">
            <th role="columnheader" className="recipient-index sticky left-0 z-30 w-20 min-w-20 border-r border-b bg-muted px-2 py-2 text-center font-medium text-muted-foreground" title="Permanent index from All">All #</th>
            {columns.map((col) => <th key={col.id} role="columnheader" className={`${col.field === "phoneNumber" ? "recipient-phone " : ""}border-r border-b p-0 text-left font-medium`} style={{ width: col.width, minWidth: col.width }} draggable onDragStart={(event) => { setDraggingColumn(col.id); event.dataTransfer.setData("text/plain", col.id); }} onDragOver={(event) => { if (draggingColumn) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (!draggingColumn || draggingColumn === col.id) return; const moved = columns.find((item) => item.id === draggingColumn); const next = columns.filter((item) => item.id !== draggingColumn); next.splice(next.findIndex((item) => item.id === col.id), 0, moved); commit(entries, next); setDraggingColumn(null); }} onDragEnd={() => setDraggingColumn(null)}>
              <div className="flex items-center gap-2 px-2 py-1.5" onDoubleClick={() => openColumn(col)}>
                <span className="font-mono text-[10px] text-muted-foreground">{col.letter}</span>
                <button type="button" className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left" onClick={() => setSort({ id: col.id, direction: sort?.id === col.id ? -sort.direction : 1 })} title="Click to sort; double-click header to rename"><span className="truncate">{col.label}</span><ArrowUpDown className="size-3 shrink-0 text-muted-foreground" /></button>
                <input type="range" min="110" max="480" value={col.width} aria-label={`Resize ${col.label}`} className="w-8 cursor-col-resize accent-primary" onClick={(event) => event.stopPropagation()} onChange={(event) => onColumnsChange(columns.map((item) => item.id === col.id ? { ...item, width: Number(event.target.value) } : item))} />
              </div>
            </th>)}
          </tr></thead>
          <tbody>
            {pageRows.map((row, pageIndex) => {
              const rowIndex = page * pageSize + pageIndex;
              return <tr key={row.rowNumber} role="row" aria-rowindex={rowIndex + 2} onDragOver={(event) => { if (draggingRow) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (draggingRow) moveRow(draggingRow, row.rowNumber); setDraggingRow(null); }}>
                <th scope="row" role="rowheader" className="recipient-index sticky left-0 z-10 border-r border-b bg-muted/90 px-1 text-muted-foreground"><button type="button" draggable aria-label={`Move All row ${row.rowNumber}`} title="Drag to move; Shift-click to select several rows" className="flex h-9 w-full items-center justify-center gap-1 font-mono text-xs" onClick={(event) => {
                  const anchor = event.shiftKey && selection ? ordered.findIndex((item) => item.rowNumber === selection.start.row) : rowIndex;
                  choose(row, columns[0], event.shiftKey);
                  onRowsSelect?.(new Set(ordered.slice(Math.max(0, Math.min(anchor, rowIndex)), Math.max(anchor, rowIndex) + 1).map((item) => item.rowNumber)));
                }} onDragStart={(event) => { setDraggingRow(row.rowNumber); event.dataTransfer.setData("text/plain", String(row.rowNumber)); }} onDragEnd={() => setDraggingRow(null)}><GripVertical className="size-3" />{row.rowNumber}</button></th>
                {columns.map((col, colIndex) => {
                  const active = selection?.end.row === row.rowNumber && selection?.end.col === col.id;
                  const inRange = range && rowIndex >= range.r1 && rowIndex <= range.r2 && colIndex >= range.c1 && colIndex <= range.c2;
                  const isEditing = editing?.row === row.rowNumber && editing?.col === col.id;
                  const value = evaluator.get(row, col);
                  const finish = (input) => { if (!skipBlur.current) saveCell(row.rowNumber, col.id, input); setEditing(null); };
                  return <td data-input-risk={col.field === "phoneNumber" ? numberMarks.get(row.rowNumber) : undefined} key={col.id} role="gridcell" tabIndex={active ? 0 : -1} data-cell={`${row.rowNumber}-${col.id}`} aria-selected={Boolean(inRange)} className={`${col.field === "phoneNumber" ? "recipient-phone " : ""}relative h-9 max-w-0 border-r border-b p-0 outline-none ${active ? "z-[1] ring-2 ring-inset ring-primary" : ""} ${inRange ? "bg-primary/5" : "bg-background"}`} style={{ width: col.width, minWidth: col.width }} onClick={(event) => { if (!isEditing) { choose(row, col, event.shiftKey); event.currentTarget.focus(); } }} onDoubleClick={() => { choose(row, col); skipBlur.current = false; setEditing({ row: row.rowNumber, col: col.id, value: String(evaluator.raw(row, col)) }); }}>
                    {isEditing ? (["status", "category", "billingAction"].includes(col.field) ? <select autoFocus className="h-9 w-full bg-background px-2 outline-none" defaultValue={String(evaluator.raw(row, col))} onChange={(event) => { skipBlur.current = true; saveCell(row.rowNumber, col.id, event.target.value); setEditing(null); }} onBlur={() => setEditing(null)} onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }}>
                      {(col.field === "status" ? STATUSES : col.field === "billingAction" ? ["keep", "deduct", "refund"] : [...new Set([row.category, ...tabs.filter((tab) => tab.key !== "clean").map((tab) => tab.label)])]).map((item) => <option key={item} value={item}>{item}</option>)}
                    </select> : <input autoFocus className="h-9 w-full bg-background px-2 font-mono text-xs outline-none" defaultValue={editing.value} onFocus={(event) => event.target.select()} onBlur={(event) => finish(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { skipBlur.current = true; setEditing(null); } }} />) : <span className={`block truncate px-2 py-2 ${col.field === "phoneNumber" ? "font-mono" : ""} ${String(value).startsWith("#") ? "text-destructive" : col.field === "billingAction" && value === "refund" ? "text-rose-600" : ""}`} title={display(value)}>{col.field === "billingAction" ? value === "refund" ? "Refund credits" : "Keep charged" : display(value)}</span>}
                    {!isEditing && col.field === "phoneNumber" && numberMarks.has(row.rowNumber) && <div className="px-2 pb-1.5"><RecipientNumberHighlight mark={numberMarks.get(row.rowNumber)} /></div>}
                  </td>;
                })}
              </tr>;
            })}
            {!pageRows.length && <tr><td colSpan={columns.length + 1} className="p-10 text-center text-muted-foreground">No recipients in this view.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <span>{ordered.length ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, ordered.length)} of {ordered.length.toLocaleString()} rows · Addresses use the permanent All index</span>
        <div className="flex items-center gap-2"><select aria-label="Rows per page" value={pageSize} className="rounded border bg-background px-1 py-1" onChange={(event) => { setPageSize(Number(event.target.value)); setPageState({ scope, page: 0 }); }}>{[50, 100, 250].map((size) => <option key={size} value={size}>{size} / page</option>)}</select><Button type="button" variant="ghost" size="icon-sm" aria-label="Previous page" disabled={!page} onClick={() => setPageState({ scope, page: page - 1 })}><ChevronLeft className="size-4" /></Button><span>{page + 1} / {pages}</span><Button type="button" variant="ghost" size="icon-sm" aria-label="Next page" disabled={page + 1 === pages} onClick={() => setPageState({ scope, page: page + 1 })}><ChevronRight className="size-4" /></Button></div>
      </div>
      <Dialog open={Boolean(columnDialog)} onOpenChange={(open) => !open && setColumnDialog(null)}><DialogContent className="sm:max-w-[440px]"><DialogHeader><DialogTitle>{columnDialog?.id ? "Edit report column" : "Add report column"}</DialogTitle><DialogDescription>Every column appears in the published user or reseller report.</DialogDescription></DialogHeader>
        <label className="space-y-1.5 text-xs font-medium">Column name<Input value={columnLabel} onChange={(event) => setColumnLabel(event.target.value)} maxLength={80} placeholder="e.g. Agent notes" /></label>
        {(!columnDialog?.field || columnDialog.field === "custom") && <div className="space-y-3"><label className="block space-y-1.5 text-xs font-medium">Default formula (optional)<Input value={columnFormula} onChange={(event) => setColumnFormula(event.target.value)} className="font-mono text-xs" placeholder="=LEN(A{row})" maxLength={1000} /></label><div className="flex flex-wrap gap-1.5">{[["Duplicate?", "=COUNTIF(A:A,A{row})>1"], ["Number check", '=IF(AND(LEN(A{row})>=10,LEN(A{row})<=15),"OK","Check")'], ["Net credits", `=IF(D{row}="refund",0,${rate})`], ["Delivered total", '=COUNTIF(B:B,"delivered")']].map(([label, formula]) => <Button key={label} type="button" size="xs" variant="outline" onClick={() => { setColumnFormula(formula); if (!columnLabel) setColumnLabel(label); }}>{label}</Button>)}</div><p className="text-[11px] leading-relaxed text-muted-foreground">Use {"{row}"} for each recipient’s All index. Supported: SUM, COUNT, COUNTA, COUNTIF, SUMIF, IF, AND, OR, LEN, TRIM, SUBSTITUTE, ROUND. Report formulas never change wallet balances.</p></div>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setColumnDialog(null)}>Cancel</Button><Button type="button" onClick={saveColumn} disabled={!columnLabel.trim()}>Save column</Button></DialogFooter>
      </DialogContent></Dialog>
    </div>
  );
}
