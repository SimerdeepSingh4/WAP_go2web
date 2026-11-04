import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

async function fixture() {
    const handlers = new Map(), shown = [], opened = [];
    let currentOwner, upgraded = false;
    const indexedDB = { open() {
        const request = { result: {
            createObjectStore() {}, close() {},
            transaction() {
                const transaction = { objectStore: () => ({
                    get: () => operation(currentOwner),
                    put: (value) => { currentOwner = value; return operation(value); },
                }) };
                function operation(value) {
                    const result = { result: value };
                    queueMicrotask(() => { result.onsuccess?.(); queueMicrotask(() => transaction.oncomplete?.()); });
                    return result;
                }
                return transaction;
            },
        } };
        queueMicrotask(() => { if (!upgraded) { upgraded = true; request.onupgradeneeded?.(); } request.onsuccess?.(); });
        return request;
    } };
    const self = {
        addEventListener: (name, handler) => handlers.set(name, handler),
        skipWaiting() {}, location: { origin: "https://dashboard.test" },
        registration: { showNotification: async (title, options) => shown.push({ title, ...options }) },
        clients: { claim() {}, matchAll: async () => [], openWindow: async (url) => opened.push(url) },
    };
    vm.runInNewContext(await readFile(new URL("../frontend/public/notification-sw.js", import.meta.url), "utf8"), { self, indexedDB, URL });
    async function invoke(name, event) {
        let waiting;
        handlers.get(name)({ ...event, waitUntil: (promise) => { waiting = promise; } });
        await waiting;
    }
    return {
        shown, opened,
        owner: (userId) => invoke("message", { data: { type: "NOTIFICATION_OWNER", userId }, ports: [] }),
        push: (payload) => invoke("push", { data: { json: () => payload } }),
        click: (data) => invoke("notificationclick", { notification: { data, close() {} } }),
    };
}

test("service worker displays only the active account's push and clears ownership on logout", async () => {
    const f = await fixture();
    await f.owner("user-a");
    await f.push({ id: "one", userId: "user-b", title: "Private title" });
    assert.equal(f.shown.length, 0);
    await f.push({ id: "two", userId: "user-a", title: "Private balance 999", body: "Private campaign", href: "/user/notifications" });
    assert.equal(f.shown.length, 1);
    assert.equal(f.shown[0].tag, "dashboard-notification-two");
    assert.ok(!JSON.stringify(f.shown).includes("999"));
    await f.owner(null);
    await f.push({ id: "three", userId: "user-a" });
    await f.click({ userId: "user-a", href: "/user/notifications" });
    assert.equal(f.shown.length, 1);
    assert.equal(f.opened.length, 0);
});

test("push clicks only open safe same-origin notification destinations", async () => {
    const f = await fixture();
    await f.owner("user-a");
    await f.click({ userId: "user-a", href: "/user/notifications" });
    await f.click({ userId: "user-a", href: "https://attacker.test/" });
    assert.deepEqual(f.opened, ["https://dashboard.test/user/notifications", "https://dashboard.test/login"]);
});
