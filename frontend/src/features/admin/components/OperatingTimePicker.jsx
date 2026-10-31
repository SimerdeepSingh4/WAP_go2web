import WheelPicker from "@/components/ui/wheel-picker";
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
  const columns = [
    { id: "hour", label: `${label}: hours`, options: hours, loop: true, className: "w-16" },
    { id: "minute", label: `${label}: minutes`, options: minutes, loop: true, className: "w-16" },
    { id: "period", label: `${label}: AM or PM`, options: [{ value: "am", label: "AM" }, { value: "pm", label: "PM" }], className: "w-16" },
  ];

  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="text-sm font-medium">{label}</legend>
      <WheelPicker id={id} label={`${label} in India Standard Time`} columns={columns}
        value={timeToWheelValue(value)} onValueChange={(selection) => onChange(wheelValueToTime(selection))}
        aria-describedby="operating-wheel-help operating-window-error" aria-invalid={invalid}
        className={invalid ? "rounded-lg border-destructive" : "rounded-lg"} />
      <p className="text-center text-sm font-medium tabular-nums" aria-live="polite" aria-atomic="true">
        {formatOperatingTime(value)}
      </p>
    </fieldset>
  );
}
