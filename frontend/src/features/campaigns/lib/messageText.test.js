import test from "node:test";
import assert from "node:assert/strict";
import { messageTextFromHtml } from "./messageText.js";

test("preserves spacing between paragraphs while keeping soft breaks single-spaced", () => {
  assert.equal(
    messageTextFromHtml("<p>First paragraph</p><p>Second paragraph</p>"),
    "First paragraph\n\nSecond paragraph"
  );
  assert.equal(
    messageTextFromHtml("<p>First&nbsp;paragraph</p><p></p><p>Second paragraph</p>"),
    "First paragraph\n\nSecond paragraph"
  );
  assert.equal(
    messageTextFromHtml("<p>Line 1<br>Line 2</p><p>Next paragraph</p>"),
    "Line 1\nLine 2\n\nNext paragraph"
  );
  assert.equal(
    messageTextFromHtml("<ul><li>One</li><li>Two</li></ul><p>Closing</p>"),
    "One\nTwo\n\nClosing"
  );
});
