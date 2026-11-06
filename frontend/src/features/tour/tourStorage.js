export const TOUR_VERSION = "v2";

export function getTourKey(role, userId, pageId = "overview") {
  const roleSlug = (role || "user").toLowerCase().replace(/\s+/g, "-");
  return `${roleSlug}-tour:${TOUR_VERSION}:${userId ?? "anonymous"}:${pageId}`;
}

export function getTourStatus(role, userId, pageId) {
  try {
    return window.localStorage.getItem(getTourKey(role, userId, pageId));
  } catch {
    return null;
  }
}

export function setTourStatus(role, userId, status, pageId) {
  try {
    const key = getTourKey(role, userId, pageId);
    if (status) window.localStorage.setItem(key, status);
    else window.localStorage.removeItem(key);
  } catch {
    // Tours remain usable if browser storage is blocked or full.
  }
}

export function isTourDismissed(role, userId, pageId) {
  return ["completed", "skipped"].includes(getTourStatus(role, userId, pageId));
}
