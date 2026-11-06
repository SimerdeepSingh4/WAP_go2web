export const number = (value) => value == null ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
export const dateTime = (value) => value && !Number.isNaN(new Date(value).getTime())
  ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
  : "—";
export const ownerName = (owner) => owner?.username || owner?.email || "Unavailable account";
export const statusLabels = {
  draft: "Draft",
  pending: "Pending",
  scheduled: "Scheduled",
  ongoing: "Ongoing",
  completed: "Completed",
  sent: "Completed",
  paused: "Paused",
  stopped: "Stopped",
  failed: "Failed",
  active: "Active",
  blocked: "Blocked",
  expired: "Expired",
};
export const waiting = (campaign) => ["pending", "scheduled"].includes(campaign.status);
export const needsReport = (campaign) => ["completed", "sent", "stopped", "failed"].includes(campaign.status) && !campaign.campaignSummary?.reportedAt;
export const published = (campaign) => Boolean(campaign.campaignSummary?.reportedAt);

export function validateReport(values, audience) {
  const entries = ["sent", "delivered", "read", "failed"];
  if (entries.some((key) => values[key] === "" || !Number.isSafeInteger(Number(values[key])) || Number(values[key]) < 0)) {
    return "Enter a non-negative whole number for every metric.";
  }
  const { sent, delivered, read, failed } = Object.fromEntries(entries.map((key) => [key, Number(values[key])]));
  if (read > delivered || delivered > sent) return "Read cannot exceed delivered, and delivered cannot exceed sent.";
  if ([sent, delivered, read, failed].some((value) => value > audience)) return "A metric cannot exceed the campaign audience.";
  return "";
}
