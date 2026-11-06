/**
 * Tour Storage Manager
 * 
 * Versioned key format: e.g. super-admin-tour:v1:${userId}
 * Statuses:
 * - "completed": User finished all steps of the tour
 * - "skipped": User explicitly clicked "Skip tour"
 * - unset (null): User closed halfway or has not seen the tour yet
 * 
 * Change TOUR_VERSION from "v1" to "v2" when you want everyone to see a substantially updated tour.
 */

export const TOUR_VERSION = "v1";

export function getTourKey(role, userId) {
  const roleSlug = role ? role.toLowerCase().replace(/\s+/g, "-") : "user";
  const id = userId ? String(userId) : "anonymous";
  return `${roleSlug}-tour:${TOUR_VERSION}:${id}`;
}

export function getTourStatus(role, userId) {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const key = getTourKey(role, userId);
  return window.localStorage.getItem(key);
}

export function setTourStatus(role, userId, status) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const key = getTourKey(role, userId);
  if (status) {
    window.localStorage.setItem(key, status);
  } else {
    window.localStorage.removeItem(key);
  }
}

export function isTourDismissed(role, userId) {
  const status = getTourStatus(role, userId);
  return status === "completed" || status === "skipped";
}
