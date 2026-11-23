import test from "node:test";
import assert from "node:assert/strict";
import { campaignEstimate, parseRecipients, splitRecipientInput, recipientEditError } from "./submission.js";
import { recipientMarkTokens, recipientNumberFlags } from "./recipientInputAudit.js";

test("review charges one Campaign Credit per row and checks the category balance", () => {
  assert.deepEqual(campaignEstimate({ role: "User", ratePerMsg: 2.5, balance: 100, availableCredits: 4, recipients: 5 }), { rate: 1, cost: 5, remaining: -1, insufficient: true, available: 4 });
  assert.equal(campaignEstimate({ role: "Reseller", availableCredits: 3, recipients: 3 }).insufficient, false);
});
test("Super Admin submission is exempt and buyers need no legacy rate", () => {
  assert.deepEqual(campaignEstimate({ role: "Super Admin", availableCredits: 0, recipients: 100 }), { rate: 1, cost: 0, remaining: null, insufficient: false, available: 0 });
  assert.equal(campaignEstimate({ role: "User", availableCredits: 50, recipients: 2 }).cost, 2);
});
test("review accepts 10 to 12 digits and reports invalid line numbers", () => {
  const raw = '919876543210\n\n91987654321\n9198765432\n9198765432100\n987654321\n+919876543210\n919876543210';
  const result = parseRecipients(raw);
  assert.deepEqual(result.validRecipients, ['919876543210', '91987654321', '9198765432']);
  assert.equal(result.duplicatesCount, 1);
  assert.equal(result.invalidCount, 3);
  assert.equal(result.enteredCount, 7);
  assert.deepEqual(result.invalidEntries.map(entry => entry.lineNumber), [5, 6, 7]);
  assert.match(result.invalidEntries[0].message, /13 digits/);
  assert.match(result.invalidEntries[1].message, /9 digits/);
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
  assert.match(parseRecipients('44').invalidEntries[0].message, /2 digits/);
});

test("credit estimates charge every entered occurrence, including repeats", () => {
  const phones = Array.from({ length: 11 }, (_, index) => String(919876543200 + index));
  const result = parseRecipients([...phones, ...phones].join("\n"));
  assert.equal(result.enteredCount, 22);
  assert.equal(result.validRecipients.length, 11);
  assert.equal(result.duplicatesCount, 11);
  assert.equal(campaignEstimate({ role: "User", ratePerMsg: 1, balance: 100, recipients: result.enteredCount }).cost, 22);
});
