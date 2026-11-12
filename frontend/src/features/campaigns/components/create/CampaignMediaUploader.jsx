import { useState, useRef } from "react";
import { Upload, Image as ImageIcon, Video as VideoIcon, FileText, Trash2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./CampaignDetailsSection";
import { resolveUserImageUrl } from "@/components/dashboard/profileImage";

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
    max: 9 * MB,
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

function MediaSlot({ kind, config, value, onSelect, onRemove }) {
  const cfg = config || MEDIA_KINDS[kind];
  const Icon = cfg.icon;
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
      className={`rounded-xl border p-3.5 flex flex-col gap-3 transition-colors ${
        dragging ? "border-primary bg-primary/5" : "bg-card"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`grid size-9 place-items-center rounded-lg ${cfg.tone}`}>
            <Icon className="size-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground">{cfg.label}</p>
            <p className="text-[11px] text-muted-foreground">
              {cfg.hint} · up to {cfg.max / MB} MB
            </p>
          </div>
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
        <div className="rounded-lg border bg-muted/30 p-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {kind === "image" && value.preview ? (
              <img src={value.preview} alt="" className="size-10 rounded object-cover border shrink-0" />
            ) : (
              <div className={`grid size-10 shrink-0 place-items-center rounded ${cfg.tone}`}>
                {kind === "pdf" ? <span className="font-bold text-[10px]">PDF</span> : <Icon className="size-4" />}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate" title={value.name}>
                {value.name}
              </p>
              <p className="text-[11px] text-muted-foreground">{formatFileSize(value.size)}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onRemove(kind)}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1.5 rounded transition-colors shrink-0 cursor-pointer"
            title={`Remove ${cfg.label.toLowerCase()}`}
            aria-label={`Remove ${cfg.label.toLowerCase()}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="w-full h-9 text-xs gap-1.5 border-dashed"
        >
          <Plus className="size-3.5" />
          Choose or drop file
        </Button>
      )}
    </div>
  );
}

export default function CampaignMediaUploader({
  media,
  onSelectMedia,
  onRemoveMedia,
  canShareProfileDp,
  shareProfileDp,
  onToggleShareProfileDp,
  userProfileDp,
}) {
  const isDpSharingAvailable = Boolean(canShareProfileDp);
  const profileDpUrl = resolveUserImageUrl(userProfileDp);
  const totalMediaCount = Object.values(media).filter(Boolean).length + (isDpSharingAvailable && shareProfileDp ? 1 : 0);
  const mediaKinds = Object.keys(MEDIA_KINDS);

  return (
    <SectionCard
      dataTour="create-media"
      icon={Upload}
      title="Campaign media"
      description="Optional campaign image, video, and PDF attachments."
      aside={
        totalMediaCount > 0 && (
          <Badge
            variant="outline"
            className="text-xs bg-primary/5 text-primary border-primary/20 tabular-nums"
          >
            {totalMediaCount} attached
          </Badge>
        )
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {mediaKinds.map((kind) => (
          <MediaSlot
            key={kind}
            kind={kind}
            config={MEDIA_KINDS[kind]}
            value={media[kind]}
            onSelect={onSelectMedia}
            onRemove={onRemoveMedia}
          />
        ))}
      </div>

      {isDpSharingAvailable && (
        <div className="mt-4 pt-3.5 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center gap-3 min-w-0">
            {profileDpUrl ? <img
              src={profileDpUrl}
              alt="Profile DP"
              className="size-10 rounded-full object-cover border shrink-0"
            /> : <span className="grid size-10 shrink-0 place-items-center rounded-full border bg-muted text-muted-foreground" aria-hidden="true"><ImageIcon className="size-4" /></span>}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Share Settings Profile DP</p>
              <p className="text-[11px] text-muted-foreground truncate">
                Share your profile DP from Settings with this campaign.
              </p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer self-end sm:self-center shrink-0">
            <input
              type="checkbox"
              checked={Boolean(shareProfileDp)}
              onChange={(e) => onToggleShareProfileDp && onToggleShareProfileDp(e.target.checked)}
              className="size-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
            />
            <span className="text-xs font-medium text-foreground select-none">
              Share DP
            </span>
          </label>
        </div>
      )}
    </SectionCard>
  );
}

