import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import campaignModel from "./src/models/campaign.model.js";
import { messageTextFromHtml } from "./src/helpers/message.helper.js";

for (const length of [1024, 1025]) {
    test(`formatted messages with ${length} characters ${length === 1024 ? "pass" : "fail"} validation`, () => {
        const campaign = new campaignModel({
            userId: new mongoose.Types.ObjectId(), campaignTitle: "Limit test",
            campaignDescription: "Character boundary", messageBody: `<p><strong>${"a".repeat(length)}</strong></p>`,
        });
        const error = campaign.validateSync();
        assert.equal(Boolean(error?.errors.messageBody), length > 1024);
    });
}

test("message length counts decoded characters and line breaks", () => {
    assert.equal(messageTextFromHtml("<p>Hello &amp; bye</p><p>&lt;test&gt;</p>"), "Hello & bye\n<test>");
});
