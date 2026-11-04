import test from "node:test";
import assert from "node:assert/strict";
import { filterCampaignRecipients, isExcludedRecipient } from "./filterRecipients.js";

test("filter normalizes duplicate comparisons, checks custom categories and preserves original row numbers", () => {
  const entries = [
    { rowNumber: 1, phoneNumber: "+91 9876543210", tabKey: "vip" },
    { rowNumber: 2, phoneNumber: "919876543210", tabKey: "vip" },
    { rowNumber: 3, phoneNumber: "123", tabKey: "vip" },
    { rowNumber: 4, phoneNumber: "919876543211", tabKey: "wrong" },
    { rowNumber: 5, phoneNumber: "919876543212", tabKey: "all" },
  ];
  const result = filterCampaignRecipients(entries);
  assert.equal(result.cleanCount, 2);
  assert.equal(result.wrongCount, 2);
  assert.equal(result.duplicateCount, 1);
  assert.deepEqual(result.updatedEntries.map((entry) => entry.rowNumber), [1, 2, 3, 4, 5]);
  assert.equal(result.updatedEntries[0], entries[0]);
  assert.equal(result.updatedEntries[1].billingAction, "refund");
  assert.equal(result.updatedEntries.filter((entry) => !isExcludedRecipient(entry)).length, 2);
  assert.equal(entries[2].tabKey, "vip");
});

test("already excluded numbers are counted and repeated filtering is stable", () => {
  const entries = [
    { rowNumber: 1, phoneNumber: "919876543210", tabKey: "all" },
    { rowNumber: 2, phoneNumber: "919876543210", tabKey: "duplicate" },
    { rowNumber: 3, phoneNumber: "123", tabKey: "wrong" },
  ];
  const first = filterCampaignRecipients(entries);
  assert.equal(first.wrongCount, 1);
  assert.equal(first.duplicateCount, 1);
  assert.deepEqual(filterCampaignRecipients(first.updatedEntries), first);
});

test("non-WhatsApp classification uses verified category variants, without guessing from generic failures", () => {
  const entries = [
    { rowNumber: 1, phoneNumber: "919876543210", status: "failed" },
    { rowNumber: 2, phoneNumber: "919876543211" },
    { rowNumber: 3, phoneNumber: "919876543212" },
  ];
  const result = filterCampaignRecipients(entries, [
    { phoneNumber: "919876543211", category: "Non-WhatsApp" },
    { phoneNumber: "919876543212", category: "not_on_whatsapp" },
  ]);
  assert.equal(result.nonWhatsAppCount, 2);
  assert.equal(result.cleanCount, 1);
  assert.equal(result.updatedEntries[0], entries[0]);
  assert.equal(filterCampaignRecipients([]).cleanCount, 0);
});
