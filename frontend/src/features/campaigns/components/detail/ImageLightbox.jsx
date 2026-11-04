import { useEffect } from "react";
import { Download, X } from "lucide-react";

export default function ImageLightbox({
  previewImage,
  onClose,
  onDownload,
}) {
  // Close lightbox with Escape
  useEffect(() => {
    if (!previewImage) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewImage, onClose]);

  if (!previewImage) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <img
          src={previewImage}
          alt="Attachment preview"
          className="max-h-[85vh] max-w-full rounded-lg object-contain shadow-2xl"
        />
        <div className="absolute -top-3 -right-3 flex gap-2">
          <button
            type="button"
            onClick={() => onDownload(previewImage, "image.jpg")}
            className="size-8 rounded-full bg-white text-slate-800 flex items-center justify-center shadow-lg hover:bg-slate-100 cursor-pointer"
            aria-label="Download image"
          >
            <Download className="size-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-full bg-white text-slate-800 flex items-center justify-center shadow-lg hover:bg-slate-100 cursor-pointer"
            aria-label="Close preview"
            autoFocus
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

