function owner(value, write = false) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("dashboard-notifications", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("settings");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("settings", write ? "readwrite" : "readonly");
      const store = transaction.objectStore("settings");
      const result = write ? store.put(value, "owner") : store.get("owner");
      let output;
      result.onsuccess = () => { output = result.result; };
      transaction.oncomplete = () => { db.close(); resolve(output); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  });
}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("message", (event) => {
  if (event.data?.type !== "NOTIFICATION_OWNER") return;
  event.waitUntil(owner(event.data.userId || null, true).then(() => event.ports[0]?.postMessage({ ok: true })));
});
self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let data;
    try { data = event.data?.json(); } catch { return; }
    if (!data?.id || !data.userId || await owner() !== data.userId) return;
    await self.registration.showNotification("New dashboard notification", {
      body: "Open your notification centre to view the update.",
      icon: "/favicon.svg", tag: "dashboard-notification-" + data.id, renotify: false,
      data: { id: data.id, userId: data.userId, href: data.href },
    });
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: "NOTIFICATIONS_CHANGED" });
  })());
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const data = event.notification.data;
    if (!data?.userId || await owner() !== data.userId) return;
    const href = /^\/(admin|reseller|user)\/notifications$/.test(data.href) ? data.href : "/login";
    const target = new URL(href, self.location.origin).href;
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find((client) => client.url.startsWith(self.location.origin + "/"));
    if (existing) { await existing.navigate(target); await existing.focus(); }
    else await self.clients.openWindow(target);
  })());
});
