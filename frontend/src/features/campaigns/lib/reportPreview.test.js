import { test } from "node:test";
import assert from "node:assert/strict";
import { BASE_COLUMNS } from "../../../../../shared/campaignSpreadsheet.js";
import { buildCampaignReportPreview } from "./reportPreview.js";
import { normalizeDuplicateRows } from "../../../../../shared/campaignSpreadsheet.js";

test("duplicates refer to the first permanent index, preserving row order and manual notes on repeated saves", () => {
  const entries = [
    { rowNumber: 20, phoneNumber: "+91 9876543210", tabKey: "duplicate", notes: "Checked" },
    { rowNumber: 6, phoneNumber: "919876543210", tabKey: "delivered", status: "delivered", billingAction: "keep" },
  ];
  const result = normalizeDuplicateRows(entries);
  assert.deepEqual(result.map((row) => row.rowNumber), [20, 6]);
  assert.equal(result[0].notes, "Checked\nAlready listed in row 6.");
  assert.equal(result[0].category, "Duplicate number");
  assert.equal(result[1].billingAction, "keep");
  assert.deepEqual(normalizeDuplicateRows(result), result);
  assert.equal(entries[0].notes, "Checked");
});

test("review uses saved campaign rows, names, formulas and notes instead of an older publication", () => {
  const campaign = {
    creditsDeducted: 10, rateSnapshot: 2, draftReportNotes: "New report note",
    publishedSpreadsheet: { rows: [{ rowNumber: 1 }], notes: "Old note" },
    spreadsheetColumns: [...BASE_COLUMNS, { id: "length", label: "Digits", letter: "F", formula: "=LEN(A{row})" }],
    recipientEntries: [
      { rowNumber: 8, phoneNumber: "919876543210", status: "delivered", category: "Custom delivered name", billingAction: "keep" },
      { rowNumber: 20, phoneNumber: "919876543211", status: "failed", category: "Wrong", billingAction: "refund" },
    ],
  };
  const sheet = buildCampaignReportPreview(campaign).publishedSpreadsheet;
  assert.deepEqual(sheet.rows.map((row) => row.rowNumber), [8, 20]);
  assert.equal(sheet.rows[0].values.category, "Custom delivered name");
  assert.equal(sheet.rows[0].values.length, 12);
  assert.equal(sheet.notes, "New report note");
  assert.equal(sheet.summary.delivered, 1);
  assert.equal(sheet.summary.creditsRefunded, 2);
  assert.equal(campaign.publishedSpreadsheet.notes, "Old note");
});

test("preview caps refunds like publication and preserves an explicitly cleared note", () => {
  const sheet = buildCampaignReportPreview({
    creditsDeducted: 1, rateSnapshot: 2, draftReportNotes: "",
    campaignSummary: { adminNotes: "Previous note" },
    recipientEntries: [{ rowNumber: 4, phoneNumber: "919876543210", billingAction: "refund" }],
  }).publishedSpreadsheet;
  assert.equal(sheet.summary.creditsRefunded, 1);
  assert.equal(sheet.notes, "");
});

test("formula errors block preview and publication", () => {
  assert.throws(() => buildCampaignReportPreview({
    spreadsheetColumns: [...BASE_COLUMNS, { id: "broken", label: "Broken", letter: "F", formula: "=1/0" }],
    recipientEntries: [{ rowNumber: 8, phoneNumber: "919876543210" }],
  }), /Fix formula errors/);
});
