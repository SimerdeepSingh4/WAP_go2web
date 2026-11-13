import api from "@/api/client";

export const supportsPush = () => window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function ownerMessage(registration, userId) {
  const worker = registration.active;
  if (!worker) return;
  await new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(resolve, 3000);
    channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve(); };
    worker.postMessage({ type: "NOTIFICATION_OWNER", userId: userId || null }, [channel.port2]);
  });
}

export async function syncPushAccount(userId) {
  if (!supportsPush()) return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.active?.scriptURL.endsWith("/notification-sw.js")) return false;
  await ownerMessage(registration, userId);
  const subscription = await registration.pushManager.getSubscription();
  if (subscription && userId && Notification.permission === "granted") {
    await api.post("/notifications/push", { subscription: subscription.toJSON() });
    return true;
  }
  return false;
}

export async function enableBrowserPush(publicKey, userId) {
  if (!supportsPush()) throw new Error("Browser notifications need a supported browser and HTTPS (localhost also works).");
  if (!publicKey) throw new Error("Browser push is not configured on the server.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are blocked. You can enable them in your browser's site settings.");
  await navigator.serviceWorker.register("/notification-sw.js", { scope: "/" });
  const registration = await navigator.serviceWorker.ready;
  await ownerMessage(registration, userId);
  const encoded = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(encoded + "=".repeat((4 - encoded.length % 4) % 4)), (character) => character.charCodeAt(0));
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  await api.post("/notifications/push", { subscription: subscription.toJSON() });
}

export async function disableBrowserPush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration?.active?.scriptURL.endsWith("/notification-sw.js")) return;
  const subscription = await registration.pushManager.getSubscription();
  await api.delete("/notifications/push", { data: { endpoint: subscription?.endpoint } });
  if (subscription) await subscription.unsubscribe();
  await ownerMessage(registration, null);
}

export async function clearPushOwner() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (registration?.active?.scriptURL.endsWith("/notification-sw.js")) await ownerMessage(registration, null);
}
