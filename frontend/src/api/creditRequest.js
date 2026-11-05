const pending = new Map();
const protectsCredits = (config) => config.method?.toLowerCase() === "post" && /^\/?(?:campaigns\/?|credits\/(?:allocate|reclaim|deduct))$/.test(config.url?.split("?")[0] || "");

const digest = async (value) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", value))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export async function attachCreditRequestKey(config) {
  if (!protectsCredits(config) || config.headers["Idempotency-Key"]) return config;
  const data = config.data instanceof FormData
    ? await Promise.all([...config.data.entries()].map(async ([key, value]) => [key, value instanceof Blob ? { name: value.name, digest: await digest(await value.arrayBuffer()) } : value]))
    : canonical(config.data);
  const fingerprint = await digest(new TextEncoder().encode(JSON.stringify({ url: config.url, data })));
  const storageKey = `credit-request:${fingerprint}`;
  if (!pending.has(storageKey)) {
    let retained;
    try { retained = sessionStorage.getItem(storageKey); } catch { /* Memory also protects retries in this tab. */ }
    pending.set(storageKey, retained || crypto.randomUUID());
    try { sessionStorage.setItem(storageKey, pending.get(storageKey)); } catch { /* Storage can be disabled. */ }
  }
  config.headers["Idempotency-Key"] = pending.get(storageKey);
  config.creditRequestStorageKey = storageKey;
  return config;
}

export function settleCreditRequest(config) {
  if (!config?.creditRequestStorageKey) return;
  pending.delete(config.creditRequestStorageKey);
  try { sessionStorage.removeItem(config.creditRequestStorageKey); } catch { /* Storage can be disabled. */ }
}
