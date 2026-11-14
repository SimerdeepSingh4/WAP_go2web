import { useState } from "react";
import { Activity, ShieldAlert } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function RecipientActivityButton({ activity }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  if (user?.role !== "Super Admin") return null;
  const suspicious = activity?.suspiciousOverwrite === true;
  const legacy = activity && activity.version !== 2;
  return <>
      <Button type="button" size="sm" variant={suspicious ? "destructive" : "outline"} className={suspicious ? "border-red-600 bg-red-600 text-white hover:bg-red-700 hover:text-white" : ""} onClick={() => setOpen(true)}>
        {suspicious ? <ShieldAlert aria-hidden="true" /> : <Activity aria-hidden="true" />}Check activity
        {suspicious && <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px]">Review needed</span>}
      </Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Recipient entry activity</DialogTitle>
        <DialogDescription>How audience numbers were entered when this campaign was submitted.</DialogDescription>
      </DialogHeader>
      {!activity ? <p className="text-sm text-muted-foreground">Activity was not recorded for this campaign.</p> : <>
        <div className={`rounded-lg border p-3.5 text-sm ${suspicious ? "border-red-200 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300" : "border-border bg-muted/30 text-foreground"}`}>
          <p className="font-semibold">{suspicious ? "List re-pasted over manual edits" : legacy ? "Earlier submission format" : "Normal submission activity"}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{suspicious ? "The recipient list was edited by hand and then pasted over with new text. Review the list below to ensure all intended numbers are present." : legacy ? "This campaign was submitted before detailed input tracking was added." : "Numbers were submitted normally with no conflicting edits or accidental overwrites."}</p>
        </div>
        <dl className="divide-y text-sm">{[
          ["Pasted from clipboard", activity.hasPasted ? "Yes" : "No"],
          ["Total times pasted", legacy ? "Not recorded" : activity.pasteCount],
          ["Hand-edited after pasting", legacy ? activity.modificationsDetected ? "Changes recorded" : "Not recorded" : activity.wasModifiedAfterPaste ? "Yes" : "No"],
          ["Overwrote hand-edits with new paste", legacy ? "Not recorded" : suspicious ? "Yes (Review needed)" : "No"],
          ["Manually typed contacts", (activity.numberFlags || []).filter(entry => entry[1] === 1).length],
          ["Manually edited contacts", (activity.numberFlags || []).filter(entry => entry[1] === 2).length],
        ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-3 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>
      </>}
      <div className="flex justify-end"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button></div>
    </DialogContent></Dialog>
  </>;
}
