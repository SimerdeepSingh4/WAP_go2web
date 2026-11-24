import { resolveMediaUploadLimits } from "../../../../../shared/mediaUploadLimits.js";

export function mediaUploadSummary(account, defaults) {
  const limits = resolveMediaUploadLimits(account?.mediaUploadLimits, defaults);
  return `Image ${limits.imageMB} MB / Video ${limits.videoMB} MB / PDF ${limits.pdfMB} MB`;
}
