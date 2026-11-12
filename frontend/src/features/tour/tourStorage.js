export const TOUR_VERSION = "v2";

function getAutoTourKey(role, userId) {
  const roleSlug = (role || "user").toLowerCase().replace(/\s+/g, "-");
  // A guide revision must not undo an explicit choice to skip automatic tours.
  return `${roleSlug}-tour:auto-disabled:${userId ?? "anonymous"}`;
}

export function isTourAutoDisabled(role, userId) {
  try {
    const storage = window.localStorage;
    const key = getAutoTourKey(role, userId);
    if (storage.getItem(key) === "true") return true;
    // Honor page tours skipped before the workspace preference was introduced.
    const prefix = getTourKey(role, userId, "");
    for (let index = 0; index < storage.length; index++) {
      const pageKey = storage.key(index);
      if (pageKey?.startsWith(prefix) && storage.getItem(pageKey) === "skipped") {
        try { storage.setItem(key, "true"); } catch { /* The saved page dismissal is sufficient. */ }
        return true;
      }
    }
  } catch {
    // In-memory dismissal in useAppTour still works when storage is unavailable.
  }
  return false;
}

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
    if (status === "skipped") window.localStorage.setItem(getAutoTourKey(role, userId), "true");
    if (status) window.localStorage.setItem(key, status);
    else window.localStorage.removeItem(key);
  } catch {
    // Tours remain usable if browser storage is blocked or full.
  }
}

export function isTourDismissed(role, userId, pageId) {
  return ["completed", "skipped"].includes(getTourStatus(role, userId, pageId));
}
