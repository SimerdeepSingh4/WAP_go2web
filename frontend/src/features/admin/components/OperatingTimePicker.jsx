import { useState } from "react";
import WheelPicker from "@/components/ui/wheel-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
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

      {/* Clickable Time Input */}
      <button
        id={id}
        type="button"
        onClick={handleOpen}
        className={`flex w-full items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
          invalid
            ? "border-destructive bg-destructive/5 hover:border-destructive"
            : "border-border bg-background hover:bg-muted/40"
        }`}
      >
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatOperatingTime(value)}
        </span>
        <Clock className="size-4 text-muted-foreground" />
      </button>

      {/* Wheel Picker Modal Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[270px] p-4">
          <DialogHeader className="p-0">
            <DialogTitle className="text-sm font-semibold text-center">{label}</DialogTitle>
          </DialogHeader>

          <div className="flex justify-center py-2">
            <WheelPicker
              id={`${id}-modal-wheel`}
              label={label}
              columns={columns}
              value={timeToWheelValue(tempValue)}
              onValueChange={(selection) => setTempValue(wheelValueToTime(selection))}
              className="border-0 shadow-none bg-transparent px-0"
            />
          </div>

          <DialogFooter className="flex flex-row items-center justify-end gap-2 p-0 pt-2 border-t">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleConfirm}>
              Set Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
