import { useState } from "react";
import {
  Image as ImageIcon,
  File as FileIcon,
  Video as VideoIcon,
  Music,
  Download,
  ExternalLink,
  Eye,
  Paperclip,
  Loader2,
} from "lucide-react";
import api from "@/api/client";
import { toast } from "@/components/ui/toast";
import { normalizeCampaignMedia } from "../../lib/mediaUrl";
import "./campaign-attachments.css";

function formatBytes(bytes) {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function fileExt(name = "") {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toUpperCase().slice(0, 4) : "FILE";
}

function AttachmentGroup({ icon: Icon, title, count, fullWidth = false, children }) {
  return (
    <div className={"min-w-0 space-y-2" + (fullWidth ? " campaign-attachment-group-wide" : "")}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
        {title} <span className="tabular-nums">({count})</span>
      </p>
      {children}
    </div>
  );
}

function IconButton({ title, onClick, href, disabled = false, children }) {
  const className = "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className} title={title} aria-label={title}>{children}</a>
  ) : (
    <button type="button" onClick={onClick} disabled={disabled} className={className} title={title} aria-label={title}>{children}</button>
  );
}

function DocumentActions({ campaignId, document, name, onDownloadMedia }) {
  const [pending, setPending] = useState(null);
  const isCloudinary = document._id && document.url.startsWith("https://res.cloudinary.com/");

  async function retrieve(action) {
    if (pending) return;
    const preview = action === "open" ? window.open("about:blank", "_blank") : null;
    if (action === "open" && !preview) {
      toast.add({ title: "Allow pop-ups to preview this PDF", type: "error" });
      return;
    }
    if (preview) {
      preview.opener = null;
      preview.document.title = "Opening PDF…";
      preview.document.body.textContent = "Opening PDF…";
    }
    setPending(action);
    try {
      const response = await api.get("/campaigns/" + campaignId + "/documents/" + document._id, { responseType: "blob", timeout: 40000 });
      const file = response.data;
      if (await file.slice(0, 5).text() !== "%PDF-") throw new Error("The attachment did not contain a valid PDF.");
      if (preview?.closed) return;
      const url = URL.createObjectURL(new Blob([file], { type: "application/pdf" }));
      if (preview) {
        preview.location.replace(url);
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const link = window.document.createElement("a");
        link.href = url;
        link.download = name;
        window.document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (error) {
      preview?.close();
      let message = error.message || "Please try again.";
      if (error.response?.data instanceof Blob) {
        try { message = JSON.parse(await error.response.data.text()).message || message; }
        catch { /* Keep the original error when storage is unavailable. */ }
      }
      toast.add({ title: "Could not open PDF", description: message, type: "error" });
    } finally { setPending(null); }
  }

  if (!isCloudinary) return <>
    <IconButton href={document.url} title="Open document in new tab"><ExternalLink className="size-3.5" /></IconButton>
    <IconButton onClick={() => onDownloadMedia(document.url, name)} title="Download document"><Download className="size-3.5" /></IconButton>
  </>;

  return <>
    <IconButton onClick={() => retrieve("open")} disabled={Boolean(pending)} title="Open document in new tab">
      {pending === "open" ? <Loader2 className="size-3.5 animate-spin" /> : <ExternalLink className="size-3.5" />}
    </IconButton>
    <IconButton onClick={() => retrieve("download")} disabled={Boolean(pending)} title="Download document">
      {pending === "download" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
    </IconButton>
  </>;
}

function FileDetails({ name, size, type, children }) {
  return (
    <div className="grid min-h-[76px] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3">
      <div className="min-w-0">
        <p className="line-clamp-2 text-xs font-medium leading-4 text-foreground [overflow-wrap:anywhere]" title={name}>{name}</p>
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{[type, formatBytes(size)].filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">{children}</div>
    </div>
  );
}

export default function CampaignAttachmentsView({ campaign, onPreviewImage, onDownloadMedia }) {
  const images = normalizeCampaignMedia(campaign.images);
  const documents = normalizeCampaignMedia(campaign.documents);
  const videos = normalizeCampaignMedia(campaign.video);
  const audios = normalizeCampaignMedia(campaign.audio);
  const attachmentsCount = images.length + documents.length + videos.length + audios.length;

  return (
    <section data-tour="campaign-attachments" className="campaign-attachments min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Attachments</h2>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {attachmentsCount ? attachmentsCount + (attachmentsCount === 1 ? " file" : " files") : "None"}
        </span>
      </div>

      <div className="campaign-attachments-body">
        {!attachmentsCount && (
          <div className="campaign-attachment-group-wide flex items-center gap-3 rounded-lg bg-muted/30 px-3 py-4 text-xs text-muted-foreground">
            <Paperclip className="size-4 shrink-0 text-muted-foreground/60" />
            <div className="space-y-1"><p className="font-medium text-foreground">No attachments</p><p className="text-[11px]">No media files were added.</p></div>
          </div>
        )}

        {images.length > 0 && (
          <AttachmentGroup icon={ImageIcon} title="Images" count={images.length} fullWidth={!videos.length}>
            <div className="grid min-w-0 gap-3">
              {images.map((img, index) => {
                const name = img.filename || "Image " + (index + 1);
                return (
                  <div key={img._id || img.url} className="min-w-0 overflow-hidden rounded-lg border border-border">
                    <button
                      type="button"
                      className="campaign-attachment-preview block cursor-zoom-in border-b border-border focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      onClick={() => onPreviewImage(img.url)}
                      aria-label={"Preview " + name}
                    >
                      <img src={img.url} alt={img.caption || name} loading="lazy" className="p-2" />
                    </button>
                    <FileDetails name={img.caption || name} size={img.size} type="Image">
                      <IconButton onClick={() => onPreviewImage(img.url)} title="Preview image"><Eye className="size-3.5" /></IconButton>
                      <IconButton onClick={() => onDownloadMedia(img.url, img.filename || "image-" + (index + 1) + ".jpg")} title="Download image"><Download className="size-3.5" /></IconButton>
                    </FileDetails>
                  </div>
                );
              })}
            </div>
          </AttachmentGroup>
        )}

        {videos.length > 0 && (
          <AttachmentGroup icon={VideoIcon} title="Videos" count={videos.length} fullWidth={!images.length}>
            <div className="grid min-w-0 gap-3">
              {videos.map((video, index) => (
                <div key={video._id || video.url} className="min-w-0 overflow-hidden rounded-lg border border-border">
                  <div className="campaign-attachment-preview border-b border-border">
                    <video src={video.url} controls playsInline preload="metadata" />
                  </div>
                  <FileDetails name={video.filename || "Video " + (index + 1)} size={video.size} type="Video">
                    <IconButton onClick={() => onDownloadMedia(video.url, video.filename || "video.mp4")} title="Download video"><Download className="size-3.5" /></IconButton>
                  </FileDetails>
                </div>
              ))}
            </div>
          </AttachmentGroup>
        )}

        {documents.length > 0 && (
          <AttachmentGroup icon={FileIcon} title="Documents" count={documents.length} fullWidth>
            <div className="grid min-w-0 gap-3">
              {documents.map((doc, index) => {
                const name = doc.filename || "Document " + (index + 1);
                return (
                  <div key={doc._id || doc.url} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center rounded-lg border border-border pl-3">
                    <div className="grid size-9 shrink-0 place-items-center rounded-md bg-destructive/5 text-[10px] font-semibold text-destructive">
                      {doc.mimetype === "application/pdf" ? "PDF" : fileExt(name)}
                    </div>
                    <FileDetails name={name} size={doc.size} type="Document">
                      <DocumentActions campaignId={campaign._id} document={doc} name={name} onDownloadMedia={onDownloadMedia} />
                    </FileDetails>
                  </div>
                );
              })}
            </div>
          </AttachmentGroup>
        )}

        {audios.length > 0 && (
          <AttachmentGroup icon={Music} title="Audio" count={audios.length} fullWidth>
            <div className="grid min-w-0 gap-3">
              {audios.map((audio, index) => (
                <div key={audio._id || audio.url} className="min-w-0 overflow-hidden rounded-lg border border-border">
                  <FileDetails name={audio.filename || (audio.isVoiceNote ? "Voice note" : "Audio " + (index + 1))} size={audio.size} type="Audio">
                    <IconButton onClick={() => onDownloadMedia(audio.url, audio.filename || "audio.mp3")} title="Download audio"><Download className="size-3.5" /></IconButton>
                  </FileDetails>
                  <audio src={audio.url} controls preload="metadata" className="block h-10 w-full min-w-0 px-3 pb-2" />
                </div>
              ))}
            </div>
          </AttachmentGroup>
        )}
      </div>
    </section>
  );
}

