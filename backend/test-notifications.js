import assert from "node:assert/strict";
import test from "node:test";
import { formatNotification, isAllowedPushEndpoint, managesUser, mayReadNotification } from "./src/helpers/notification-policy.js";

const reseller = { _id: "reseller", role: "Reseller" };
const user = { _id: "user", role: "User", resellerId: "reseller", createdBy: "reseller", username: "Client" };

test("managed notifications require both current assignment and creator ownership", () => {
    assert.ok(managesUser(reseller, user));
    assert.ok(!managesUser(reseller, { ...user, resellerId: "someone-else" }));
    assert.ok(!managesUser(reseller, { ...user, createdBy: "someone-else" }));
    const notification = { recipientId: "reseller", recipientRole: "Reseller", managed: true };
    assert.ok(mayReadNotification(reseller, notification, user));
    assert.ok(!mayReadNotification(user, notification, user));
    assert.ok(!mayReadNotification(reseller, notification, { ...user, resellerId: "someone-else" }));
    assert.ok(!mayReadNotification({ ...reseller, role: "User" }, notification, user));
});

test("financial messages reflect posted transaction amounts and never planned category totals", () => {
    const result = formatNotification({ kind: "transaction", data: { type: "REFUND", amount: 80, toUser: "user" } }, user, user);
    assert.equal(result.title, "Credits refunded");
    assert.match(result.body, /80 credits were returned/);
    assert.equal(result.href, "/user/credits");
});

test("campaign links use each viewer's role and publication differs from status updates", () => {
    const event = { kind: "campaign", data: { id: "campaign", title: "Offer", status: "completed", changes: ["publishedSpreadsheet", "status"], publishedAt: new Date() } };
    assert.equal(formatNotification(event, user, user).href, "/user/campaigns/campaign/report");
    assert.equal(formatNotification(event, reseller, user).title, "Campaign report published • Client");
    assert.match(formatNotification(event, reseller, user).body, /User "Client"/);
});

test("low balance warns on threshold crossings rather than every wallet update", () => {
    const event = { kind: "wallet", data: { changes: ["balance"], balance: 40, previous: { balance: 100 } } };
    assert.equal(formatNotification(event, user, user, 50).title, "Low credit balance");
    assert.equal(formatNotification({ ...event, data: { ...event.data, previous: { balance: 45 } } }, user, user, 50), null);
    assert.equal(formatNotification(event, user, user, 0), null);
});

test("push endpoints are limited to public browser push providers", () => {
    assert.ok(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/test"));
    assert.ok(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/test"));
    assert.ok(isAllowedPushEndpoint("https://web.push.apple.com/test"));
    for (const endpoint of ["http://fcm.googleapis.com/test", "https://localhost/test", "https://127.0.0.1/test", "https://fcm.googleapis.com.attacker.test/test", "https://fcm.googleapis.com:8443/test", "https://someone@fcm.googleapis.com/test"]) assert.ok(!isAllowedPushEndpoint(endpoint), endpoint);
});
