import test from "node:test";
import assert from "node:assert/strict";
import { accountActionPayload, supportDate, supportMenuActions } from "./quickActions.js";

test("missing or invalid expiry values do not invent a date", () => {
  assert.equal(supportDate(null), "No expiry");
  assert.equal(supportDate("invalid"), "Unavailable");
});
test("account actions carry the reviewed version and never implicitly change status or credit expiry", () => {
  assert.deepEqual(accountActionPayload("extend-expiry", { updatedAt: "reviewed-version", status: "blocked" }, "2030-12-01"), { action: "extend-expiry", expectedUpdatedAt: "reviewed-version", expiresAt: "2030-12-01" });
  assert.deepEqual(accountActionPayload("unblock", { updatedAt: "reviewed-version", expiresAt: "2020-01-01" }), { action: "unblock", expectedUpdatedAt: "reviewed-version" });
});
test("context-menu tools follow role powers", () => {
  assert.deepEqual(supportMenuActions("User"), []);
  assert(supportMenuActions("Reseller").includes("escalate"));
  assert(!supportMenuActions("Reseller").includes("credit-validity"));
  assert(!supportMenuActions("Reseller").includes("ledger-audit"));
  assert(supportMenuActions("Super Admin").includes("credit-validity"));
  assert(supportMenuActions("Super Admin").includes("ledger-audit"));
  assert(!supportMenuActions("Super Admin").includes("escalate"));
});
