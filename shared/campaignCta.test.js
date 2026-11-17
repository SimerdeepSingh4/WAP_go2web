import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CALL_LABEL, DEFAULT_LINK_LABEL, normalizeCampaignCtaLabel } from "./campaignCta.js";

test("legacy requests without labels receive defaults and supplied labels are trimmed", () => {
    assert.equal(normalizeCampaignCtaLabel(undefined, DEFAULT_LINK_LABEL), "Visit Website");
    assert.equal(normalizeCampaignCtaLabel("", DEFAULT_CALL_LABEL), "Call Now");
    assert.equal(normalizeCampaignCtaLabel("  Claim Deal  ", DEFAULT_LINK_LABEL), "Claim Deal");
});

test("CTA labels accept the boundary and reject overlong or non-text input", () => {
    assert.equal(normalizeCampaignCtaLabel("a".repeat(25), DEFAULT_LINK_LABEL).length, 25);
    assert.throws(() => normalizeCampaignCtaLabel("a".repeat(26), DEFAULT_LINK_LABEL), /25 characters/);
    for (const input of [123, {}, ["Call Now"]]) assert.throws(() => normalizeCampaignCtaLabel(input, DEFAULT_CALL_LABEL), /must be text/);
});
