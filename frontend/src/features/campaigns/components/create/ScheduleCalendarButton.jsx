import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";

const pad = value => String(value).padStart(2, "0");
const localDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const localTime = date => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

export default function ScheduleCalendarButton({ value, onApply }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(null);
  const [time, setTime] = useState("");
  const [error, setError] = useState("");
  const selection = day && time ? `${localDay(day)}T${time}` : "";

  function toggle(nextOpen) {
    if (nextOpen) {
      const saved = new Date(value);
      const now = new Date();
      const initial = saved > now ? saved : new Date(now.getTime() + 5 * 60_000);
      setDay(initial);
      setTime(localTime(initial));
      setError("");
    }
    setOpen(nextOpen);
  }

  function apply() {
    const date = new Date(selection);
    if (!(date > new Date()) || localTime(date) !== time) {
      setError("Choose a valid future date and time.");
      return;
    }
    onApply(selection);
    setOpen(false);
  }

  return (
    <Popover.Root open={open} onOpenChange={toggle}>
      <Popover.Trigger render={<Button type="button" variant="outline" size="icon" className="size-[42px] shrink-0 text-primary-text" />}
        aria-label="Open scheduling calendar" title="Open scheduling calendar">
        <CalendarDays aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={6} collisionPadding={10} className="z-50">
          <Popover.Popup className="w-80 max-w-[calc(100vw-20px)] max-h-[var(--available-height)] overflow-y-auto rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg">
            <Popover.Title className="mb-3 text-sm font-semibold">Schedule campaign</Popover.Title>
            <Calendar className="w-full bg-transparent p-0" mode="single" required selected={day ?? undefined}
              defaultMonth={day ?? undefined} disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
              onSelect={date => { if (date) setDay(date); setError(""); }} />
            <div className="mt-4 flex items-center justify-between gap-3 border-t pt-3">
              <label htmlFor="schedule-calendar-time" className="text-sm font-medium">Send time</label>
              <Input id="schedule-calendar-time" type="time" step={60} className="h-10 w-32 tabular-nums" value={time}
                onChange={event => { setTime(event.target.value); setError(""); }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{Intl.DateTimeFormat().resolvedOptions().timeZone.replace("Asia/Calcutta", "Asia/Kolkata")}</p>
            {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Popover.Close render={<Button type="button" variant="ghost" size="sm" />}>Cancel</Popover.Close>
              <Button type="button" size="sm" disabled={!selection} onClick={apply}>Apply schedule</Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
