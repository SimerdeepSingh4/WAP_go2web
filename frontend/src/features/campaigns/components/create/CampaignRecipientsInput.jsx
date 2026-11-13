import { Users, Upload, CheckCircle2, Copy as CopyIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { number } from "@/lib/format";
import { SectionCard } from "./CampaignDetailsSection";
import { AnimatedCollapse } from "@/components/ui/animated-collapse";

export default function CampaignRecipientsInput({
  fileInputRef,
  rawRecipients,
  onRawRecipientsChange,
  onRecipientsPaste,
  onRecipientsBeforeInput,
  dropActive,
  onDragOver,
  onDragLeave,
  onDrop,
  onReadFile,
  totalRecipients,
  duplicatesCount,
  invalidCount,
  invalidEntries = [],
  inputError,
  onBlur,
  showValidation = false,
}) {
  const visibleErrors = showValidation ? invalidEntries : invalidEntries.filter(({ message }) => message === "Must start with 91.");
  return (
    <SectionCard
      dataTour="create-recipients"
      icon={Users}
      title="Recipients"
      description="Enter 12-digit numbers starting with 91, one per line, or upload a CSV or TXT file in the same format."
      aside={
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={(e) => onReadFile(e.target.files?.[0])}
            className="hidden"
            aria-label="Upload recipients file"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 text-xs gap-1.5"
          >
            <Upload className="size-3.5" />
            Upload CSV / TXT
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div
          className="space-y-1.5"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="recipients" className="text-xs font-medium">
              Phone numbers <span className="text-destructive">*</span>
            </Label>
            <span id="recipients-help" className="text-[11px] font-medium text-muted-foreground">
              Exactly 12 digits starting with 91 &bull; One number per line
            </span>
          </div>
          <Textarea
            id="recipients"
            rows={6}
            value={rawRecipients}
            onChange={(e) => onRawRecipientsChange(e.target.value, e)}
            onPaste={onRecipientsPaste}
            onBeforeInput={onRecipientsBeforeInput}
            onBlur={onBlur}
            inputMode="numeric"
            aria-invalid={visibleErrors.length > 0}
            aria-describedby={["recipients-help", visibleErrors.length ? "recipients-errors" : "", inputError ? "recipients-input-error" : ""].filter(Boolean).join(" ")}
            placeholder={"919876543210\n919876543211\n919876543212"}
            spellCheck={false}
            className={`field-sizing-fixed h-40 min-h-32 max-h-64 overflow-y-auto bg-background text-xs font-mono leading-6 resize-y transition-colors focus-visible:ring-2 focus-visible:ring-ring/20 ${
              dropActive ? "border-primary bg-primary/5" : ""
            }`}
            required
          />

        </div>


        <AnimatedCollapse open={showValidation}><div className="flex items-center gap-2 flex-wrap" aria-live="polite">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 text-xs font-medium border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="size-3.5" />
            {number(totalRecipients)} valid
          </span>
          {duplicatesCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-stone-100 text-stone-700 dark:bg-stone-900/50 dark:text-stone-300 text-xs font-medium border border-stone-300 dark:border-stone-700">
              <CopyIcon className="size-3.5" />
              {number(duplicatesCount)} duplicates removed
            </span>
          )}
          {invalidCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 text-xs font-medium border border-red-200 dark:border-red-800">
              <X className="size-3.5" />
              {number(invalidCount)} invalid {invalidCount === 1 ? "line" : "lines"} — correct before continuing
            </span>
          )}
        </div></AnimatedCollapse>
        {inputError && <p id="recipients-input-error" className="text-xs text-destructive" role="alert">Line {inputError.lineNumber}: {inputError.message} The input was not added.</p>}
        {visibleErrors.length > 0 && <div id="recipients-errors" className="text-xs text-destructive" aria-live="polite">
          <ul className="space-y-1">
            {visibleErrors.slice(0, 10).map(({ lineNumber, message }) => <li key={lineNumber} className={message === "Must start with 91." ? "text-amber-700 dark:text-amber-400" : undefined}>Line {lineNumber}: {message}</li>)}
          </ul>
          {visibleErrors.length > 10 && <p className="mt-1">And {number(visibleErrors.length - 10)} more invalid lines.</p>}
        </div>}
      </div>
    </SectionCard>
  );
}

