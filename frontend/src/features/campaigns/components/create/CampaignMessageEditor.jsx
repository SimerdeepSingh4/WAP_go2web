import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { FileText, AlertTriangle } from "lucide-react";
import { number } from "@/features/admin/lib/format";
import { SectionCard } from "./CampaignDetailsSection";

export const CHARACTER_LIMIT = 1024;

export default function CampaignMessageEditor({
  quillRef,
  messageBody,
  onMessageBodyChange,
  charCount,
  isOverCharacterLimit,
  onInsertVariable,
  quillModules,
  quillFormats,
}) {
  const characterPct = Math.min(100, (charCount / CHARACTER_LIMIT) * 100);

  return (
    <SectionCard
      icon={FileText}
      title="Message"
      description="What your recipients will receive."
      aside={
        <div className="w-40 space-y-1">
          <div className="flex items-center justify-between text-xs tabular-nums">
            <span
              className={
                isOverCharacterLimit
                  ? "font-semibold text-destructive"
                  : charCount > 900
                  ? "text-amber-600 dark:text-amber-400 font-medium"
                  : "text-foreground"
              }
            >
              {number(charCount)} / {number(CHARACTER_LIMIT)} characters
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full transition-all ${
                isOverCharacterLimit
                  ? "bg-destructive"
                  : charCount > 900
                  ? "bg-amber-500"
                  : "bg-primary"
              }`}
              style={{ width: `${characterPct}%` }}
            />
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground mr-1">Personalise with</span>
          {["name", "phone"].map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onInsertVariable(tag)}
              className="px-2.5 py-1 text-xs rounded-md bg-muted hover:bg-muted/70 text-foreground font-mono transition-colors border border-border/60 hover:border-primary/40 cursor-pointer"
            >
              {`{{${tag}}}`}
            </button>
          ))}
        </div>

        <div className="quill-editor-container">
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={messageBody}
            onChange={onMessageBodyChange}
            modules={quillModules}
            formats={quillFormats}
            placeholder="Type your message here…"
          />
        </div>

        {isOverCharacterLimit && (
          <div
            role="alert"
            className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20"
          >
            <AlertTriangle className="size-4 shrink-0" />
            Over the limit by {number(charCount - CHARACTER_LIMIT)} characters. Shorten the message to continue.
          </div>
        )}

      </div>
    </SectionCard>
  );
}

