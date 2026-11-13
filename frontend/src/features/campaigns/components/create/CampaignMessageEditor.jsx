import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { FileText, AlertTriangle } from "lucide-react";
import { number } from "@/lib/format";
import { SectionCard } from "./CampaignDetailsSection";
import { AnimatedCollapse } from "@/components/ui/animated-collapse";

export const CHARACTER_LIMIT = 1024;

export default function CampaignMessageEditor({
  quillRef,
  messageBody,
  onMessageBodyChange,
  charCount,
  isOverCharacterLimit,
  quillModules,
  quillFormats,
}) {
  const characterPct = Math.min(100, (charCount / CHARACTER_LIMIT) * 100);

  // Prevent dynamic variable typing: block consecutive '{' that would form '{{'
  const handleKeyDown = (e) => {
    if (e.key === "{") {
      const editor = quillRef?.current?.getEditor?.();
      if (editor) {
        const range = editor.getSelection();
        if (range && range.index > 0) {
          const prevChar = editor.getText(range.index - 1, 1);
          if (prevChar === "{") {
            e.preventDefault();
            return;
          }
        }
      }
    }
  };

  // Strip any dynamic placeholder tags (like {{name}}, {{phone}}, {{...}}) on input/paste
  const handleChange = (content, delta, source, editor) => {
    if (content && /\{\{[\s\S]*?\}\}/.test(content)) {
      const sanitized = content.replace(/\{\{[\s\S]*?\}\}/g, "").replace(/\{\{+/g, "{");
      onMessageBodyChange(sanitized);
      return;
    }
    onMessageBodyChange(content, delta, source, editor);
  };

  return (
    <SectionCard
      dataTour="create-message"
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
        <div className="quill-editor-container">
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={messageBody}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            modules={quillModules}
            formats={quillFormats}
            placeholder="Type your message here…"
          />
        </div>

        <AnimatedCollapse open={isOverCharacterLimit}>
          <div
            role="alert"
            className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20"
          >
            <AlertTriangle className="size-4 shrink-0" />
            Over the limit by {number(charCount - CHARACTER_LIMIT)} characters. Shorten the message to continue.
          </div>
        </AnimatedCollapse>

      </div>
    </SectionCard>
  );
}
