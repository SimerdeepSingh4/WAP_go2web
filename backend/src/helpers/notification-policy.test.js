import test from "node:test";
import assert from "node:assert/strict";
import { formatNotification, getNotificationGroup, notificationPriority, mayReadNotification } from "./notification-policy.js";

const escalation = {
    kind: "support",
    data: { id: "conversation-123", action: "escalated", subject: "Delivery help", reason: "Please investigate the delivery issue." },
};

test("retired wallet-expiry notices are ignored while account-expiry notices remain", () => {
    const subject = { _id: "client", role: "User", username: "Client" };
    const viewer = { _id: "client", role: "User" };
    assert.equal(formatNotification({ kind: "expiry", data: { userId: "client", kind: "wallet", expired: true } }, viewer, subject), null);
    const expired = formatNotification({ kind: "expiry", data: { userId: "client", kind: "account", expired: true } }, viewer, subject);
    assert.equal(expired.title, "Account expired");
    assert.equal(expired.href, "/user/settings");
    assert(!expired.body.includes("credits"));
    const upcoming = formatNotification({ kind: "expiry", data: { userId: "client", kind: "account", expired: false } }, viewer, subject);
    assert.match(upcoming.body, /account expires within seven days/);
});

test("support escalation is important and opens the exact conversation", () => {
    const message = formatNotification(escalation, { role: "Super Admin" });
    assert.equal(notificationPriority(escalation), "urgent");
    assert.equal(message.href, "/admin/support?conversation=conversation-123");
    assert.equal(message.category, "system");
    assert.match(message.title, /Super Admin assistance/);
    assert.ok(message.body.includes(escalation.data.subject));
    assert.ok(message.body.includes(escalation.data.reason));
});

test("escalation reasons never appear in user or reseller notifications", () => {
    for (const role of ["User", "Reseller"]) {
        assert.equal(formatNotification(escalation, { role }), null);
    }
});

test("repeat requests for one conversation update its notification group", () => {
    const original = getNotificationGroup(escalation);
    const repeated = getNotificationGroup({ ...escalation, data: { ...escalation.data, reason: "Still need help", version: 2 } });
    assert.deepEqual(original, repeated);
    assert.equal(original.itemType, "support");
    assert.equal(original.itemId, escalation.data.id);
    assert.notEqual(original.groupKey, getNotificationGroup({ ...escalation, data: { ...escalation.data, id: "another-conversation" } }).groupKey);
});

test("long escalation reasons fit notification storage limits", () => {
    const event = { ...escalation, data: { ...escalation.data, subject: "S".repeat(150), reason: "R".repeat(2000) } };
    const message = formatNotification(event, { role: "Super Admin" });
    assert.ok(message.body.length <= 800);
    assert.ok(message.body.includes(event.data.subject));
});

test("other support actions do not create escalation alerts", () => {
    const event = { kind: "support", data: { ...escalation.data, action: "resolved" } };
    assert.equal(formatNotification(event, { role: "Super Admin" }), null);
    assert.equal(notificationPriority(event), "normal");
});

const allocator = { _id: "admin", username: "Private admin", role: "Super Admin" };
const reseller = { _id: "reseller", username: "ankita001", role: "Reseller" };
const client = { _id: "client", username: "shiv", role: "User" };
const allocation = (fromUser = null, performedBy = allocator._id) => ({ kind: "transaction", data: { id: "allocation", type: "ALLOCATE", amount: 5, fromUser, toUser: client._id, performedBy } });

test("an administrator sees credits allocated to the client, never received from the client", () => {
    for (const viewer of [allocator, { _id: "other-admin", role: "Super Admin" }]) {
        const message = formatNotification(allocation(), viewer, client, 100, [allocator, client]);
        assert.equal(message.title, "Credits allocated to shiv");
        assert.match(message.body, /allocated to User "shiv"/);
        assert.doesNotMatch(message.body, /received from User/);
    }
});

test("incoming credits identify the actual sender while protecting internal admin identities", () => {
    const adminMessage = formatNotification(allocation(), client, client, 100, [allocator, client]);
    assert.equal(adminMessage.title, "Credits received from Admin");
    assert.equal(adminMessage.body, "5 credits were received from Admin.");
    assert(!JSON.stringify(adminMessage).includes(allocator.username));
    const resellerMessage = formatNotification(allocation(reseller._id, reseller._id), client, client, 100, [reseller, client]);
    assert.equal(resellerMessage.title, "Credits received from Admin (ankita001)");
    assert.equal(resellerMessage.body, "5 credits were received from Admin (ankita001).");
});

test("allocation senders and observing managers see the recipient and correct direction", () => {
    const event = allocation(reseller._id, reseller._id);
    const sent = formatNotification(event, reseller, reseller, 100, [reseller, client]);
    assert.equal(sent.title, "Credits allocated to shiv");
    const observed = formatNotification(event, allocator, client, 100, [reseller, client]);
    assert.equal(observed.body, '5 credits were allocated to User "shiv" by Reseller "ankita001".');
    const managed = formatNotification(allocation(), reseller, client, 100, [allocator, client]);
    assert.equal(managed.title, "Credits allocated to shiv");
    assert.doesNotMatch(managed.body, /received from User/);
    assert(!JSON.stringify(managed).includes(allocator.username));
});

test("a newly created user does not receive a self-creation notification", () => {
    const newClient = { _id: "new-user-1", username: "ABCD", role: "User" };
    const event = { kind: "user", data: { id: newClient._id, username: newClient.username, role: newClient.role, isNew: true } };
    assert.equal(formatNotification(event, newClient, newClient), null);
    const adminMessage = formatNotification(event, { _id: "admin-1", role: "Super Admin" }, newClient);
    assert.ok(adminMessage);
    assert.equal(adminMessage.title, "New User created: ABCD");
});

test("super admin cannot view notifications for transactions or wallets between resellers and their users", () => {
    const superAdmin = { _id: "admin-1", role: "Super Admin" };
    const managedUser = { _id: "user-1", role: "User", resellerId: "reseller-1" };
    const directUser = { _id: "user-2", role: "User", resellerId: null };

    assert.equal(mayReadNotification(superAdmin, { recipientId: "admin-1", recipientRole: "Super Admin", itemType: "transaction", managed: false }, managedUser), false);
    assert.equal(mayReadNotification(superAdmin, { recipientId: "admin-1", recipientRole: "Super Admin", itemType: "wallet", managed: false }, managedUser), false);
    assert.equal(mayReadNotification(superAdmin, { recipientId: "admin-1", recipientRole: "Super Admin", itemType: "transaction", managed: false }, directUser), true);
    assert.equal(mayReadNotification(superAdmin, { recipientId: "admin-1", recipientRole: "Super Admin", itemType: "campaign", managed: false }, managedUser), true);
});
