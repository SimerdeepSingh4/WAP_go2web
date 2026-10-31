import { useState } from "react";
import WheelPicker from "@/components/ui/wheel-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, Pencil, Check } from "lucide-react";
import { formatOperatingTime, timeToWheelValue, wheelValueToTime } from "../lib/operatingTime";

const hours = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0");
  return { value, label: value };
});
const minutes = Array.from({ length: 60 }, (_, index) => {
  const value = String(index).padStart(2, "0");
  return { value, label: value };
});

export default function OperatingTimePicker({ id, label, value, onChange, invalid = false }) {
  const [open, setOpen] = useState(false);
  const [tempValue, setTempValue] = useState(value);

  const handleOpen = () => {
    setTempValue(value);
    setOpen(true);
  };

  const handleConfirm = () => {
    onChange(tempValue);
    setOpen(false);
  };

  const columns = [
    { id: "hour", label: `${label}: hours`, options: hours, loop: true, className: "w-16" },
    { id: "minute", label: `${label}: minutes`, options: minutes, loop: true, className: "w-16" },
    { id: "period", label: `${label}: AM or PM`, options: [{ value: "am", label: "AM" }, { value: "pm", label: "PM" }], className: "w-16" },
  ];

  return (
    <div className="space-y-1.5 min-w-0">
      <label htmlFor={id} className="text-xs font-semibold text-foreground">
        {label}
      </label>

      {/* Clickable Card Trigger showing current time */}
      <button
        id={id}
        type="button"
        onClick={handleOpen}
        className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3.5 text-left transition-all cursor-pointer ${
          invalid
            ? "border-destructive bg-destructive/5 hover:border-destructive"
            : "border-border bg-card hover:border-primary/50 hover:bg-muted/30"
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Clock className="size-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold tabular-nums text-foreground tracking-tight">
              {formatOperatingTime(value)}
            </p>
            <p className="text-[11px] text-muted-foreground truncate">India Standard Time (IST)</p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground shrink-0 hover:text-foreground">
          <Pencil className="size-3" />
          Change Time
        </span>
      </button>

      {/* Wheel Picker Modal Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xs p-5">
          <DialogHeader className="text-center sm:text-center pb-1">
            <DialogTitle className="text-base">Set {label}</DialogTitle>
            <DialogDescription className="text-xs">
              Spin the wheels to choose the hour, minute, and AM/PM.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center justify-center py-2">
            <WheelPicker
              id={`${id}-modal-wheel`}
              label={`${label} time picker`}
              columns={columns}
              value={timeToWheelValue(tempValue)}
              onValueChange={(selection) => setTempValue(wheelValueToTime(selection))}
              className="rounded-lg border bg-muted/20"
            />

            <p className="mt-3.5 text-xl font-bold tabular-nums tracking-tight text-primary">
              {formatOperatingTime(tempValue)}
            </p>
          </div>

          <DialogFooter className="flex flex-row items-center justify-end gap-2 pt-3 border-t -mx-5 -mb-5 p-4 bg-muted/30">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleConfirm} className="gap-1.5">
              <Check className="size-3.5" />
              Set Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
