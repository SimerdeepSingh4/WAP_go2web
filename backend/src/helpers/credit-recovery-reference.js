import { createHash } from "node:crypto";

export function normalizedRecoveryReference(value) {
    const reference = String(value).normalize("NFKC").replace(/\s+/gu, "").toUpperCase();
    return /^[A-F\d]{24}$/.test(reference) ? `TXN-${reference}` : reference;
}

export const recoveryReferenceKey = value => createHash("sha256").update(normalizedRecoveryReference(value)).digest("hex");
