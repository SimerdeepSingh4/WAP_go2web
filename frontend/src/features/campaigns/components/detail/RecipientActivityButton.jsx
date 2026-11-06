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
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-md"><DialogHeader><DialogTitle>Recipient input activity</DialogTitle><DialogDescription>Activity captured when this campaign was submitted.</DialogDescription></DialogHeader>
      {!activity ? <p className="text-sm text-muted-foreground">Activity was not recorded for this campaign.</p> : <>
        <div className={`rounded-lg border p-3 text-sm ${suspicious ? "border-red-200 bg-red-50 text-red-800" : "border-border bg-muted/30 text-foreground"}`}>
          <p className="font-semibold">{suspicious ? "Possible overwrite after editing" : legacy ? "Earlier activity format" : "No suspicious overwrite recorded"}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{suspicious ? "The recipient list was manually changed after a paste, then pasted again. Review this activity; it does not prove intent." : legacy ? "This campaign predates the lightweight tripwire. Some activity flags are unavailable." : "Review the details below for paste and editing activity."}</p>
        </div>
        <dl className="divide-y text-sm">{[
          ["Paste detected", activity.hasPasted ? "Yes" : "No"],
          ["Paste count", legacy ? "Not recorded" : activity.pasteCount],
          ["Manually modified after paste", legacy ? activity.modificationsDetected ? "Changes recorded" : "Not recorded" : activity.wasModifiedAfterPaste ? "Yes" : "No"],
          ["Suspicious overwrite", legacy ? "Not recorded" : suspicious ? "Yes" : "No"],
          ["Final text length", legacy ? "Not recorded" : `${activity.finalTextLength} characters`],
          ["Manual numbers highlighted", (activity.numberFlags || []).filter(entry => entry[1] === 1).length],
          ["Edited numbers highlighted", (activity.numberFlags || []).filter(entry => entry[1] === 2).length],
        ].map(([label, value]) => <div key={label} className="flex flex-wrap justify-between gap-3 py-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl>
      </>}
      <div className="flex justify-end"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Close</Button></div>
    </DialogContent></Dialog>
  </>;
}
