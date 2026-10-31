import { useState } from "react";
import { Server, Cpu, CheckCircle2, Sliders, Shield, Zap } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { PageHeading, Field } from "../components/shared";
import OperatingTimePicker from "../components/OperatingTimePicker";
import { operatingRulesPreview } from "../data/operatingRules.preview";
import { formatOperatingTime, validateOperatingWindow } from "../lib/operatingTime";

export default function OperatingRules() {
  const [draft, setDraft] = useState({ ...operatingRulesPreview });
  const [resetKey, setResetKey] = useState(0);
  const error = validateOperatingWindow(draft.startTime, draft.endTime);

  function changeTime(key, value) {
    const next = { ...draft, [key]: value };
    const nextError = validateOperatingWindow(next.startTime, next.endTime);
    setDraft(next);
    if (nextError && nextError !== error) toast.add({ title: nextError, type: "error" });
  }

  function resetPreview() {
    setDraft({ ...operatingRulesPreview });
    setResetKey((key) => key + 1);
    toast.add({ title: "Preview reset to starting values", type: "success" });
  }

  return (
    <>
      <PageHeading
        title="Limits & Operating Rules"
        description="Daily campaign allowances, BullMQ queue dispatch parameters, and WhatsApp execution windows."
      />

      {/* BullMQ Engine & Execution Policy Card */}
      <Card className="max-w-3xl rounded-lg border shadow-none">
        <CardHeader className="border-b pb-3.5">
          <div className="flex items-center gap-2">
            <Cpu className="size-4.5 text-primary" />
            <CardTitle className="text-base">BullMQ Worker Engine Specifications</CardTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Active dispatch configuration running on Redis queue <code>campaign-dispatch-queue</code>.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Zap className="size-3.5 text-amber-500" />
              Batch Dispatch
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums">25 msg / batch</p>
            <p className="text-[11px] text-muted-foreground">Rate throttled: 120ms</p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Server className="size-3.5 text-blue-500" />
              Worker Concurrency
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums">5 Parallel Jobs</p>
            <p className="text-[11px] text-muted-foreground">High-throughput queue</p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
              <Shield className="size-3.5 text-emerald-500" />
              Auto-Refund Policy
            </p>
            <p className="mt-1 text-lg font-bold text-emerald-700">Atomic CAS</p>
            <p className="text-[11px] text-muted-foreground">Immediate credit refund</p>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4 max-w-3xl">
        <p className="text-sm font-semibold text-amber-950">Operating Window Preview Mode</p>
        <p className="mt-0.5 text-xs leading-relaxed text-amber-900">
          Campaign limits and sending window rules will be enforced during dispatch. Test and configure prospective rules below.
        </p>
      </div>

      <Card className="max-w-3xl rounded-lg shadow-none">
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-base">Planned Account Limits</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 pt-4 sm:grid-cols-2">
          <Field
            id="daily-limit"
            label="Campaigns per account per day"
            hint="Each user and each reseller's own campaigns have an independent sending quota."
          >
            <Input id="daily-limit" type="number" value={draft.dailyCampaignLimit} readOnly aria-describedby="daily-limit-hint" />
          </Field>
        </CardContent>
      </Card>

      <Card className="max-w-3xl rounded-lg shadow-none">
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-base">Allowed Execution Hours</CardTitle>
          <p id="operating-wheel-help" className="text-xs leading-relaxed text-muted-foreground">
            Out-of-window campaigns are automatically queued and held until the next opening window. Scroll or drag to select hours.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 pt-4">
          <div key={resetKey} className="grid gap-6 sm:grid-cols-2">
            <OperatingTimePicker
              id="start-time"
              label="Start time"
              value={draft.startTime}
              onChange={(value) => changeTime("startTime", value)}
              invalid={Boolean(error)}
            />
            <OperatingTimePicker
              id="end-time"
              label="End time"
              value={draft.endTime}
              onChange={(value) => changeTime("endTime", value)}
              invalid={Boolean(error)}
            />
          </div>
          <p id="operating-window-error" role="alert" className={error ? "text-sm text-destructive" : "sr-only"}>
            {error}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              {error
                ? "Adjust the window to continue."
                : `Active sending window: ${formatOperatingTime(draft.startTime)} – ${formatOperatingTime(draft.endTime)}`}
            </p>
            <Button variant="outline" size="sm" onClick={resetPreview}>
              Reset preview
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
