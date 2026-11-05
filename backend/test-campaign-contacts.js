import assert from "node:assert/strict";
import test from "node:test";
import { campaignContactRows, restoreOriginalCampaignEntries } from "../shared/campaignContacts.js";
import { failureReportEntries } from "../shared/campaignFailure.js";
import { campaignDetailSummary } from "../frontend/src/features/campaigns/lib/detailSummary.js";

test("30 submitted contacts remain visible when one of six invalid entries has no digits", () => {
    const campaign = {
        totalRecipients: 30,
        recipients: Array.from({ length: 16 }, (_, index) => ({ phoneNumber: String(919876543200 + index), status: "delivered" })),
        recipientStats: { duplicatesList: Array.from({ length: 8 }, (_, index) => String(919876543200 + index)), invalidList: ["123", "456", "789", "111", "222", "invalid contact"] },
    };
    const original = failureReportEntries(campaign);
    campaign.recipientEntries = original.slice(0, 29);
    assert.equal(campaignContactRows(campaign).length, 30);
    assert.equal(campaignContactRows(campaign).at(-1).phoneNumber, "invalid contact");
    assert(campaignContactRows(campaign).every((row) => row.status === "pending_report"));
    const repaired = restoreOriginalCampaignEntries(campaign);
    assert.equal(repaired.length, 30);
    assert.equal(repaired.at(-1).rowNumber, 30);
    assert.equal(repaired.at(-1).billingAction, "refund");
    assert.equal(restoreOriginalCampaignEntries({ ...campaign, recipientEntries: repaired }).length, 30);
    assert.deepEqual(repaired.slice(0, 29), campaign.recipientEntries);
});

test("campaign summary uses published delivery counts and posted refunds instead of stale metrics", () => {
    const campaign = { status: "failed", creditsDeducted: 30, settledRefundCredits: 30, campaignSummary: { delivered: 16, creditsRefunded: 30, reportedAt: new Date() } };
    assert.equal(campaignDetailSummary(campaign).reportLabel, "Failure report pending");
    assert.equal(campaignDetailSummary(campaign).delivered, 0);
    const published = { ...campaign, publishedSpreadsheet: { status: "failed", publishedAt: new Date(), summary: { delivered: 0, creditsRefunded: 30 } } };
    assert.equal(campaignDetailSummary(published).reportLabel, "Failed");
    assert.equal(campaignDetailSummary(published).delivered, 0);
    const completed = { ...campaign, status: "completed", settledRefundCredits: 2, publishedSpreadsheet: { status: "completed", publishedAt: new Date(), summary: { delivered: 14, creditsRefunded: 2 } } };
    assert.equal(campaignDetailSummary(completed).delivered, 14);
    assert.equal(campaignDetailSummary(completed).refunded, 2);
});
