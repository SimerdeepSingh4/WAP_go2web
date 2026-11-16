import { useRef } from "react";
import { ArrowRight, CalendarClock, ChevronDown, ClipboardList, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { dateTime } from "@/lib/format";
import { actionLabel, affectedRecord, basicActivityDetails, changedFields, fieldLabel, valueText } from "../lib/auditFormat";
import "./audit-event-detail.css";

function Changes({ event }) {
  const fields = changedFields(event);
  const created = event.action?.endsWith(".created"), deleted = event.action?.endsWith(".deleted");
  if (!fields.length) return <p className="audit-detail-empty">{event.action === "request.started" ? "Someone started an activity. This entry alone does not confirm whether it finished." : event.action === "request.finished" ? event.data?.outcome === "success" ? "The activity finished successfully." : "A response was recorded. See technical details for the result." : "No field-by-field changes were recorded for this activity."}</p>;
  return <section className="audit-detail-changes" aria-label="Changes made">
    <div className="audit-detail-section-heading"><h3>{created ? "Details added" : deleted ? "Details removed" : "What changed"}</h3><span>{fields.length} {fields.length === 1 ? "field" : "fields"}</span></div>
    <dl className="audit-change-list">{fields.map(key => <div key={key} className="audit-change-row" data-comparison={!created && !deleted || undefined}>
      <dt>{fieldLabel(key)}</dt>
      <dd>{created || deleted ? <div className="audit-change-value">{valueText((deleted ? event.data?.before : event.data?.after)?.[key], key)}</div> : <div className="audit-change-comparison">
        <div><span className="audit-change-value-label">Previous</span><div className="audit-change-value" data-previous>{valueText(event.data?.before?.[key], key)}</div></div>
        <ArrowRight aria-hidden="true" className="audit-change-arrow" />
        <div><span className="audit-change-value-label">New</span><div className="audit-change-value" data-new>{valueText(event.data?.after?.[key], key)}</div></div>
      </div>}</dd>
    </div>)}</dl>
  </section>;
}

export default function AuditEventDetail({ event, verification, historyRequested, onCheckHistory, onClose }) {
  const dialogRef = useRef(null);
  const details = basicActivityDetails(event);
  const context = details.find(([label]) => label === "Campaign") || ["Account or record", affectedRecord(event)];
  const credits = details.find(([label]) => label === "Credits")?.[1];
  const description = details.find(([label]) => label === "Description")?.[1];
  const actorName = event.actor?.name || event.actor?.role || "System";
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent ref={dialogRef} initialFocus={dialogRef} className="audit-detail-dialog">
      <DialogHeader className="audit-detail-header">
        <span className="audit-detail-icon"><ClipboardList aria-hidden="true" /></span>
        <div><p className="audit-detail-eyebrow">Activity details</p><DialogTitle>{actionLabel(event)}</DialogTitle><DialogDescription className="sr-only">Recorded activity, changes, and audit history.</DialogDescription></div>
      </DialogHeader>

      <div className="audit-detail-body">
        <dl className="audit-detail-summary">
          <div><dt><UserRound aria-hidden="true" />Performed by</dt><dd>{actorName}</dd>{event.actor?.role && <span className="audit-detail-role">{event.actor.role === "System" ? "Automatic activity" : event.actor.role}</span>}{(event.actor?.impersonation || event.actor?.preview) && <span className="audit-detail-access">{event.actor.preview ? "Preview session" : "Account access session"}</span>}</div>
          <div><dt><CalendarClock aria-hidden="true" />Recorded at</dt><dd className="audit-detail-date">{dateTime(event.occurredAt)} <span>IST</span></dd></div>
          <div className="audit-detail-context"><dt>{context[0]}</dt><dd>{context[1]}</dd></div>
          {credits !== undefined && <div className="audit-detail-amount"><dt>Credits</dt><dd>{credits}{!String(credits).includes("credits") && <small> credits</small>}</dd></div>}
        </dl>
        {description && <p className="audit-detail-description">{description}</p>}

        <Changes event={event} />

        <details className="audit-detail-technical">
          <summary><span>Technical details &amp; history</span><ChevronDown aria-hidden="true" /></summary>
          <div className="audit-detail-technical-body">
            <dl>{[["Record reference", event.stream], ["Network address (IP)", event.request?.ip || "Not recorded"], ["Request reference", event.request?.id || "Not recorded"], ["Browser or device", event.request?.userAgent || "Not recorded"], ["Original administrator", event.actor?.originalAdmin || "Not applicable"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{valueText(value)}</dd></div>)}</dl>
            <details className="audit-detail-source"><summary>Original recorded data</summary><pre>{JSON.stringify(event.data || {}, null, 2)}</pre></details>
            <div className="audit-detail-verification"><p>Check this record’s saved history for missing or altered entries.</p><Button type="button" variant="outline" size="sm" disabled={verification.isFetching} onClick={onCheckHistory}><ShieldCheck />{verification.isFetching ? "Checking history…" : "Check history"}</Button>{historyRequested && <p role="status" data-invalid={verification.data?.valid === false || undefined}>{verification.isFetching ? "Checking saved entries…" : verification.isError ? "The check could not finish. Please try again." : verification.data?.valid ? "Check passed. No missing or changed entries were found." : verification.data ? "This history needs an administrator’s review. Some entries may be missing or changed." : ""}</p>}</div>
          </div>
        </details>
      </div>

      <footer className="audit-detail-footer"><ShieldCheck aria-hidden="true" />Read-only audit record</footer>
    </DialogContent>
  </Dialog>;
}
