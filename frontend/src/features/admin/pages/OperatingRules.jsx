import { useState } from "react";
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
      <PageHeading title="Limits & operating hours" description="Daily campaign allowances and the execution window for each account." />
      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
        <p className="text-sm font-medium text-amber-950">Preview only</p>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-amber-900">Changes are not saved or applied to campaigns.</p>
      </div>
      <Card className="max-w-3xl rounded-lg">
        <CardHeader className="border-b pb-4"><CardTitle>Planned defaults</CardTitle></CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field id="daily-limit" label="Campaigns per account per day" hint="Each user and each reseller's own campaigns have a separate allowance.">
            <Input id="daily-limit" type="number" value={draft.dailyCampaignLimit} readOnly aria-describedby="daily-limit-hint" />
          </Field>
        </CardContent>
      </Card>
      <Card className="max-w-3xl rounded-lg">
        <CardHeader className="border-b pb-4"><CardTitle>Operating window</CardTitle><p id="operating-wheel-help" className="text-sm leading-relaxed text-muted-foreground">Scroll or drag to select a time. With a column focused, use the arrow keys, Page Up, Page Down, Home, or End.</p></CardHeader>
        <CardContent className="space-y-5">
          <div key={resetKey} className="grid gap-6 sm:grid-cols-2">
            <OperatingTimePicker id="start-time" label="Start time" value={draft.startTime} onChange={(value) => changeTime("startTime", value)} invalid={Boolean(error)} />
            <OperatingTimePicker id="end-time" label="End time" value={draft.endTime} onChange={(value) => changeTime("endTime", value)} invalid={Boolean(error)} />
          </div>
          <p id="operating-window-error" role="alert" className={error ? "text-sm text-destructive" : "sr-only"}>{error}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">{error ? "Adjust the window to continue." : `${formatOperatingTime(draft.startTime)} – ${formatOperatingTime(draft.endTime)}`}</p>
            <Button variant="outline" onClick={resetPreview}>Reset preview</Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
