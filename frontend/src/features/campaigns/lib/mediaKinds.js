import { Image as ImageIcon, Video as VideoIcon, FileText } from "lucide-react";
import { DEFAULT_MEDIA_UPLOAD_LIMITS } from "../../../../../shared/mediaUploadLimits.js";

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
