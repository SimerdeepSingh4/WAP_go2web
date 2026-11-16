import { AsyncLocalStorage } from "node:async_hooks";

const tails = new Map();
const heldLocks = new AsyncLocalStorage();

// Queue hot-wallet requests within this server before starting a DB snapshot.
// MongoDB's transaction conflicts still protect calls from other server nodes.
export async function withCreditWalletLocks(userIds, work) {
    const held = heldLocks.getStore() || new Set();
    const keys = [...new Set((userIds || []).filter(Boolean).map(String))].filter(key => !held.has(key)).sort();
    const releases = [];
    try {
        for (const key of keys) {
            const previous = tails.get(key) || Promise.resolve();
            let release;
            const current = new Promise(resolve => { release = resolve; });
            tails.set(key, current);
            await previous;
            releases.push(() => { release(); if (tails.get(key) === current) tails.delete(key); });
        }
        return await heldLocks.run(new Set([...held, ...keys]), work);
    } finally { for (const release of releases.reverse()) release(); }
}
