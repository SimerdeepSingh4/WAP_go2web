import { useEffect, useId, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const receiptTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export default function PaymentProofFields({ file, onFileChange, replacement = false }) {
  const id = useId();
  const picker = useRef(null);
  const [error, setError] = useState("");
  const preview = useRef(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!preview.current || !file?.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    preview.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectFile(next) {
    let issue = "";
    if (next && !receiptTypes.includes(next.type)) issue = "Choose a JPG, PNG, WebP or PDF receipt.";
    else if (next && (!next.size || next.size > 5 * 1024 * 1024)) issue = "Choose a nonempty receipt of 5 MB or less.";
    setError(issue);
    picker.current.setCustomValidity(issue);
    picker.current.value = "";
    onFileChange(issue ? null : next);
  }

  return <div className="grid min-w-0 grid-cols-1 gap-4">
    <div className="grid min-w-0 grid-cols-1 gap-1.5">
      <label htmlFor={id + "-file"} className="flex items-center justify-between gap-2 text-sm font-semibold">
        {replacement ? "Replacement payment screenshot / receipt" : "Payment screenshot / receipt"}
      </label>
      <div className="flex items-center gap-2">
        <div className={`relative flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-dashed p-3.5 focus-within:ring-2 focus-within:ring-ring ${dragging ? "border-primary bg-accent" : "border-input bg-muted/30 hover:border-primary"}`}
          onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files[0]) selectFile(e.dataTransfer.files[0]); }}>
          <input ref={picker} id={id + "-file"} type="file" accept={receiptTypes.join(",")}
            aria-required="true" aria-invalid={Boolean(error)} aria-describedby={id + "-file-help"}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            onChange={e => { if (e.target.files[0]) selectFile(e.target.files[0]); }} />
          <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border bg-background text-muted-foreground">
            {file?.type.startsWith("image/") ? <img ref={preview} alt="" className="size-full object-contain" /> : file ? <FileText className="size-5" /> : <Upload className="size-5" />}
          </span>
          <span className="min-w-0"><strong className="block truncate text-sm">{file?.name || "Choose a screenshot or receipt, or drop it here"}</strong>
            <span className="text-xs text-muted-foreground">{file ? "Choose another file to replace" : "JPG, PNG, WebP or PDF · Up to 5 MB"}</span>
          </span>
        </div>
        {(file || error) && <Button type="button" variant="outline" size="icon-sm" aria-label={file ? "Remove selected receipt" : "Discard invalid file"} onClick={() => selectFile(null)}><X /></Button>}
      </div>
      <p id={id + "-file-help"} role={error ? "alert" : undefined} className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
        {error || (replacement ? "Upload your updated payment screenshot or PDF receipt." : "Upload a clear screenshot showing the paid amount.")}
      </p>
    </div>
  </div>;
}
