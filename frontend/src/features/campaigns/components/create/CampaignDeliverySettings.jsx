import { Clock, Send, Calendar } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import ScheduleDateTimePicker from "./ScheduleDateTimePicker";
import { AnimatedCollapse } from "@/components/ui/animated-collapse";

export default function CampaignDeliverySettings({
  scheduleType,
  onScheduleTypeChange,
  scheduledTime,
  onScheduledTimeChange,
  scheduleValid,
}) {
  return (
    <Card id="create-timing" data-tour="create-timing" className="campaign-form-section gap-0 rounded-xl border border-border py-0 shadow-none ring-0">
      <CardHeader className="border-b border-border px-4 py-3 sm:px-5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Clock className="size-3.5 text-muted-foreground" />
          Delivery timing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div role="radiogroup" aria-label="Delivery timing" className="grid grid-cols-2 gap-2.5">
          {[
            { key: "now", icon: Send, title: "Send now", desc: "After admin approval" },
            { key: "later", icon: Calendar, title: "Schedule", desc: "Pick a date and time" },
          ].map((o) => {
            const active = scheduleType === o.key;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onScheduleTypeChange(o.key)}
                className={`flex items-start gap-2.5 p-3 rounded-lg border text-left cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/20 ${
                  active
                    ? "border-primary-text/70 bg-primary-text/[0.06]"
                    : "border-border bg-card hover:bg-muted/30"
                }`}
              >
                <div
                  className={`grid size-7 shrink-0 place-items-center rounded-md ${
                    active
                      ? "bg-primary-text/10 text-primary-text"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <o.icon className="size-3.5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{o.title}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{o.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        <AnimatedCollapse open={scheduleType === "later"}>
          <div className="space-y-1.5 pt-3 border-t">
            <Label htmlFor="scheduledTime" className="text-xs font-medium">
              Date and time <span className="text-destructive">*</span>
            </Label>
            <ScheduleDateTimePicker
              value={scheduledTime}
              onChange={onScheduledTimeChange}
              invalid={Boolean(scheduledTime && !scheduleValid)}
            />
            {scheduledTime && !scheduleValid ? (
              <p className="text-[11px] text-destructive">Pick a time in the future.</p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Your campaign will start in the next available campaign window after your selected time.
              </p>
            )}
          </div>
        </AnimatedCollapse>
      </CardContent>
    </Card>
  );
}

