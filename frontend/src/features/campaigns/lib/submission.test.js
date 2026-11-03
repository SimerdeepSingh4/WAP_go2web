import test from "node:test";
import assert from "node:assert/strict";
import { campaignEstimate, parseRecipients } from "./submission.js";

test("review charges the actual account rate and detects insufficient funds", () => {
  assert.deepEqual(campaignEstimate({ role: "User", ratePerMsg: 2.5, balance: 10, recipients: 5 }), { rate: 2.5, cost: 12.5, remaining: -2.5, insufficient: true });
  assert.equal(campaignEstimate({ role: "Reseller", ratePerMsg: 4, balance: 12, recipients: 3 }).insufficient, false);
});
test("admin submission is free and missing rates follow the existing server fallback", () => {
  assert.deepEqual(campaignEstimate({ role: "Super Admin", balance: 0, recipients: 100 }), { rate: 0, cost: 0, remaining: null, insufficient: false });
  assert.equal(campaignEstimate({ role: "User", ratePerMsg: 0, balance: 50, recipients: 2 }).cost, 24);
});
test("review recipient count matches server length validation and deduplication", () => {
  assert.deepEqual(parseRecipients('+91 98765 43210\n919876543210,12345678;1234567890\t1234567890123456'), { validRecipients: ['919876543210', '1234567890'], duplicatesCount: 1, invalidCount: 2 });
  assert.deepEqual(parseRecipients(''), { validRecipients: [], duplicatesCount: 0, invalidCount: 0 });
});
