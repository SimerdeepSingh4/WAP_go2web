import { createHmac, timingSafeEqual } from "node:crypto";
import { originalCampaignEntries } from "../../../shared/campaignContacts.js";

export function providerConfig() {
    const endpoint = process.env.CAMPAIGN_PROVIDER_URL;
    const token = process.env.CAMPAIGN_PROVIDER_TOKEN;
    const webhookSecret = process.env.CAMPAIGN_WEBHOOK_SECRET;
    const callbackUrl = process.env.CAMPAIGN_CALLBACK_URL;
    if (!endpoint || !token || !callbackUrl || !webhookSecret || Buffer.byteLength(webhookSecret) < 32) throw new Error("Campaign provider URL, token, callback URL, and a 32-byte webhook secret are required");
    for (const value of [endpoint, callbackUrl]) {
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error("Campaign integration URLs must use HTTPS without embedded credentials");
    }
    return { endpoint, token, callbackUrl, webhookSecret };
}

export function verifyProviderSignature(raw, timestamp, signature, secret, now = Date.now()) {
    if (!/^\d{10}$/.test(String(timestamp)) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^[a-f0-9]{64}$/i.test(String(signature))) return false;
    const expected = createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest();
    return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function normalizeProviderResults(campaign, results) {
    const original = originalCampaignEntries(campaign);
    const expected = original.filter((row) => row.kind === "submitted");
    if (!original.length || !Array.isArray(results) || results.length !== expected.length) throw new Error("Completion must contain exactly one terminal result per dispatched row");
    const allowed = new Set(expected.map((row) => row.rowNumber));
    const byRow = new Map();
    for (const result of results) {
        if (!Number.isSafeInteger(result.rowNumber) || !allowed.has(result.rowNumber) || byRow.has(result.rowNumber) || !["delivered", "read", "failed"].includes(result.status)) throw new Error("Completion contains an invalid, repeated, or non-terminal row");
        byRow.set(result.rowNumber, result.status);
    }
    return original.map((row) => {
        const status = row.kind === "submitted" ? byRow.get(row.rowNumber) : "failed";
        const failed = status === "failed";
        return { rowNumber: row.rowNumber, phoneNumber: row.phoneNumber, status,
            classification: failed ? "failed" : "successful", category: row.kind === "duplicate" ? "Duplicate number" : row.kind === "invalid" ? "Wrong number" : failed ? "Not delivered" : "Delivered",
            tabKey: row.kind === "duplicate" ? "duplicate" : row.kind === "invalid" ? "wrong" : failed ? "failed" : "delivered",
            billingAction: failed ? "refund" : "keep", notes: "", cells: {},
        };
    });
}

export async function dispatchToProvider(campaign, workflow) {
    const config = providerConfig();
    const payload = {
        campaignId: String(campaign._id), dispatchKey: workflow.dispatchKey,
        callbackUrl: config.callbackUrl, title: campaign.campaignTitle, message: campaign.messageBody,
        recipients: originalCampaignEntries(campaign).filter((row) => row.kind === "submitted").map(({ rowNumber, phoneNumber }) => ({ rowNumber, phoneNumber })),
        media: { images: campaign.images, video: campaign.video, audio: campaign.audio, documents: campaign.documents },
    };
    const response = await fetch(config.endpoint, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}`, "Idempotency-Key": workflow.dispatchKey },
        body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Campaign provider returned HTTP ${response.status}`);
    // Do not log provider response bodies: they can contain credentials or PII.
    const result = await response.json();
    if (typeof result.jobId !== "string" || !result.jobId.trim() || result.jobId.length > 200) throw new Error("Campaign provider must return a jobId");
    return result.jobId;
}
