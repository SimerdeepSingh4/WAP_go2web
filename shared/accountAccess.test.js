import test from "node:test";
import assert from "node:assert/strict";
import { accountRestriction, accountAccessMessage, allowsRestrictedRequest } from "./accountAccess.js";

test("blocked status takes priority over expiry and preview keeps its existing permissions", () => {
  assert.equal(accountRestriction({ status: "blocked", isExpired: true }), "blocked");
  assert.equal(accountRestriction({ status: "expired" }), "expired");
  assert.equal(accountRestriction({ status: "active", expiresAt: "2026-01-01" }, Date.parse("2026-02-01")), "expired");
  assert.equal(accountRestriction({ status: "active", expiresAt: "2027-01-01" }, Date.parse("2026-02-01")), null);
  assert.equal(accountRestriction({ status: "blocked", isPreview: true }), null);
  assert.equal(accountRestriction(null), null);
});

test("restricted accounts can read data and contact support but cannot change workspace data", () => {
  const id = "6ae96a3caacdc8ca6d181311";
  for (const [method, baseUrl, path] of [
    ["GET", "/api/campaigns", "/"], ["GET", "/api/users", "/me"],
    ["GET", "/api/auth", "/me"], ["POST", "/api/auth", "/logout-all"],
    ["POST", "/api/users", "/exit-impersonation"], ["POST", "/api/support", "/conversations"],
    ["POST", "/api/support", `/conversations/${id}/messages`],
    ["POST", "/api/support", `/conversations/${id}/attachments`],
    ["POST", "/api/support", `/conversations/${id}/read`],
  ]) assert.equal(allowsRestrictedRequest({ method, baseUrl, path }), true, `${method} ${baseUrl}${path}`);
  for (const [method, baseUrl, path] of [
    ["POST", "/api/campaigns", "/"], ["POST", "/api/credits", "/allocate"],
    ["POST", "/api/credits", "/request"], ["PATCH", "/api/users", `/${id}/access`],
    ["DELETE", "/api/campaigns", `/${id}`], ["POST", "/api/auth", "/change-password"],
    ["POST", "/api/users", `/${id}/impersonate`], ["DELETE", "/api/support", `/conversations/${id}`],
    ["PATCH", "/api/support", `/conversations/${id}/status`],
    ["POST", "/api/support", `/conversations/${id}/escalate`],
    ["POST", "/api/support", `/conversations/${id}/messages/extra`],
  ]) assert.equal(allowsRestrictedRequest({ method, baseUrl, path }), false, `${method} ${baseUrl}${path}`);
});

test("contact messages request the right resolution for each account state", () => {
  assert.match(accountAccessMessage({ username: "TestUser", status: "blocked" }), /TestUser.*blocked.*explain the reason/);
  assert.match(accountAccessMessage({ username: "TestUser", status: "expired" }), /TestUser.*expired.*renew/);
  assert.equal(accountAccessMessage({ status: "active" }), "");
});
