import test from "node:test";
import assert from "node:assert/strict";
import { formatNotification, getNotificationGroup, notificationPriority } from "./notification-policy.js";

const escalation = {
    kind: "support",
    data: { id: "conversation-123", action: "escalated", subject: "Delivery help", reason: "Please investigate the delivery issue." },
};

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
