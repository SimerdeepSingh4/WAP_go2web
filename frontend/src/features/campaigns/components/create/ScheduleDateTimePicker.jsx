import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import "./campaign-dialogs.css";

const pad = (value) => String(value).padStart(2, "0");
const datePart = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export default function ScheduleDateTimePicker({ value, onChange, invalid }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState(() => new Date(Math.ceil((Date.now() + 5 * 60_000) / 60_000) * 60_000));
  const [timeValid, setTimeValid] = useState(true);
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [open]);
  const selected = value ? new Date(value) : null;
  const validSelected = selected && Number.isFinite(selected.getTime());
  const future = timeValid && draft.getTime() > now;
  const summary = draft.toLocaleString("en-IN", { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone.replace("Asia/Calcutta", "Asia/Kolkata");
  const offset = -draft.getTimezoneOffset();
  const timezoneLabel = `${timezone} (UTC${offset >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)})`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        id="scheduledTime"
        type="button"
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        onClick={() => {
          const currentTime = new Date().getTime();
          setNow(currentTime);
          setTimeValid(true);
          setDraft(validSelected ? new Date(selected) : new Date(Math.ceil((currentTime + 5 * 60_000) / 60_000) * 60_000));
          setOpen(true);
        }}
        className="h-auto min-h-12 w-full justify-start gap-3 px-3 py-2.5 text-left"
      >
        <CalendarDays className="size-4 text-primary-text" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{validSelected ? selected.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Choose date and time"}</span>
          <span className="block text-xs font-normal text-muted-foreground">{validSelected ? selected.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : "Select a day and set the send time"}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Button>
      <DialogContent className="campaign-schedule-dialog">
        <DialogHeader className="campaign-dialog-header">
          <span className="campaign-dialog-icon" aria-hidden="true"><CalendarDays /></span>
          <div><DialogTitle>Schedule campaign</DialogTitle>
          <DialogDescription>Choose when to send your campaign.</DialogDescription></div>
        </DialogHeader>
        <div className="campaign-schedule-layout">
        <div className="campaign-schedule-date-section">
        <Calendar
          mode="single"
          required
          selected={draft}
          defaultMonth={draft}
          disabled={{ before: new Date(new Date(now).setHours(0, 0, 0, 0)) }}
          onSelect={(day) => {
            if (!day) return;
            const date = new Date(day);
            date.setHours(draft.getHours(), draft.getMinutes(), 0, 0);
            setDraft(date);
          }}
          className="campaign-schedule-calendar"
          classNames={{ month: "flex w-full flex-col gap-2", week: "mt-1 flex w-full" }}
        />
        </div>
        <div className="campaign-schedule-time-section">
          <div className="campaign-schedule-field">
            <label htmlFor="campaign-send-time">Send time</label>
            <Input id="campaign-send-time" type="time" lang="en-GB" step={60} required aria-describedby="campaign-send-time-hint" aria-invalid={!timeValid || undefined} value={timeValid ? `${pad(draft.getHours())}:${pad(draft.getMinutes())}` : ""} onChange={(event) => {
              const value = event.target.value;
              if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) { setTimeValid(false); return; }
              const [hour, minute] = value.split(":").map(Number);
              setTimeValid(true);
              setDraft((previous) => { const date = new Date(previous); date.setHours(hour, minute, 0, 0); return date; });
            }} />
            <p id="campaign-send-time-hint">24-hour format</p>
          </div>
          <div className="campaign-schedule-field">
            <span id="campaign-timezone-label">Time zone</span>
            <div className="campaign-schedule-timezone" aria-labelledby="campaign-timezone-label"><span>{timezoneLabel}</span><Globe2 aria-hidden="true" /></div>
            <p>Your local timezone</p>
          </div>
        </div>
        </div>
        <DialogFooter className="campaign-dialog-footer campaign-schedule-footer">
          <p className={`campaign-schedule-summary ${future ? "" : "campaign-schedule-summary-invalid"}`} aria-live="polite">
            <CalendarDays aria-hidden="true" />{future ? summary : timeValid ? "Choose a time in the future." : "Enter a valid send time."}
          </p>
          <div className="campaign-schedule-footer-actions">
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" disabled={!future} onClick={() => {
            if (!timeValid || draft.getTime() <= Date.now()) return;
            onChange(`${datePart(draft)}T${pad(draft.getHours())}:${pad(draft.getMinutes())}`);
            setOpen(false);
          }}>Schedule campaign</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
