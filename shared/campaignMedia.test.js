import test from "node:test";
import assert from "node:assert/strict";
import { campaignMediaCount, MAX_CAMPAIGN_MEDIA, normalizeCampaignAttachments } from "./campaignMedia.js";

test("text-only and every single media source fit the one-attachment limit", () => {
  assert.equal(MAX_CAMPAIGN_MEDIA, 1);
  assert.equal(campaignMediaCount(), 0);
  for (const source of [
    ...["images", "image", "video", "audio", "documents", "document", "pdf"].map(field => ({ files: { [field]: [{}] } })),
    { attachments: ["media-id"] }, { mediaId: "media-id" },
  ]) assert.equal(campaignMediaCount(source), 1);
});

test("mixed file types, aliases and stored references share one total limit", () => {
  for (const source of [
    { files: { images: [{}, {}] } }, { files: { images: [{}], image: [{}] } },
    { files: { video: [{}], pdf: [{}] } },
    { attachments: ["one", "two"] }, { attachments: ["one"], mediaId: "two" },
    { files: { pdf: [{}] }, mediaId: "one" },
  ]) assert(campaignMediaCount(source) > MAX_CAMPAIGN_MEDIA);
});

test("profile DP sharing is separate from the uploaded campaign media limit", () => {
  assert.equal(campaignMediaCount({ shareProfileDp: true }), 0);
  for (const source of [
    { files: { images: [{}] } }, { files: { video: [{}] } }, { files: { pdf: [{}] } },
    { attachments: ["one"] }, { mediaId: "one" },
  ]) assert.equal(campaignMediaCount({ ...source, shareProfileDp: true }), 1);
  assert(campaignMediaCount({ files: { images: [{}, {}] }, shareProfileDp: true }) > MAX_CAMPAIGN_MEDIA);
});

test("stored attachment references are normalized consistently for JSON and multipart requests", () => {
  assert.deepEqual(normalizeCampaignAttachments(undefined), []);
  assert.deepEqual(normalizeCampaignAttachments(""), []);
  assert.deepEqual(normalizeCampaignAttachments([" one "]), ["one"]);
  assert.deepEqual(normalizeCampaignAttachments('["one","two"]'), ["one", "two"]);
  assert.deepEqual(normalizeCampaignAttachments("one"), ["one"]);
  for (const value of [{ id: "one" }, [null], [""], [123]]) assert.throws(() => normalizeCampaignAttachments(value));
});
