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
  assert.deepEqual(parseRecipients('+91 98765 43210\n919876543210,12345678;1234567890\t1234567890123456'), { validRecipients: ['919876543210', '1234567890'], duplicatesCount: 1, invalidCount: 2, enteredCount: 5 });
  assert.deepEqual(parseRecipients(''), { validRecipients: [], duplicatesCount: 0, invalidCount: 0, enteredCount: 0 });
});

test("lists larger than eleven count every unique phone across supported separators", () => {
  const phones = Array.from({ length: 25 }, (_, index) => String(919876543200 + index));
  for (const separator of ["\n", " ", ",", ";", "\t"]) {
    const result = parseRecipients(phones.join(separator));
    assert.equal(result.validRecipients.length, 25, `Separator ${JSON.stringify(separator)}`);
    assert.equal(result.enteredCount, 25);
    assert.equal(result.invalidCount, 0);
  }
});

test("credit estimates charge every entered occurrence, including repeats", () => {
  const phones = Array.from({ length: 11 }, (_, index) => String(919876543200 + index));
  const result = parseRecipients([...phones, ...phones].join("\n"));
  assert.equal(result.enteredCount, 22);
  assert.equal(result.validRecipients.length, 11);
  assert.equal(result.duplicatesCount, 11);
  assert.equal(campaignEstimate({ role: "User", ratePerMsg: 1, balance: 100, recipients: result.enteredCount }).cost, 22);
});
