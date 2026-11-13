import test from "node:test";
import assert from "node:assert/strict";
import { campaignRecipientError, campaignRecipientLines } from "./campaignRecipients.js";

test("campaign recipients require exactly 12 ASCII digits starting with 91", () => {
    for (const value of ["919876543210", "910000000000", "919999999999"]) {
        assert.equal(campaignRecipientError(value), null);
    }
    for (const value of ["", "9876543210", "91987654321", "9198765432100", "449876543210", "+919876543210", "91 9876543210", "919876543210 ", " 919876543210", "91987654321a", "91987654321\n", "91987654321\r", "919876543210\n", "９１９８７６５４３２１０", null, 919876543210, {}, ["919876543210"]]) {
        assert.equal(typeof campaignRecipientError(value), "string", `Must reject ${JSON.stringify(value)}`);
    }
});

test("recipient lines preserve invalid text and original line numbers for text and uploaded files", () => {
    const raw = '\n919876543210\r\n\t\r919876543211,919876543212\nPhone number\n"919876543213"';
    assert.deepEqual(campaignRecipientLines(raw), [
        { value: "919876543210", lineNumber: 2 },
        { value: "919876543211,919876543212", lineNumber: 4 },
        { value: "Phone number", lineNumber: 5 },
        { value: '"919876543213"', lineNumber: 6 },
    ]);
    for (const { value } of campaignRecipientLines(raw).slice(1)) assert(campaignRecipientError(value));
    assert.deepEqual(campaignRecipientLines(" \r\n\t\n"), []);
});
