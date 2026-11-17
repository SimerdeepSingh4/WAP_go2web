import test from "node:test";
import assert from "node:assert/strict";
import { whiteLabelAccessPayload, whiteLabelAccessState } from "./whiteLabelAccess.js";
import { accessExpiryForDate } from "../../accounts/lib/accessExpiry.js";

const now = Date.parse("2026-11-16T10:00:00.000Z");

test("white-label access distinguishes disabled, active, and expired permissions", () => {
  assert.equal(whiteLabelAccessState({ enabled: false, expiresAt: "2020-01-01" }, now), "disabled");
  assert.equal(whiteLabelAccessState({ enabled: true, expiresAt: null }, now), "active");
  assert.equal(whiteLabelAccessState({ enabled: true, expiresAt: new Date(now).toISOString() }, now), "expired");
  assert.equal(whiteLabelAccessState({ enabled: true, expiresAt: new Date(now + 1).toISOString() }, now), "active");
});

test("keeping an active expiry preserves its exact saved timestamp", () => {
  const current = { enabled: true, expiresAt: "2027-05-01T09:14:15.345Z" };
  assert.deepEqual(whiteLabelAccessPayload({ intent: "expiry", current, duration: "keep", now }), current);
});

test("renewal requires a new duration and cannot keep an expired date", () => {
  const current = { enabled: true, expiresAt: "2020-01-01T00:00:00Z" };
  assert.throws(() => whiteLabelAccessPayload({ intent: "renew", current, duration: "", now }), /Choose an access duration/);
  assert.throws(() => whiteLabelAccessPayload({ intent: "renew", current, duration: "keep", now }), /new access duration/);
});

test("preset durations retain the existing 30, 90, 180, and 365 day rules", () => {
  for (const [duration, days] of [["30days", 30], ["90days", 90], ["6months", 180], ["1year", 365]]) {
    assert.deepEqual(whiteLabelAccessPayload({ intent: "renew", duration, now }), { enabled: true, expiresAt: new Date(now + days * 86400000).toISOString() });
  }
});

test("custom expiry follows the existing UTC end-of-day rule", () => {
  assert.equal(accessExpiryForDate("2026-11-16", now), "2026-11-16T23:59:59.999Z");
  assert.deepEqual(whiteLabelAccessPayload({ intent: "enable", duration: "custom", date: "2027-01-01", now }), { enabled: true, expiresAt: "2027-01-01T23:59:59.999Z" });
});

test("missing, malformed, impossible, and past dates are rejected before saving", () => {
  for (const date of ["", "bad-date", "2027-02-31", "2026-11-15"]) assert.throws(() => accessExpiryForDate(date, now));
});

test("disabling and explicitly choosing no expiry retain the API payload contract", () => {
  assert.deepEqual(whiteLabelAccessPayload({ intent: "disable", now }), { enabled: false, expiresAt: null });
  assert.deepEqual(whiteLabelAccessPayload({ intent: "renew", duration: "never", now }), { enabled: true, expiresAt: null });
  assert.throws(() => whiteLabelAccessPayload({ intent: "unknown", duration: "never", now }));
});
