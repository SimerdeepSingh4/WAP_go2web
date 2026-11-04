import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import WheelPicker from "@/components/ui/wheel-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const pad = (value) => String(value).padStart(2, "0");
const datePart = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const TIME_COLUMNS = [
  { id: "hour", label: "Hour", loop: true, className: "w-16",
    options: Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: pad(hour) })) },
  { id: "minute", label: "Minute", loop: true, className: "w-16",
    options: Array.from({ length: 60 }, (_, minute) => ({ value: String(minute), label: pad(minute) })) },
];

export default function ScheduleDateTimePicker({ value, onChange, invalid }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState(() => new Date(Math.ceil((Date.now() + 5 * 60_000) / 60_000) * 60_000));
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [open]);
  const selected = value ? new Date(value) : null;
  const validSelected = selected && Number.isFinite(selected.getTime());
  const future = draft.getTime() > now;
  const summary = draft.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

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
          setDraft(validSelected ? new Date(selected) : new Date(Math.ceil((currentTime + 5 * 60_000) / 60_000) * 60_000));
          setOpen(true);
        }}
        className="h-auto min-h-12 w-full justify-start gap-3 px-3 py-2.5 text-left"
      >
        <CalendarDays className="size-4 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{validSelected ? selected.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Choose date and time"}</span>
          <span className="block text-xs font-normal text-muted-foreground">{validSelected ? selected.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : "Select a day, then scroll to set the time"}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Button>
      <DialogContent className="gap-3 sm:max-w-[340px]">
        <DialogHeader className="pr-7">
          <DialogTitle>Schedule campaign</DialogTitle>
          <DialogDescription>Choose a date and time in your local timezone.</DialogDescription>
        </DialogHeader>
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
          className="mx-auto rounded-lg [--cell-size:--spacing(8)]"
          classNames={{ month: "flex w-full flex-col gap-2", week: "mt-1 flex w-full" }}
        />
        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-medium"><Clock className="size-3.5 text-muted-foreground" /> Time</span>
            <span className="text-muted-foreground">24-hour format</span>
          </div>
          <div className="mx-auto w-fit">
            <div aria-hidden="true" className="mb-1 flex justify-center gap-4 px-4 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span className="w-16">Hour</span>
              <span className="w-16">Minute</span>
            </div>
            <WheelPicker
              label="Campaign time, 24-hour format"
              columns={TIME_COLUMNS}
              value={{ hour: String(draft.getHours()), minute: String(draft.getMinutes()) }}
              onValueChange={({ hour, minute }) => setDraft((previous) => {
                const date = new Date(previous);
                date.setHours(Number(hour), Number(minute), 0, 0);
                return date;
              })}
              className="h-28 items-center gap-4 overflow-hidden rounded-xl border-border/70 bg-muted/20 px-4"
            />
          </div>
          <p className={`text-center text-xs ${future ? "text-muted-foreground" : "text-destructive"}`} aria-live="polite">
            {future ? summary : "Choose a time in the future."}
          </p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" disabled={!future} onClick={() => {
            if (draft.getTime() <= Date.now()) return;
            onChange(`${datePart(draft)}T${pad(draft.getHours())}:${pad(draft.getMinutes())}`);
            setOpen(false);
          }}>Set schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
