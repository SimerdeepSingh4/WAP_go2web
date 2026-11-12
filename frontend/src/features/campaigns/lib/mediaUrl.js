import api from "@/api/client";

// Uploaded files are served by the backend, which may have a different origin.
export function campaignMediaUrl(media) {
  const raw = typeof media === "string" ? media : media?.url;
  if (!raw || typeof raw !== "string") return "";
  try {
    const backend = new URL(api.defaults.baseURL, window.location.origin);
    const url = new URL(raw, backend.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

export function normalizeCampaignMedia(items) {
  return (Array.isArray(items) ? items : []).map((media) => ({
    ...(media && typeof media === "object" ? media : {}),
    url: campaignMediaUrl(media),
  })).filter(media => media.url);
}
