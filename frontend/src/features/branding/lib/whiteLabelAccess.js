import { accessExpiryForDate } from "../../accounts/lib/accessExpiry.js";

export function whiteLabelAccessState(access = {}, now = Date.now()) {
  if (!access.enabled) return "disabled";
  return access.expiresAt && new Date(access.expiresAt).getTime() <= now ? "expired" : "active";
}

export function whiteLabelAccessPayload({ intent, current = {}, duration, date, now = Date.now() }) {
  if (intent === "disable") return { enabled: false, expiresAt: null };
  if (!["enable", "renew", "expiry"].includes(intent)) throw new Error("Choose an access action.");
  if (duration === "keep") {
    if (intent !== "expiry" || whiteLabelAccessState(current, now) !== "active") throw new Error("Choose a new access duration to renew access.");
    return { enabled: true, expiresAt: current.expiresAt || null };
  }
  if (duration === "never") return { enabled: true, expiresAt: null };
  if (duration === "custom") return { enabled: true, expiresAt: accessExpiryForDate(date, now) };
  const days = { "30days": 30, "90days": 90, "6months": 180, "1year": 365 }[duration];
  if (!days) throw new Error("Choose an access duration.");
  return { enabled: true, expiresAt: new Date(now + days * 86400000).toISOString() };
}
