import { Users, Upload, CheckCircle2, Copy as CopyIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { number } from "@/features/admin/lib/format";
import { SectionCard } from "./CampaignDetailsSection";

export default function CampaignRecipientsInput({
  fileInputRef,
  rawRecipients,
  onRawRecipientsChange,
  dropActive,
  onDragOver,
  onDragLeave,
  onDrop,
  onReadFile,
  totalRecipients,
  duplicatesCount,
  invalidCount,
  showValidation = false,
}) {
  return (
    <SectionCard
      dataTour="create-recipients"
      icon={Users}
      title="Recipients"
      description="Paste numbers with country code (e.g. 91XXXXXXXXXX), or drop a CSV or TXT file."
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
            <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
              Country code required (e.g. 919876543210) &bull; One per line, commas or spaces
            </span>
          </div>
          <Textarea
            id="recipients"
            rows={6}
            value={rawRecipients}
            onChange={(e) => onRawRecipientsChange(e.target.value)}
            placeholder={"Enter numbers WITH country code (e.g. 91 for India):\n919876543210\n919876543211\n919876543212\n\nNote: Always include the country code without '+' or spaces."}
            spellCheck={false}
            className={`field-sizing-fixed h-40 min-h-32 max-h-64 overflow-y-auto bg-background text-xs font-mono leading-6 resize-y transition-colors focus-visible:ring-2 focus-visible:ring-ring/20 ${
              dropActive ? "border-primary bg-primary/5" : ""
            }`}
            required
          />
        </div>


        {showValidation && <div className="flex items-center gap-2 flex-wrap" aria-live="polite">
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
              {number(invalidCount)} invalid skipped
            </span>
          )}
        </div>}
      </div>
    </SectionCard>
  );
}

