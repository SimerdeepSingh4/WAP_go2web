import {
  Image as ImageIcon,
  File as FileIcon,
  Video as VideoIcon,
  Music,
  Download,
  ExternalLink,
  Eye,
  Paperclip,
} from "lucide-react";
import { normalizeCampaignMedia } from "../../lib/mediaUrl";

function formatBytes(bytes) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileExt(name = "") {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toUpperCase().slice(0, 4) : "FILE";
}

function AttachmentGroup({ icon: Icon, title, count, children }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Icon className="size-3.5" />
        {title} <span className="tabular-nums">({count})</span>
      </p>
      {children}
    </div>
  );
}

function IconButton({ title, onClick, href, children }) {
  const cls =
    "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} title={title} aria-label={title}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls} title={title} aria-label={title}>
      {children}
    </button>
  );
}

export default function CampaignAttachmentsView({
  campaign,
  onPreviewImage,
  onDownloadMedia,
}) {
  const images = normalizeCampaignMedia(campaign.images);
  const documents = normalizeCampaignMedia(campaign.documents);
  const videos = normalizeCampaignMedia(campaign.video);
  const audios = normalizeCampaignMedia(campaign.audio);
  const attachmentsCount = images.length + documents.length + videos.length + audios.length;
  const hasAttachments = attachmentsCount > 0;

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {hasAttachments ? `${attachmentsCount} file${attachmentsCount > 1 ? "s" : ""}` : "None"}
        </span>
      </div>

      <div className="space-y-4 p-4">
        {!hasAttachments && (
          <div className="flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-4 text-xs text-muted-foreground">
            <Paperclip className="size-4 shrink-0 text-muted-foreground/60" />
            <div className="space-y-1"><p className="font-medium text-foreground">No attachments</p><p className="text-[11px]">No media files were added.</p></div>
          </div>
        )}

        {images.length > 0 && (
          <AttachmentGroup icon={ImageIcon} title="Images" count={images.length}>
            <div className="grid grid-cols-2 gap-2.5">
              {images.map((img, idx) => (
                <div
                  key={idx}
                  className="group relative rounded-lg border border-border overflow-hidden bg-muted aspect-video"
                >
                  <img
                    src={img.url}
                    alt={img.caption || `Image ${idx + 1}`}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onPreviewImage(img.url)}
                      className="p-1.5 rounded-full bg-white/90 text-slate-800 hover:bg-white transition-colors"
                      title="Preview image"
                      aria-label="Preview image"
                    >
                      <Eye className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownloadMedia(img.url, img.filename || `image-${idx + 1}.jpg`)}
                      className="p-1.5 rounded-full bg-white/90 text-slate-800 hover:bg-white transition-colors"
                      title="Download image"
                      aria-label="Download image"
                    >
                      <Download className="size-3.5" />
                    </button>
                  </div>
                  {img.caption && (
                    <p className="absolute bottom-0 inset-x-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 pb-1 pt-4 text-[10px] text-white">
                      {img.caption}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </AttachmentGroup>
        )}

        {documents.length > 0 && (
          <AttachmentGroup icon={FileIcon} title="Documents" count={documents.length}>
            <div className="space-y-2">
              {documents.map((doc, idx) => {
                const name = doc.filename || `Document ${idx + 1}`;
                return (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-border hover:bg-muted/40 transition-colors"
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <div className="size-9 shrink-0 rounded-md bg-red-50 text-red-700 flex items-center justify-center font-semibold text-[10px]">
                        {fileExt(name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground truncate" title={name}>
                          {name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {formatBytes(doc.size) || "Document"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <IconButton href={doc.url} title="Open in new tab">
                        <ExternalLink className="size-3.5" />
                      </IconButton>
                      <IconButton onClick={() => onDownloadMedia(doc.url, name)} title="Download document">
                        <Download className="size-3.5" />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </AttachmentGroup>
        )}

        {videos.length > 0 && (
          <AttachmentGroup icon={VideoIcon} title="Videos" count={videos.length}>
            <div className="space-y-2">
              {videos.map((vid, idx) => (
                <div key={idx} className="rounded-lg border border-border overflow-hidden">
                  <video src={vid.url} controls preload="metadata" className="w-full max-h-52 bg-black" />
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-xs">
                    <span className="truncate text-muted-foreground">{vid.filename || `Video ${idx + 1}`}</span>
                    <IconButton onClick={() => onDownloadMedia(vid.url, vid.filename || "video.mp4")} title="Download video">
                      <Download className="size-3.5" />
                    </IconButton>
                  </div>
                </div>
              ))}
            </div>
          </AttachmentGroup>
        )}

        {audios.length > 0 && (
          <AttachmentGroup icon={Music} title="Audio" count={audios.length}>
            <div className="space-y-2">
              {audios.map((aud, idx) => (
                <div key={idx} className="rounded-lg border border-border p-2.5">
                  <p className="text-xs font-medium text-foreground mb-1.5 truncate">
                    {aud.filename || (aud.isVoiceNote ? "Voice note" : `Audio ${idx + 1}`)}
                  </p>
                  <audio src={aud.url} controls preload="metadata" className="w-full h-8" />
                </div>
              ))}
            </div>
          </AttachmentGroup>
        )}
      </div>
    </section>
  );
}

