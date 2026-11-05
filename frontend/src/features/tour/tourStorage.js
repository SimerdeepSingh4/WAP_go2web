/**
 * Tour Storage Manager
 * Tracks whether a user has seen the tour on this device and/or account.
 */

export function hasSeenTour(role, userId) {
  if (typeof window === "undefined" || !window.localStorage) return false;
  const deviceKey = `tour_seen_device_${role}`;
  const userKey = userId ? `tour_seen_user_${userId}` : null;

  const seenOnDevice = window.localStorage.getItem(deviceKey) === "true";
  const seenOnUser = userKey ? window.localStorage.getItem(userKey) === "true" : false;

  return seenOnDevice || seenOnUser;
}

export function markTourSeen(role, userId) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const deviceKey = `tour_seen_device_${role}`;
  window.localStorage.setItem(deviceKey, "true");

  if (userId) {
    const userKey = `tour_seen_user_${userId}`;
    window.localStorage.setItem(userKey, "true");
  }
}

export function resetTourSeen(role, userId) {
  if (typeof window === "undefined" || !window.localStorage) return;
  const deviceKey = `tour_seen_device_${role}`;
  window.localStorage.removeItem(deviceKey);

  if (userId) {
    const userKey = `tour_seen_user_${userId}`;
    window.localStorage.removeItem(userKey);
  }
}
