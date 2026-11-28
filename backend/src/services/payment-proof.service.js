import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.config.js";

const DEFAULT_PROOF_DIR = path.resolve(import.meta.dirname, "../../storage/payment_proofs_private");
export const PAYMENT_PROOF_STORAGE_DIR = path.resolve(process.env.PAYMENT_PROOF_STORAGE_DIR || DEFAULT_PROOF_DIR);

const LEGACY_LOCAL_DIRS = Array.from(new Set([
    PAYMENT_PROOF_STORAGE_DIR,
    path.resolve(process.cwd(), "storage/payment_proofs_private"),
    path.resolve(import.meta.dirname, "../../../storage/payment_proofs_private"),
]));

export const ALLOWED_PROOF_MIMES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
]);

const MIME_BY_EXT = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
};

const CLOUDINARY_KEY_PATTERN = /^cld:(image|raw):(jpe?g|png|webp|pdf):(payment_proofs_private\/[a-zA-Z0-9_.-]+)$/;

function shouldUseCloudinaryForProof() {
    if (process.env.PAYMENT_PROOF_STORAGE_DIR) return false;
    return isCloudinaryConfigured() && process.env.USE_CLOUDINARY !== "false";
}

function parseCloudinaryKey(key) {
    const match = typeof key === "string" ? CLOUDINARY_KEY_PATTERN.exec(key) : null;
    if (!match) return null;
    return { resourceType: match[1], ext: match[2], publicId: match[3] };
}

function ensureLocalStorageDir() {
    if (!fs.existsSync(PAYMENT_PROOF_STORAGE_DIR)) {
        fs.mkdirSync(PAYMENT_PROOF_STORAGE_DIR, { recursive: true });
    }
}

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
    const baseName = `proof_${Date.now()}_${crypto.randomBytes(16).toString("hex")}`;

    if (shouldUseCloudinaryForProof()) {
        const isPdf = mime === "application/pdf";
        const resourceType = isPdf ? "raw" : "image";
        const uploadResult = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: "payment_proofs_private",
                    resource_type: resourceType,
                    type: "private",
                    public_id: isPdf ? `${baseName}.pdf` : baseName,
                    overwrite: false,
                    ...(isPdf ? {} : { format: ext }),
                },
                (error, result) => {
                    if (error) return reject(error);
                    if (!result?.public_id) return reject(new Error("Cloudinary did not return an uploaded proof key."));
                    return resolve(result);
                }
            );
            stream.on("error", reject);
            stream.end(buffer);
        });
        const key = `cld:${resourceType}:${ext}:${uploadResult.public_id}`;
        return { key, mime, size: buffer.length };
    }

    ensureLocalStorageDir();
    const key = `${baseName}.${ext}`;
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

    const searchDirs = process.env.PAYMENT_PROOF_STORAGE_DIR ? [PAYMENT_PROOF_STORAGE_DIR] : LEGACY_LOCAL_DIRS;
    for (const dir of searchDirs) {
        const target = path.resolve(dir, key);
        if (path.dirname(target) !== dir) {
            throw new Error("Invalid payment proof path.");
        }
        try {
            await fs.promises.access(target, fs.constants.R_OK);
            return target;
        } catch {
            // Try next directory fallback
        }
    }
    return null;
}

/**
 * Loads a stored payment proof from private Cloudinary storage or local disk.
 * Returns null if the proof object no longer exists, or throws on transport errors.
 */
export async function loadPaymentProof(key) {
    if (!key || typeof key !== "string") return null;

    const cld = parseCloudinaryKey(key);
    if (cld) {
        if (!isCloudinaryConfigured()) {
            throw Object.assign(new Error("Cloud payment proof storage is not configured on this server."), { statusCode: 503 });
        }
        const downloadUrl = cloudinary.utils.private_download_url(
            cld.publicId,
            cld.resourceType === "image" ? cld.ext : "",
            {
                resource_type: cld.resourceType,
                type: "private",
                expires_at: Math.floor(Date.now() / 1000) + 60,
            }
        );
        const upstream = await fetch(downloadUrl, { signal: AbortSignal.timeout(30000), redirect: "error" });
        if (upstream.status === 404) return null;
        if (!upstream.ok) {
            throw Object.assign(new Error(`Unable to fetch payment proof from storage (${upstream.status}).`), { statusCode: 502 });
        }
        const buffer = Buffer.from(await upstream.arrayBuffer());
        return {
            buffer,
            ext: cld.ext,
            mime: MIME_BY_EXT[cld.ext] || "application/octet-stream",
        };
    }

    const filePath = await getPaymentProofPath(key);
    if (!filePath) return null;
    const ext = path.extname(filePath).slice(1).toLowerCase();
    return {
        filePath,
        ext: ext || "bin",
        mime: MIME_BY_EXT[ext] || "application/octet-stream",
    };
}

export async function removePaymentProofFile(key) {
    if (!key || typeof key !== "string") return;

    const cld = parseCloudinaryKey(key);
    if (cld) {
        if (!isCloudinaryConfigured()) return;
        try {
            await cloudinary.uploader.destroy(cld.publicId, {
                resource_type: cld.resourceType,
                type: "private",
                invalidate: true,
            });
        } catch (err) {
            console.error("Remove Cloudinary payment proof error:", err);
        }
        return;
    }

    const target = path.resolve(PAYMENT_PROOF_STORAGE_DIR, key);
    if (path.dirname(target) !== PAYMENT_PROOF_STORAGE_DIR) return;
    try {
        await fs.promises.unlink(target);
    } catch (err) {
        if (err.code !== "ENOENT") console.error("Remove payment proof error:", err);
    }
}
