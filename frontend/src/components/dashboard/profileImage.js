export function resolveUserImageUrl(value) {
  if (!value) return "";
  try {
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
    const apiOrigin = new URL(apiBase, window.location.origin).origin;
    return new URL(value, apiOrigin).href;
  } catch {
    return value;
  }
}
