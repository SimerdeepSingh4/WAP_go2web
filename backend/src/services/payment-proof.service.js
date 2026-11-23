import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";

export const PAYMENT_PROOF_STORAGE_DIR = path.resolve(process.env.PAYMENT_PROOF_STORAGE_DIR || "storage/payment_proofs_private");

if (!fs.existsSync(PAYMENT_PROOF_STORAGE_DIR)) {
    fs.mkdirSync(PAYMENT_PROOF_STORAGE_DIR, { recursive: true });
}

export const ALLOWED_PROOF_MIMES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
]);

export async function savePaymentProofFile(buffer) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error("A valid file buffer is required.");
    }

    if (buffer.length > 5 * 1024 * 1024) {
        throw new Error("Payment proof exceeds the 5 MB limit.");
    }

    const type = await fileTypeFromBuffer(buffer).catch(() => null);
    const mime = type?.mime;

    if (!mime || !ALLOWED_PROOF_MIMES.has(mime)) {
        throw Object.assign(new Error("Payment proof must be an image (JPEG, PNG, WebP) or PDF."), { statusCode: 400 });
    }

    const ext = type?.ext || (mime === "application/pdf" ? "pdf" : "bin");
    const key = `proof_${Date.now()}_${crypto.randomBytes(16).toString("hex")}.${ext}`;
    const target = path.resolve(PAYMENT_PROOF_STORAGE_DIR, key);

    try {
        await fs.promises.writeFile(target, buffer, { flag: "wx" });
    } catch (error) {
        if (error.code !== "EEXIST") await removePaymentProofFile(key);
        throw error;
    }
    return { key, mime, size: buffer.length };
}

export async function getPaymentProofPath(key) {
    if (!key || typeof key !== "string" || key.includes("..") || key.includes("/") || key.includes("\\")) {
        throw new Error("Invalid payment proof key.");
    }

    const target = path.resolve(PAYMENT_PROOF_STORAGE_DIR, key);
    if (path.dirname(target) !== PAYMENT_PROOF_STORAGE_DIR) {
        throw new Error("Invalid payment proof path.");
    }

    try {
        await fs.promises.access(target, fs.constants.R_OK);
        return target;
    } catch {
        return null;
    }
}

export async function removePaymentProofFile(key) {
    if (!key || typeof key !== "string") return;
    const target = path.resolve(PAYMENT_PROOF_STORAGE_DIR, key);
    if (path.dirname(target) !== PAYMENT_PROOF_STORAGE_DIR) return;
    try {
        await fs.promises.unlink(target);
    } catch (err) {
        if (err.code !== "ENOENT") console.error("Remove payment proof error:", err);
    }
}
