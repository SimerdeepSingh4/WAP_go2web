import test from "node:test";
import assert from "node:assert/strict";
import { supportTransactionView } from "./support-transaction.js";

const account = "aaaaaaaaaaaaaaaaaaaaaaaa", other = "bbbbbbbbbbbbbbbbbbbbbbbb";
const entry = { _id: "cccccccccccccccccccccccc", type: "DEDUCT", amount: 6, fromUser: null, toUser: account, balanceAfterTo: 994, balanceAfterFrom: 90000, notes: "Private", performedBy: other };

test("deductions are outgoing even when the account is recorded as recipient", () => {
  const card = supportTransactionView(entry, account);
  assert.equal(card.direction, "out");
  assert.equal(card.balanceAfter, 994);
  assert.equal(card.notes, undefined);
  assert.equal(card.performedBy, undefined);
  assert.equal(card.balanceAfterFrom, undefined);
});
test("another account's entry and its balance cannot appear in a support card", () => {
  assert.equal(supportTransactionView({ ...entry, toUser: other }, account), null);
  const card = supportTransactionView({ ...entry, type: "ALLOCATE", fromUser: account, toUser: other, balanceAfterFrom: 500, balanceAfterTo: 999999 }, account);
  assert.equal(card.direction, "out");
  assert.equal(card.balanceAfter, 500);
});
test("refunds and requests retain their actual meaning for this account", () => {
  assert.equal(supportTransactionView({ ...entry, type: "REFUND" }, account).direction, "in");
  const request = supportTransactionView({ ...entry, type: "REQUEST" }, account);
  assert.equal(request.direction, "request");
  assert.equal(request.balanceAfter, null);
});
