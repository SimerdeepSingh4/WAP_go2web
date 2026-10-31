import test from "node:test";
import assert from "node:assert/strict";
import { campaignTrend, campaignDistribution, deliveryMetrics } from "./analytics.js";
import { timeToWheelValue, wheelValueToTime, validateOperatingWindow } from "./operatingTime.js";
import { validateReport } from "./format.js";

test("campaign creation buckets use IST midnight and exclude drafts and invalid dates", () => {
  const rows = campaignTrend([
    { createdAt: "2026-10-30T18:29:59Z", status: "pending" },
    { createdAt: "2026-10-30T18:30:00Z", status: "pending" },
    { createdAt: "2026-10-31T00:00:00Z", status: "draft" },
    { createdAt: "invalid", status: "pending" },
  ], 2, new Date("2026-10-30T19:00:00Z"));
  assert.deepEqual(rows.map(({ key, Campaigns }) => [key, Campaigns]), [["2026-10-30", 1], ["2026-10-31", 1]]);
});

test("legacy sent status combines with completed while preserving every campaign", () => {
  const rows = campaignDistribution([{ status: "sent" }, { status: "completed" }, { status: "pending" }, { status: "new-status" }]);
  assert.equal(rows.find((row) => row.status === "completed").value, 2);
  assert.equal(rows.reduce((sum, row) => sum + row.value, 0), 4);
});

test("only published reports contribute to delivery metrics", () => {
  const result = deliveryMetrics([
    { campaignSummary: { sent: 900, delivered: 800 } },
    { campaignSummary: { reportedAt: "2026-10-31", sent: 20, delivered: 18, read: 12, failed: 2 } },
    { campaignSummary: { reportedAt: "2026-10-31", sent: 0, delivered: 0, read: 0, failed: 0 } },
  ]);
  assert.equal(result.reportCount, 2);
  assert.deepEqual(result.rows.map((row) => row.Messages), [20, 18, 12, 2]);
  assert.equal(deliveryMetrics([]).reportCount, 0);
});

test("wheel conversion preserves every minute including noon and midnight", () => {
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      assert.equal(wheelValueToTime(timeToWheelValue(time)), time);
    }
  }
});

test("operating window rejects equal, reversed, and invalid times", () => {
  assert.equal(validateOperatingWindow("09:00", "17:00"), "");
  for (const [start, end] of [["17:00", "09:00"], ["09:00", "09:00"], ["24:00", "25:00"], ["09:61", "17:00"]]) {
    assert.ok(validateOperatingWindow(start, end));
  }
});

test("reports reject missing, fractional, out-of-order, or over-audience metrics", () => {
  const valid = { sent: "100", delivered: "90", read: "60", failed: "10" };
  assert.equal(validateReport(valid, 100), "");
  for (const patch of [{ sent: "" }, { failed: "1.5" }, { read: "91" }, { sent: "101" }, { failed: "-1" }]) {
    assert.ok(validateReport({ ...valid, ...patch }, 100));
  }
});
