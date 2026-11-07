import assert from "node:assert/strict";
import test from "node:test";
import { actionLabel, affectedRecord, basicActivityDetails, changedFields, valueText } from "./src/features/admin/lib/auditFormat.js";

test("credit records describe the recorded event without presenting deleted entries as new transfers", () => {
  assert.equal(actionLabel({ action: "transaction.created", data: { after: { type: "ALLOCATE" } } }), "Credits added");
  assert.equal(actionLabel({ action: "transaction.deleted", data: { before: { type: "REFUND" } } }), "Credits returned record deleted");
  assert.equal(actionLabel({ action: "transaction.updated", data: { after: { type: "DEDUCT" } } }), "Credits used record updated");
});

test("a request starting does not claim that a change succeeded", () => {
  assert.equal(actionLabel({ action: "request.started" }), "Activity started");
  assert.equal(actionLabel({ action: "request.finished", data: { outcome: "rejected" } }), "Activity not completed");
});

test("deleted accounts and campaigns retain their human-readable names", () => {
  assert.equal(affectedRecord({ action: "user.deleted", data: { before: { username: "Riya" } } }), "Riya");
  assert.equal(affectedRecord({ action: "campaign.updated", data: { after: { campaignTitle: "Summer offer" } } }), "Summer offer");
});

test("credit units, missing values, and summarized lists are explained accurately", () => {
  assert.equal(valueText(1250, "balanceMinor"), "12.5 credits");
  assert.equal(valueText(false), "No");
  assert.equal(valueText(0), "0");
  assert.equal(valueText(null), "Not set");
  assert.equal(valueText("[redacted]"), "Hidden for privacy");
  assert.match(valueText({ count: 4, sha256: "fingerprint" }), /4 entries.*individual details are not stored/);
});

test("change summaries omit bookkeeping and duplicate units but preserve real changes", () => {
  assert.deepEqual(changedFields({ data: {
    before: { balance: 10, balanceMinor: 1000, isLocked: false, updatedAt: "old" },
    after: { balance: 5, balanceMinor: 500, isLocked: true, updatedAt: "new" },
  } }), ["balance", "isLocked"]);
  assert.deepEqual(changedFields({ data: { before: { balanceMinor: 1000 }, after: { balanceMinor: 500 } } }), ["balanceMinor"]);
});

test("basic credit details identify the campaign and amount without displaying database IDs", () => {
  const details = basicActivityDetails({ action: "transaction.created", data: { after: {
    amount: 32, campaignId: "6ae96a3caacdc8ca6d181395", notes: 'Campaign "Summer offer": 32 submitted numbers',
  } } });
  assert.deepEqual(details, [["Credits", "32"], ["Campaign", "Summer offer"], ["Description", 'Campaign "Summer offer": 32 submitted numbers']]);
});

test("deleted entries use saved details and missing campaign names have a reference fallback", () => {
  assert.deepEqual(basicActivityDetails({ action: "transaction.deleted", data: { before: {
    amount: 0, campaignId: "6ae96a3caacdc8ca6d181395",
  } } }), [["Credits", "0"], ["Campaign", "CMP-181395"]]);
});
