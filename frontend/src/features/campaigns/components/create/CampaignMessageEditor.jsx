import { useEffect, useRef } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { FileText, AlertTriangle } from "lucide-react";
import { number } from "@/lib/format";
import { SectionCard } from "./CampaignDetailsSection";
import { AnimatedCollapse } from "@/components/ui/animated-collapse";

export const CHARACTER_LIMIT = 1024;
const modules = {
  toolbar: [
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["blockquote", "code", "code-block"],
    ["clean"],
  ],
  history: { userOnly: true },
};
const formats = ["bold", "italic", "underline", "strike", "list", "blockquote", "code", "code-block"];
const formatLabels = {
  bold: "Bold", italic: "Italic", underline: "Underline", strike: "Strikethrough",
  ordered: "Numbered list", bullet: "Bulleted list", blockquote: "Quote",
  code: "Inline code", "code-block": "Code block", clean: "Clear formatting",
};

export default function CampaignMessageEditor({
  messageBody,
  onMessageBodyChange,
  charCount,
  isOverCharacterLimit,
  children,
}) {
  const characterPct = Math.min(100, (charCount / CHARACTER_LIMIT) * 100);
  const quillRef = useRef(null);

  useEffect(() => {
    const editor = quillRef.current?.getEditor?.();
    if (!editor) return;
    editor.root.setAttribute("role", "textbox");
    editor.root.setAttribute("aria-label", "Campaign message");
    editor.root.setAttribute("aria-multiline", "true");
    const toolbar = editor.getModule("toolbar")?.container;
    if (toolbar) {
      toolbar.setAttribute("aria-label", "Message formatting");
      // Remove emoji, expand, fullscreen, undo, and redo buttons if present
      const unwantedSelectors = [
        ".ql-emoji",
        ".ql-undo",
        ".ql-redo",
        ".ql-expand",
        ".ql-fullscreen",
        "button[class*='emoji']",
        "button[class*='undo']",
        "button[class*='redo']",
        "button[class*='expand']",
        "button[class*='fullscreen']",
        "button[value='undo']",
        "button[value='redo']",
        "button[value='emoji']",
        "button[value='expand']",
        "button[value='fullscreen']",
      ];
      toolbar.querySelectorAll(unwantedSelectors.join(", ")).forEach(btn => btn.remove());

      for (const button of toolbar.querySelectorAll("button")) {
        const format = Array.from(button.classList).find(name => name.startsWith("ql-"))?.slice(3);
        const label = formatLabels[format === "list" ? button.value : format];
        if (label) {
          button.title = label;
          button.setAttribute("aria-label", label);
        }
      }
    }
  }, []);

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
      description="Write a message, attach a file below, or use both."
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
            modules={modules}
            formats={formats}
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
        {children}
      </div>
    </SectionCard>
  );
}
