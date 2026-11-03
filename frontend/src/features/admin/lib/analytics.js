import { published, statusLabels } from "./format.js";

const DAY = 86_400_000;
const IST_OFFSET = 330 * 60_000;

function istDay(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? new Date(timestamp + IST_OFFSET).toISOString().slice(0, 10) : null;
}

// createdAt is the available timestamp; it must not be presented as execution time.
export function campaignTrend(campaigns, days = 14, now = new Date()) {
  const today = Date.parse(`${istDay(now)}T00:00:00Z`);
  const rows = Array.from({ length: days }, (_, index) => {
    const key = new Date(today - (days - index - 1) * DAY).toISOString().slice(0, 10);
    return { key, date: new Date(`${key}T12:00:00+05:30`), Campaigns: 0 };
  });
  const byDay = new Map(rows.map((row) => [row.key, row]));
  campaigns.forEach((campaign) => {
    const row = byDay.get(istDay(campaign.createdAt));
    if (row && campaign.status !== "draft") row.Campaigns += 1;
  });
  return rows;
}

export function campaignDistribution(campaigns) {
  const colors = { pending: "#c59239", scheduled: "#8a9fb4", ongoing: "#6D8196", completed: "#000080", paused: "#857493", stopped: "#5a6875", failed: "#b63832", draft: "#ADD8E6" };
  const counts = new Map(Object.keys(colors).map((status) => [status, 0]));
  campaigns.forEach(({ status }) => {
    const key = status === "sent" ? "completed" : status;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts].filter(([, value]) => value > 0).map(([status, value]) => ({ status, label: statusLabels[status] || "Other", value, color: colors[status] || "#7b807d" }));
}

export function deliveryMetrics(campaigns) {
  const reports = campaigns.filter(published);
  return {
    reportCount: reports.length,
    rows: ["sent", "delivered", "read", "failed"].map((metric) => ({
      name: metric.charAt(0).toUpperCase() + metric.slice(1),
      Messages: reports.reduce((total, campaign) => total + (Number(campaign.campaignSummary[metric]) || 0), 0),
    })),
  };
}
