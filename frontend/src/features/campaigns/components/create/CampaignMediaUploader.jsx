import { useState, useRef } from "react";
import { Upload, Image as ImageIcon, Video as VideoIcon, FileText, Trash2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "./CampaignDetailsSection";
import { resolveUserImageUrl } from "@/features/accounts/lib/profileImage";
import { DEFAULT_MEDIA_UPLOAD_LIMITS } from "../../../../../../shared/mediaUploadLimits.js";

export const MB = 1024 * 1024;

export const MEDIA_KINDS = {
  image: {
    label: "Image",
    hint: "PNG, JPG, WebP",
    accept: "image/png,image/jpeg,image/webp",
    types: ["image/png", "image/jpeg", "image/webp"],
    max: DEFAULT_MEDIA_UPLOAD_LIMITS.imageMB * MB,
    icon: ImageIcon,
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  video: {
    label: "Video",
    hint: "MP4, MOV, WebM",
    accept: "video/mp4,video/quicktime,video/webm",
    types: ["video/mp4", "video/quicktime", "video/webm"],
    max: DEFAULT_MEDIA_UPLOAD_LIMITS.videoMB * MB,
    icon: VideoIcon,
    tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  pdf: {
    label: "PDF document",
    hint: "PDF only",
    accept: "application/pdf,.pdf",
    types: ["application/pdf"],
    max: DEFAULT_MEDIA_UPLOAD_LIMITS.pdfMB * MB,
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

export function mediaKindsForLimits(limits) {
  return Object.fromEntries(Object.entries(MEDIA_KINDS).map(([kind, config]) => [kind, {
    ...config, max: limits[{ image: "imageMB", video: "videoMB", pdf: "pdfMB" }[kind]] * MB,
  }]));
}

export default function CampaignMediaUploader({
  media, onSelectMedia, onRemoveMedia, canShareProfileDp, shareProfileDp,
  onToggleShareProfileDp, userProfileDp, mediaKinds = MEDIA_KINDS,
}) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const profileDpUrl = resolveUserImageUrl(userProfileDp);
  const uploaded = Object.entries(media).filter(([, value]) => value);
  const count = uploaded.length;
  const selected = uploaded.map(([kind, value]) => ({ kind, value, config: mediaKinds[kind] }));

  function pick(files) {
    setDragging(false);
    setError("");
    if (!files?.length) return;
    if (files.length > 1) {
      setError("Choose only one image, video, or PDF per campaign.");
      return;
    }
    const file = files[0];
    const kind = Object.keys(mediaKinds).find(key =>
      mediaKinds[key].types.includes(file.type) || (key === "pdf" && /\.pdf$/i.test(file.name))
    );
    if (!kind) {
      setError("Choose a JPG, PNG, WebP image, MP4, MOV, WebM video, or PDF document.");
      return;
    }
    onSelectMedia(kind, file);
  }

  return <SectionCard
    dataTour="create-media"
    icon={Upload}
    title="Campaign media"
    description="Optional. Add one image, video, or PDF to this campaign."
    aside={<Badge variant="outline" className="text-xs tabular-nums" data-media-count={count}>{count} / 1 attached</Badge>}
  >
    <input
      ref={inputRef}
      type="file"
      accept={Object.values(mediaKinds).map(config => config.accept).join(",")}
      aria-label="Choose campaign media"
      className="hidden"
      onChange={event => { pick(event.target.files); event.target.value = ""; }}
    />
    <div
      data-media-dropzone
      className={`min-w-0 rounded-xl border border-dashed p-4 transition-colors sm:p-5 ${dragging ? "border-primary bg-primary/5" : "border-border bg-muted/20"}`}
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
      onDrop={event => { event.preventDefault(); pick(event.dataTransfer.files); }}
    >
      {selected.length ? (
        <div className="space-y-3">
          {selected.map(({ kind, value, config }) => {
            const Icon = config.icon;
            return <div key={kind} data-media-kind={kind} className="min-w-0 overflow-hidden rounded-lg border bg-card">
              {kind === "image" && value.preview && <img src={value.preview} alt="Selected campaign attachment" className="mx-auto max-h-48 w-full bg-muted/30 object-contain" />}
              {kind === "video" && value.preview && <video src={value.preview} controls playsInline preload="metadata" className="mx-auto max-h-48 w-full bg-black" aria-label="Selected video preview" />}
              <div className="flex min-w-0 items-center gap-3 p-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${config.tone}`}><Icon className="size-4" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground" title={value.name}>{value.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{formatFileSize(value.size)}</p>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${config.label.toLowerCase()}`} onClick={() => {
                  setError("");
                  onRemoveMedia(kind);
                }}><Trash2 className="size-4" aria-hidden="true" /></Button>
              </div>
            </div>;
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] leading-5 text-muted-foreground">Choosing another file replaces the current attachment.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}><RefreshCw className="size-3.5" aria-hidden="true" />Replace media</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-3 text-center">
          <span className="grid size-11 place-items-center rounded-full border bg-card text-primary-text"><Upload className="size-5" aria-hidden="true" /></span>
          <div><p className="text-sm font-medium">Drop your media here</p><p className="mt-1 text-xs text-muted-foreground">One attachment per campaign. Text-only campaigns are welcome too.</p></div>
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>Choose media</Button>
        </div>
      )}
    </div>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    {count > 1 && <p role="alert" className="mt-2 text-xs text-destructive">This saved draft has multiple attachments. Remove extras or replace them with a single file.</p>}
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
      {Object.entries(mediaKinds).map(([kind, config]) => <span key={kind}>{config.label}: up to {config.max / MB} MB</span>)}
    </div>
    {canShareProfileDp && <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border bg-muted/20 p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {profileDpUrl ? <img src={profileDpUrl} alt="" className="size-9 shrink-0 rounded-full border object-cover" /> : <span className="grid size-9 shrink-0 place-items-center rounded-full border text-muted-foreground"><ImageIcon className="size-4" aria-hidden="true" /></span>}
        <div className="min-w-0">
          <p className="text-xs font-medium">Share profile photo</p>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{profileDpUrl ? "Included separately. Does not replace or count as campaign media." : "Add a profile photo in Settings to use this option."}</p>
        </div>
      </div>
      <label className="flex shrink-0 items-center gap-2 text-xs">
        <input type="checkbox" checked={Boolean(shareProfileDp)} disabled={!profileDpUrl && !shareProfileDp}
          onChange={event => { setError(""); onToggleShareProfileDp(event.target.checked); }}
          className="size-4 accent-primary-text" aria-label="Share profile photo with campaign" />
        Include DP
      </label>
    </div>}
  </SectionCard>;
}

