import { useState, useRef } from "react";
import { Upload, Image as ImageIcon, Video as VideoIcon, FileText, Trash2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./CampaignDetailsSection";

export const MB = 1024 * 1024;

export const MEDIA_KINDS = {
  image: {
    label: "Image",
    hint: "PNG, JPG, WebP",
    accept: "image/png,image/jpeg,image/webp",
    types: ["image/png", "image/jpeg", "image/webp"],
    max: 5 * MB,
    icon: ImageIcon,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  video: {
    label: "Video",
    hint: "MP4, MOV, WebM",
    accept: "video/mp4,video/quicktime,video/webm",
    types: ["video/mp4", "video/quicktime", "video/webm"],
    max: 7 * MB,
    icon: VideoIcon,
    tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  pdf: {
    label: "PDF document",
    hint: "PDF only",
    accept: "application/pdf,.pdf",
    types: ["application/pdf"],
    max: 5 * MB,
    icon: FileText,
    tone: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
};

export function formatFileSize(bytes) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}

function MediaSlot({ kind, value, onSelect, onRemove }) {
  const cfg = MEDIA_KINDS[kind];
  const Icon = cfg.icon;
  const isPdf = kind === "pdf";
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const pick = (file) => {
    if (file) onSelect(kind, file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files?.[0]);
      }}
      className={`${isPdf ? "col-span-2 grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] items-center gap-x-4 p-2.5 max-[420px]:col-span-1 max-[420px]:grid-cols-1" : "p-3"} rounded-lg border transition-colors ${
        dragging ? "border-primary bg-primary/5 ring-2 ring-primary/10" : "bg-card hover:border-border/80"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className={`grid size-9 shrink-0 place-items-center rounded-md ${cfg.tone}`}>
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-xs font-semibold text-foreground">{cfg.label}</p>
            <p className="text-[10px] text-muted-foreground">Up to {cfg.max / MB} MB</p>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{cfg.hint}</p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={cfg.accept}
        onChange={(e) => pick(e.target.files?.[0])}
        className="hidden"
        aria-label={`Choose ${cfg.label}`}
      />

      {value ? (
        <div className={`${isPdf ? "mt-0" : "mt-2.5"} flex min-w-0 items-center gap-2 rounded-md border bg-muted/30 p-2`}>
          <div className={`grid ${isPdf ? "size-9" : "size-10"} shrink-0 place-items-center overflow-hidden rounded border bg-background`}>
            {kind === "image" && value.preview ? (
              <img src={value.preview} alt={`Selected ${cfg.label.toLowerCase()} preview`} className="size-full object-cover" />
            ) : (
              <Icon className={`size-4 ${kind === "pdf" ? "text-red-600" : "text-sky-600"}`} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-foreground" title={value.name}>{value.name}</p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{formatFileSize(value.size)} · Ready</p>
          </div>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={() => onRemove(kind)}
            aria-label={`Remove ${cfg.label.toLowerCase()}`}
            title={`Remove ${cfg.label.toLowerCase()}`}
            className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ) : (
        <div className={`${isPdf ? "mt-0 min-h-10 flex-row items-center" : "mt-2.5 min-h-16 flex-col items-start justify-between"} flex gap-2 rounded-md border border-dashed px-2.5 py-2 ${dragging ? "border-primary" : "border-border"}`}>
          <p className="text-[10px] leading-4 text-muted-foreground">Drop file here</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            className={`h-7 gap-1.5 text-[11px] ${isPdf ? "shrink-0 px-2" : "w-full"}`}
          >
            <Plus className="size-3.5" />
            Choose file
          </Button>
        </div>
      )}
    </div>
  );
}

export default function CampaignMediaUploader({
  media,
  onSelectMedia,
  onRemoveMedia,
}) {
  const totalMediaCount = Object.values(media).filter(Boolean).length;

  return (
    <SectionCard
      dataTour="create-media"
      icon={Upload}
      title="Campaign media"
      description="Optional campaign attachments: one image, one video, and one PDF."
      aside={
        totalMediaCount > 0 && (
          <Badge
            variant="outline"
            className="text-xs bg-primary/5 text-primary border-primary/20 tabular-nums"
          >
            {totalMediaCount} of 3 attached
          </Badge>
        )
      }
    >
      <div className="grid grid-cols-2 gap-2.5 max-[420px]:grid-cols-1">
        {Object.keys(MEDIA_KINDS).map((kind) => (
          <MediaSlot
            key={kind}
            kind={kind}
            value={media[kind]}
            onSelect={onSelectMedia}
            onRemove={onRemoveMedia}
          />
        ))}
      </div>
    </SectionCard>
  );
}

