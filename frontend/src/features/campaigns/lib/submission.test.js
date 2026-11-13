import test from "node:test";
import assert from "node:assert/strict";
import { campaignEstimate, parseRecipients, splitRecipientInput, recipientEditError } from "./submission.js";
import { recipientMarkTokens, recipientNumberFlags } from "./recipientInputAudit.js";

test("review charges the actual account rate and detects insufficient funds", () => {
  assert.deepEqual(campaignEstimate({ role: "User", ratePerMsg: 2.5, balance: 10, recipients: 5 }), { rate: 2.5, cost: 12.5, remaining: -2.5, insufficient: true });
  assert.equal(campaignEstimate({ role: "Reseller", ratePerMsg: 4, balance: 12, recipients: 3 }).insufficient, false);
});
test("admin submission is free and missing rates follow the existing server fallback", () => {
  assert.deepEqual(campaignEstimate({ role: "Super Admin", balance: 0, recipients: 100 }), { rate: 0, cost: 0, remaining: null, insufficient: false });
  assert.equal(campaignEstimate({ role: "User", ratePerMsg: 0, balance: 50, recipients: 2 }).cost, 24);
});
test("review reports invalid line numbers without repairing or discarding invalid input", () => {
  const raw = '919876543210\n\n91987654321\n9198765432100\n449876543210\n+919876543210\n919876543210';
  const result = parseRecipients(raw);
  assert.deepEqual(result.validRecipients, ['919876543210']);
  assert.equal(result.duplicatesCount, 1);
  assert.equal(result.invalidCount, 4);
  assert.equal(result.enteredCount, 6);
  assert.deepEqual(result.invalidEntries.map(entry => entry.lineNumber), [3, 4, 5, 6]);
  assert.match(result.invalidEntries[0].message, /11 digits/);
  assert.match(result.invalidEntries[1].message, /13 digits/);
  assert.match(result.invalidEntries[2].message, /start with 91/);
  assert.deepEqual(splitRecipientInput(raw), raw.split('\n').filter(Boolean));
  assert.deepEqual(parseRecipients(''), { validRecipients: [], duplicatesCount: 0, invalidCount: 0, invalidEntries: [], enteredCount: 0 });
});

test("large lists accept newline variants and reject multiple numbers on one line", () => {
  const phones = Array.from({ length: 25 }, (_, index) => String(919876543200 + index));
  for (const separator of ["\n", "\r\n", "\r"]) {
    const result = parseRecipients(phones.join(separator));
    assert.equal(result.validRecipients.length, 25, `Separator ${JSON.stringify(separator)}`);
    assert.equal(result.enteredCount, 25);
    assert.equal(result.invalidCount, 0);
  }
  for (const separator of [" ", ",", ";", "\t"]) {
    const result = parseRecipients(phones.join(separator));
    assert.equal(result.validRecipients.length, 0);
    assert.equal(result.invalidCount, 1);
    assert.equal(result.enteredCount, 1);
  }
});

test("recipient audit positions match submitted rows after blank lines and invalid separators", () => {
  const raw = '\n919876543210\r\n \n919876543211,919876543212\n919876543213';
  const rows = recipientMarkTokens(raw);
  assert.deepEqual(rows.map(row => row.value), splitRecipientInput(raw));
  for (const row of rows) assert.equal(raw.slice(row.start, row.end), row.value);
  assert.deepEqual(recipientNumberFlags(rows.map(row => ({ ...row, source: 'manual' }))), [[1, 1], [2, 1], [3, 1]]);
});

test("editing allows partial digits and prefix correction but rejects non-digits and a thirteenth digit", () => {
  for (const text of ['', '9', '91', '44', '449876543210', '919876543210\n919876543211', '91\r\n919']) {
    assert.equal(recipientEditError(text), null);
  }
  for (const text of ['9198765432100', '919876543210\n9198765432100', '+919876543210', '91a', '91 98', '919876543210,919876543211', '\t', '９１']) {
    assert(recipientEditError(text), `Must reject ${JSON.stringify(text)}`);
  }
  assert.equal(recipientEditError('919876543210\n9198765432100').lineNumber, 2);
  assert.match(parseRecipients('44').invalidEntries[0].message, /start with 91/);
});

test("credit estimates charge every entered occurrence, including repeats", () => {
  const phones = Array.from({ length: 11 }, (_, index) => String(919876543200 + index));
  const result = parseRecipients([...phones, ...phones].join("\n"));
  assert.equal(result.enteredCount, 22);
  assert.equal(result.validRecipients.length, 11);
  assert.equal(result.duplicatesCount, 11);
  assert.equal(campaignEstimate({ role: "User", ratePerMsg: 1, balance: 100, recipients: result.enteredCount }).cost, 22);
});
