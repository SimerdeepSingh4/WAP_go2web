const key = userId => `review-pin-resolver-name:${userId}`;

export function readResolverName(userId) {
  if (!userId) return "";
  try { return localStorage.getItem(key(userId))?.trim().slice(0, 120) || ""; }
  catch { return ""; }
}

export function rememberResolverName(userId, name) {
  if (!userId) return;
  try { localStorage.setItem(key(userId), name.trim()); }
  catch { /* The current session still remembers the name when storage is unavailable. */ }
}
