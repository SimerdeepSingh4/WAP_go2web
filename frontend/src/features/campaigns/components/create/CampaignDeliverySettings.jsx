import { Calendar, Send } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ScheduleCalendarButton from "./ScheduleCalendarButton";

const options = [
  { value: "now", label: "Send now" },
  { value: "later", label: "Schedule" },
];

export default function CampaignDeliverySettings({
  scheduleType = "now", onScheduleTypeChange, scheduledTime, onScheduledTimeChange, scheduleValid,
}) {
  const Icon = scheduleType === "later" ? Calendar : Send;
  let hint = "Sent after admin approval.";
  if (scheduleType === "later") {
    hint = scheduleValid
      ? new Date(scheduledTime).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : "Choose a future date and time using the calendar.";
  }
  return <div id="create-timing" data-tour="create-timing" className="min-w-0 space-y-1.5">
        <Label htmlFor="campaign-delivery-timing" className="text-xs font-medium">Delivery timing</Label>
        <div className="flex items-center gap-2">
          <Select name="schedule" value={scheduleType} onValueChange={onScheduleTypeChange} items={options}>
            <SelectTrigger id="campaign-delivery-timing" className="h-10 min-w-0 flex-1 bg-card text-sm" aria-describedby="campaign-delivery-hint">
              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger={false}>
              {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {scheduleType === "later" && (
            <ScheduleCalendarButton value={scheduledTime} onApply={onScheduledTimeChange} />
          )}
        </div>
        <p id="campaign-delivery-hint" aria-live="polite" className="text-[11px] leading-5 text-muted-foreground">{hint}</p>
  </div>;
}

