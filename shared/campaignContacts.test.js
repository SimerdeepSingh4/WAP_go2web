import test from "node:test";
import assert from "node:assert/strict";
import { initialCampaignReportRows, originalReportRowsByIndex } from "./campaignContacts.js";

const first = "919876543210", second = "919876543211";
const campaign = {
    originalRecipients: [first, first, "invalid", second],
    recipients: [{ phoneNumber: first, status: "delivered" }, { phoneNumber: second, status: "queued" }],
    recipientStats: { duplicatesList: [first], invalidList: ["invalid"] },
};

test("the editor and save validator use the same upload index for every occurrence", () => {
    const rows = initialCampaignReportRows(campaign);
    const expected = originalReportRowsByIndex(campaign);
    assert.deepEqual(rows.map(row => row.phoneNumber), campaign.originalRecipients);
    assert.deepEqual(rows.map(row => row.tabKey), ["delivered", "duplicate", "wrong", "all"]);
    for (const row of rows) assert.equal(expected.get(row.rowNumber).phoneNumber, row.phoneNumber);
});

test("older saved drafts retain their established indexes without making added rows refundable", () => {
    const grouped = [first, second, first, "invalid", second].map((phoneNumber, index) => ({ phoneNumber, rowNumber: index + 1 }));
    const expected = originalReportRowsByIndex({ ...campaign, recipientEntries: grouped });
    assert.equal(expected.get(2).phoneNumber, second);
    assert.equal(expected.get(3).phoneNumber, first);
    assert.equal(expected.has(5), false);
    grouped[2].phoneNumber = second;
    assert.equal(originalReportRowsByIndex({ ...campaign, recipientEntries: grouped }).get(2).phoneNumber, first);
});
