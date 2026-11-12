import test from "node:test";
import assert from "node:assert/strict";
import { buildSupportText, supportContext } from "./references.js";

test("campaign help carries the full displayed reference instead of a database lookup ID", () => {
  const context = supportContext({ campaign: { _id: "database-id", campaignId: "CMP-2026-000123", campaignTitle: "November campaign" }, area: "this campaign report" });
  assert.deepEqual(context.references, [{ type: "campaign", label: "Campaign ID", value: "CMP-2026-000123" }]);
  assert.equal(buildSupportText(context.text, context.references), "I need help with this campaign report.\n\nCampaign ID: CMP-2026-000123");
});

test("legacy campaign and transaction records use the same public references as their pages", () => {
  const context = supportContext({ campaign: { _id: "abc123" }, transaction: { _id: "def456" }, area: "this transaction" });
  assert.deepEqual(context.references.map(item => item.value), ["CMP-ABC123", "TXN-DEF456"]);
  assert.equal(buildSupportText("", context.references), "Campaign ID: CMP-ABC123\nTransaction ID: TXN-DEF456");
});

test("long campaign titles fit support subjects without truncating the reference", () => {
  const campaignId = "CMP-" + "A".repeat(100);
  const context = supportContext({ campaign: { campaignId, campaignTitle: "A".repeat(300) } });
  assert.equal(context.subject.length, 150);
  assert.equal(context.references[0].value, campaignId);
});

test("area help has useful draft context without inventing a record reference", () => {
  const context = supportContext({ area: "My credits" });
  assert.equal(context.subject, "Help with my credits");
  assert.equal(context.text, "I need help with my credits.");
  assert.deepEqual(context.references, []);
});
