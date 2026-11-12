import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";

export const SUPPORT_LIMITS = {
    IMAGE_MAX_BYTES: 5 * 1024 * 1024,       // 5 MB
    MEDIA_MAX_BYTES: 10 * 1024 * 1024,      // 10 MB (Audio / Video)
    FILE_MAX_BYTES: 10 * 1024 * 1024,       // 10 MB (Documents)
    MEDIA_MAX_DURATION_SEC: 30,             // 30 seconds
};

export const SUPPORT_STORAGE_DIR = path.resolve(process.cwd(), "storage/support_private");

if (!fs.existsSync(SUPPORT_STORAGE_DIR)) {
    fs.mkdirSync(SUPPORT_STORAGE_DIR, { recursive: true });
}

export function parseMp4Duration(buffer) {
    try {
        const mvhdIndex = buffer.indexOf(Buffer.from("mvhd"));
        if (mvhdIndex === -1 || mvhdIndex + 32 > buffer.length) return null;
        const version = buffer.readUInt8(mvhdIndex + 4);
        let timescale, duration;
        if (version === 0) {
            timescale = buffer.readUInt32BE(mvhdIndex + 16);
            duration = buffer.readUInt32BE(mvhdIndex + 20);
        } else if (version === 1) {
            timescale = buffer.readUInt32BE(mvhdIndex + 24);
            duration = Number(buffer.readBigUInt64BE(mvhdIndex + 28));
        } else {
            return null;
        }
        return timescale > 0 ? duration / timescale : null;
    } catch {
        return null;
    }
}

export function parseWavDuration(buffer) {
    try {
        if (buffer.length < 44) return null;
        if (buffer.subarray(0, 4).toString("ascii") !== "RIFF" || buffer.subarray(8, 12).toString("ascii") !== "WAVE") {
            return null;
        }
        const byteRate = buffer.readUInt32LE(28);
        const dataIndex = buffer.indexOf(Buffer.from("data"));
        if (dataIndex === -1 || dataIndex + 8 > buffer.length) return null;
        const dataSize = buffer.readUInt32LE(dataIndex + 4);
        return byteRate > 0 ? dataSize / byteRate : null;
    } catch {
        return null;
    }
}

/**
 * Validates and saves an uploaded support file buffer.
 * Enforces:
 * - Real magic bytes / file-type detection
 * - 5 MB image limit
 * - 10 MB document limit and 30s duration limit on video / audio
 *
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {number|null} clientDuration
 */
export async function processAndSaveSupportMedia(buffer, originalName, clientDuration = null) {
    if (!buffer || buffer.length === 0) {
        throw new Error("File buffer is empty.");
    }
    if (buffer.length > SUPPORT_LIMITS.FILE_MAX_BYTES) throw new Error("Files must be no larger than 10 MB.");

    let detected = await fileTypeFromBuffer(buffer);
    // Plain text has no magic signature. Accept it only for explicit TXT/CSV
    // extensions after verifying UTF-8 and rejecting binary control characters.
    if (!detected && /\.(txt|csv)$/i.test(originalName)) {
        let text;
        try { text = new TextDecoder("utf-8", { fatal: true }).decode(buffer); }
        catch { throw new Error("TXT and CSV files must contain valid UTF-8 text."); }
        if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) throw new Error("TXT and CSV files must contain plain text, not binary data.");
        detected = /\.csv$/i.test(originalName) ? { mime: "text/csv", ext: "csv" } : { mime: "text/plain", ext: "txt" };
    }
    if (!detected) {
        throw new Error("Unable to determine file type. File may be corrupted or disguised.");
    }

    const { mime, ext } = detected;
    let mediaType = null;

    if (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)) {
        mediaType = "image";
    } else if (["video/mp4", "video/webm", "video/quicktime"].includes(mime)) {
        mediaType = "video";
    } else if (["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/webm", "audio/aac"].includes(mime)) {
        mediaType = "audio";
    } else if (["application/pdf", "text/plain", "text/csv", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(mime)) {
        mediaType = "document";
    } else {
        throw new Error(`Unsupported file format: ${mime}. Choose an image, PDF, TXT, CSV, DOCX, XLSX, MP4, MOV or WAV file.`);
    }

    // Size limit enforcement
    if (mediaType === "image") {
        if (buffer.length > SUPPORT_LIMITS.IMAGE_MAX_BYTES) {
            throw new Error(`Image size exceeds the 5MB limit (current: ${(buffer.length / 1024 / 1024).toFixed(2)} MB).`);
        }
    } else {
        if (buffer.length > SUPPORT_LIMITS.MEDIA_MAX_BYTES) {
            throw new Error(`File size exceeds the 10MB limit (current: ${(buffer.length / 1024 / 1024).toFixed(2)} MB).`);
        }
    }

    // Duration limit enforcement (Video & Audio: max 30s)
    let validatedDuration = null;
    if (mediaType === "video" || mediaType === "audio") {
        let parsedDuration = null;
        if (mime === "video/mp4" || mime === "video/quicktime" || mime === "audio/mp4") {
            parsedDuration = parseMp4Duration(buffer);
        } else if (mime === "audio/wav") {
            parsedDuration = parseWavDuration(buffer);
        }

        if (parsedDuration !== null && Number.isFinite(parsedDuration)) {
            validatedDuration = Math.round(parsedDuration * 10) / 10;
        } else {
            throw new Error("This clip's duration could not be verified. Use an MP4/MOV video or WAV audio file up to 30 seconds.");
        }
        if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) throw new Error("Media must contain a valid duration.");
        if (parsedDuration > SUPPORT_LIMITS.MEDIA_MAX_DURATION_SEC) {
            throw new Error(`Media duration of ${validatedDuration}s exceeds the maximum limit of ${SUPPORT_LIMITS.MEDIA_MAX_DURATION_SEC} seconds.`);
        }
    }

    // Generate safe private filename (UUID + safe ext)
    const safeFilename = `${crypto.randomUUID()}.${ext}`;
    const destinationPath = path.join(SUPPORT_STORAGE_DIR, safeFilename);

    await fs.promises.writeFile(destinationPath, buffer);

    return {
        originalName: path.basename(originalName).slice(0, 150),
        storageReference: safeFilename,
        mimeType: mime,
        mediaType,
        sizeBytes: buffer.length,
        durationSeconds: validatedDuration,
    };
}

