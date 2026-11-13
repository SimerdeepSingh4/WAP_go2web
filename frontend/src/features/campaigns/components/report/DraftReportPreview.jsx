import { useState } from "react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { number } from "@/lib/format";

export default function DraftReportPreview({ sheet, onClose }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil((sheet?.rows.length || 0) / 100));
  const current = Math.min(page, pages - 1);
  return <Dialog open={Boolean(sheet)} onOpenChange={(open) => { if (!open) { onClose(); setPage(0); } }}>
    <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[min(1100px,calc(100vw-2rem))]">
      <DialogHeader className="p-5 pr-12"><DialogTitle className="flex items-center gap-2"><Eye className="size-4 text-primary" /> Campaign owner preview</DialogTitle><DialogDescription className="text-xs">Review every column and calculated result before publishing. This draft is not visible to the owner yet.</DialogDescription></DialogHeader>
      {sheet?.notes && <div className="mx-5 mb-4 rounded-lg border border-border bg-muted/20 p-3"><p className="text-xs font-medium">Notes from the team</p><p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{sheet.notes}</p></div>}
      <p className="recipient-scroll-hint">Swipe sideways for more columns. Phone numbers stay in view.</p><div role="region" aria-label="Scrollable report preview" tabIndex={0} className="recipient-table-scroll max-h-[50vh] border-y border-border"><table className="recipient-comparison w-full border-collapse text-left text-xs"><thead className="sticky top-0 z-10 bg-muted"><tr><th className="recipient-index whitespace-nowrap px-4 py-3">All #</th>{sheet?.columns.map((column) => <th key={column.id} className={`${column.field === "phoneNumber" ? "recipient-phone " : ""}whitespace-nowrap px-4 py-3 font-medium`} style={{ minWidth: column.width }}>{column.label}</th>)}</tr></thead><tbody>{sheet?.rows.slice(current * 100, (current + 1) * 100).map((row) => <tr key={row.rowNumber} className="border-t border-border/70"><th className="recipient-index px-4 py-3 font-mono font-normal text-muted-foreground">{row.rowNumber}</th>{sheet.columns.map((column) => { const value = row.values[column.id]; return <td key={column.id} className={`${column.field === "phoneNumber" ? "recipient-phone " : ""}max-w-72 whitespace-pre-wrap break-words px-4 py-3`}>{column.field === "billingAction" ? value === "refund" ? "Refund credits" : "Keep charged" : typeof value === "boolean" ? value ? "Yes" : "No" : String(value ?? "")}</td>; })}</tr>)}</tbody></table></div>
      <div className="flex items-center justify-between gap-3 px-5 py-3 text-xs text-muted-foreground"><span>{number(sheet?.rows.length || 0)} recipients · Original All indexes</span><div className="flex items-center gap-2"><Button variant="ghost" size="icon-sm" aria-label="Previous preview page" disabled={!current} onClick={() => setPage(current - 1)}><ChevronLeft className="size-4" /></Button>{current + 1} / {pages}<Button variant="ghost" size="icon-sm" aria-label="Next preview page" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}><ChevronRight className="size-4" /></Button></div></div>
      <DialogFooter className="m-0 rounded-none px-5 py-3"><Button variant="outline" onClick={() => { onClose(); setPage(0); }}>Back to editing</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
