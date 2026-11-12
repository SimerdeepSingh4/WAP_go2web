export function resolveUserImageUrl(value) {
  if (!value) return "";
  const imagePath = String(value).trim();
  if (/\/(?:api\/)?users\/me\/dp-image(?:[?#]|$)/i.test(imagePath)) return "";
  try {
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
    const apiOrigin = new URL(apiBase, window.location.origin).origin;
    return new URL(imagePath, apiOrigin).href;
  } catch {
    return imagePath;
  }
}
