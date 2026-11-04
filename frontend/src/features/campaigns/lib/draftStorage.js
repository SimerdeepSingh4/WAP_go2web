const DATABASE_NAME = "wap-campaign-drafts";
const STORE_NAME = "drafts";
const DATABASE_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runRequest(mode, operation) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export const readCampaignDraft = async (key) => {
  if (!globalThis.indexedDB) return null;
  const draft = await runRequest("readonly", (store) => store.get(key));
  return draft?.value ?? null;
};

export const writeCampaignDraft = async (key, value) => {
  if (!globalThis.indexedDB) return;
  await runRequest("readwrite", (store) => store.put({ key, value, updatedAt: Date.now() }));
};

export const removeCampaignDraft = async (key) => {
  if (!globalThis.indexedDB) return;
  await runRequest("readwrite", (store) => store.delete(key));
};
