import { Calendar, Send } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ScheduleDateTimePicker from "./ScheduleDateTimePicker";

const options = [
  { value: "now", label: "Send now" },
  { value: "later", label: "Schedule" },
];

export default function CampaignDeliverySettings({
  scheduleType = "now", onScheduleTypeChange, scheduledTime, onScheduledTimeChange, scheduleValid,
}) {
  const Icon = scheduleType === "later" ? Calendar : Send;
  return <div id="create-timing" data-tour="create-timing" className="col-span-1 sm:col-span-2 min-w-0">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
      <div className="min-w-0 space-y-1.5">
        <Label htmlFor="campaign-delivery-timing" className="text-xs font-medium">Delivery timing</Label>
        <Select name="schedule" value={scheduleType} onValueChange={onScheduleTypeChange} items={options}>
          <SelectTrigger id="campaign-delivery-timing" className="min-h-12 h-12 w-full bg-card text-sm" aria-describedby="campaign-delivery-hint">
            <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p id="campaign-delivery-hint" className="text-[11px] leading-5 text-muted-foreground">
          {scheduleType === "now" ? "Sent after admin approval." : "Choose a future date and time for delivery."}
        </p>
      </div>
      {scheduleType === "later" && (
        <div className="min-w-0 space-y-1.5 animate-in fade-in-50 duration-200">
          <Label htmlFor="scheduledTime" className="text-xs font-medium">Date and time <span className="text-destructive">*</span></Label>
          <ScheduleDateTimePicker value={scheduledTime} onChange={onScheduledTimeChange} invalid={Boolean(scheduledTime && !scheduleValid)} />
          {scheduledTime && !scheduleValid
            ? <p className="text-[11px] text-destructive">Pick a time in the future.</p>
            : <p className="text-[11px] leading-5 text-muted-foreground">Starts in the next available campaign window after your selected time.</p>}
        </div>
      )}
    </div>
  </div>;
}

