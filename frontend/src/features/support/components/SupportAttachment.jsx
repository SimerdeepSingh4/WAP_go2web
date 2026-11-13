import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Download, FileAudio, FileText, Film, Image, Loader2 } from "lucide-react";
import { supportApi } from "@/features/support/services/support.api.js";
import { useAuth } from "@/features/auth/hooks/useAuth";

export default function SupportAttachment({ attachment }) {
  const { user } = useAuth();
  const [opened, setOpened] = useState(false);
  const media = useQuery({
    queryKey: ["support", user?.id || user?._id, "media", attachment._id],
    queryFn: ({ signal }) => supportApi.getAttachment(attachment._id, signal),
    enabled: opened, staleTime: Infinity, gcTime: 0, retry: false,
  });
  const attachUrl = useCallback(node => {
    if (!node || !media.data) return;
    const url = URL.createObjectURL(media.data);
    if (node.tagName === "A") node.href = url;
    else node.src = url;
    return () => URL.revokeObjectURL(url);
  }, [media.data]);
  const Icon = attachment.mediaType === "image" ? Image : attachment.mediaType === "video" ? Film : attachment.mediaType === "document" ? FileText : FileAudio;
  const size = attachment.sizeBytes < 1024 * 1024 ? `${Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB` : `${(attachment.sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  return <div className="support-attachment">
    <div className="support-attachment-header"><span className="support-attachment-icon"><Icon aria-hidden="true" /></span><span className="support-attachment-title"><strong title={attachment.originalName}>{attachment.originalName || `${attachment.mediaType} attachment`}</strong><small>{attachment.mediaType[0].toUpperCase() + attachment.mediaType.slice(1)} · {size}</small></span></div>
    {!opened && <button type="button" className="support-attachment-open" onClick={() => setOpened(true)}>{attachment.mediaType === "document" ? "Get file" : `Open ${attachment.mediaType}`}<ArrowUpRight aria-hidden="true" /></button>}
    {opened && media.isPending && <span role="status" className="flex items-center gap-2 text-xs"><Loader2 className="size-3 animate-spin" />Loading attachment…</span>}
    {media.isError && <div role="alert" className="text-xs">Attachment could not be loaded. <button type="button" className="underline" onClick={() => media.refetch()}>Retry</button></div>}
    {media.data && <>
      {attachment.mediaType === "image" ? <img ref={attachUrl} alt={attachment.originalName || "Shared image"} className="max-h-72 max-w-full rounded-lg object-contain" /> : attachment.mediaType === "video" ? <video ref={attachUrl} controls preload="metadata" className="max-h-72 max-w-full rounded-lg" /> : attachment.mediaType === "audio" ? <audio ref={attachUrl} controls preload="metadata" className="max-w-full" /> : null}
      <a ref={attachUrl} download={attachment.originalName || "attachment"} className="support-attachment-download"><Download aria-hidden="true" />Download file</a>
    </>}
  </div>;
}
