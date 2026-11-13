import multer from "multer";
import path from "path";
import { checkCampaignMediaName, validateCampaignMedia } from "../helpers/campaign-media.js";
import { getAccountMediaUploadLimits } from "../services/media-upload-limits.service.js";
import { campaignMediaLimitBytes } from "../../../shared/mediaUploadLimits.js";

// In-Memory Storage: buffers files directly in RAM for zero disk-cleanup overhead
const storage = multer.memoryStorage();

// Memory & DoS Protection Limits for Campaign Media Uploads
export const MAX_SINGLE_MEDIA_SIZE = 100 * 1024 * 1024; // 100 MB per file parser ceiling (exact per-user limit validated in controller)
export const MAX_TOTAL_UPLOAD_BYTES = 120 * 1024 * 1024; // 120 MB total multipart payload ceiling
export const MAX_MEDIA_FILES = 15; // Max 15 files per campaign request
export const MAX_FIELD_SIZE = 4 * 1024 * 1024; // 4 MB for non-file text/JSON fields
export const MAX_FIELDS = 50;
export const MAX_CONCURRENT_UPLOADS = 5;

let activeMediaUploads = 0;

export function getActiveMediaUploads() {
    return activeMediaUploads;
}

export function resetActiveMediaUploads() {
    activeMediaUploads = 0;
}

// Bounded in-memory storage engine that enforces aggregate file size budget before buffering into RAM
class BoundedMemoryStorage {
    constructor(maxTotalBytes) {
        this.maxTotalBytes = maxTotalBytes;
    }

    _handleFile(req, file, cb) {
        req._aggregateUploadBytes = req._aggregateUploadBytes || 0;
        const chunks = [];
        let fileSize = 0;
        let aborted = false;

        const onData = (chunk) => {
            fileSize += chunk.length;
            req._aggregateUploadBytes += chunk.length;

            const fileLimit = campaignMediaLimitBytes(file.fieldname, req.campaignMediaUploadLimits || {});
            if (fileLimit && fileSize > fileLimit && !aborted) {
                aborted = true;
                file.stream.removeListener("data", onData);
                file.stream.destroy();
                const error = new multer.MulterError("LIMIT_FILE_SIZE", file.fieldname);
                error.message = `${file.originalname} exceeds the ${fileLimit / 1024 / 1024} MB upload limit.`;
                return cb(error);
            }

            if (req._aggregateUploadBytes > this.maxTotalBytes && !aborted) {
                aborted = true;
                file.stream.removeListener("data", onData);
                file.stream.destroy();
                const err = new multer.MulterError("LIMIT_TOTAL_UPLOAD_SIZE");
                err.message = `Total upload size exceeds the ${(this.maxTotalBytes / 1024 / 1024).toFixed(0)}MB maximum allowable limit.`;
                err.code = "LIMIT_TOTAL_UPLOAD_SIZE";
                return cb(err);
            }
            chunks.push(chunk);
        };

        file.stream.on("data", onData);
        file.stream.on("end", () => {
            if (!aborted) {
                cb(null, {
                    buffer: Buffer.concat(chunks, fileSize),
                    size: fileSize,
                });
            }
        });
        file.stream.on("error", (err) => {
            if (!aborted) {
                aborted = true;
                cb(err);
            }
        });
    }

    _removeFile(req, file, cb) {
        delete file.buffer;
        cb(null);
    }
}

const mediaStorage = new BoundedMemoryStorage(MAX_TOTAL_UPLOAD_BYTES);

// 1. Campaign Media Upload (Images, Audio, Video, Documents)
// Enforces parser-level file size, field size, and file count limits before memory buffering
const mediaUpload = multer({
    storage: mediaStorage,
    limits: {
        fileSize: MAX_SINGLE_MEDIA_SIZE,
        files: MAX_MEDIA_FILES,
        fieldSize: MAX_FIELD_SIZE,
        fields: MAX_FIELDS,
    },
    fileFilter(req, file, cb) {
        try {
            checkCampaignMediaName(file);
            cb(null, true);
        } catch (error) {
            cb(error);
        }
    },
});

const parseMedia = mediaUpload.fields([
    { name: "images", maxCount: 10 },
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 5 },
    { name: "audio", maxCount: 5 },
    { name: "documents", maxCount: 10 },
    { name: "document", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
]);

export async function uploadFiles(req, res, next) {
    try {
        req.campaignMediaUploadLimits = await getAccountMediaUploadLimits(req.user);
    } catch {
        return res.status(503).json({ success: false, message: "Upload limits are temporarily unavailable. Please retry." });
    }
    // 1. Pre-buffering total request size guard (Content-Length check)
    const declaredLength = Number(req.headers["content-length"]);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_TOTAL_UPLOAD_BYTES) {
        return res.status(413).json({
            success: false,
            message: `Total upload size (${(declaredLength / 1024 / 1024).toFixed(1)}MB) exceeds allowable limit.`,
            code: "LIMIT_TOTAL_UPLOAD_SIZE",
        });
    }

    // 2. Concurrency limit guard: prevent multiple heavy uploads from exhausting Node.js heap
    if (activeMediaUploads >= MAX_CONCURRENT_UPLOADS) {
        return res.status(429).json({
            success: false,
            message: "Too many concurrent media uploads in progress. Please retry in a few moments.",
            code: "CONCURRENT_UPLOAD_LIMIT",
        });
    }

    activeMediaUploads++;
    let released = false;
    const release = () => {
        if (!released) {
            released = true;
            activeMediaUploads = Math.max(0, activeMediaUploads - 1);
        }
    };
    res.on("finish", release);
    res.on("close", release);
    req.on("close", release);
    req.on("error", release);
    req.on("aborted", release);

    // 3. Streaming byte budget enforcement: tracks incoming bytes in real time for chunked or missing Content-Length requests
    let totalBytesReceived = 0;
    let limitExceeded = false;

    const onData = (chunk) => {
        totalBytesReceived += chunk.length;
        if (totalBytesReceived > MAX_TOTAL_UPLOAD_BYTES && !limitExceeded) {
            limitExceeded = true;
            req.removeListener("data", onData);
            req.unpipe();
            req.resume(); // drain and discard remaining stream chunks to avoid stalling TCP
            release();
            if (!res.headersSent) {
                return res.status(413).set("Connection", "close").json({
                    success: false,
                    message: "Total upload size exceeds allowable limit.",
                    code: "LIMIT_TOTAL_UPLOAD_SIZE",
                });
            }
        }
    };

    req.on("data", onData);

    parseMedia(req, res, async (error) => {
        req.removeListener("data", onData);
        if (limitExceeded || res.headersSent) {
            return;
        }

        if (error) {
            release();
            if (error instanceof multer.MulterError || error.code === "LIMIT_TOTAL_UPLOAD_SIZE") {
                if (error.code === "LIMIT_TOTAL_UPLOAD_SIZE") {
                    return res.status(413).json({
                        success: false,
                        message: "Total upload size exceeds allowable limit.",
                        code: error.code,
                    });
                }
                if (error.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({
                        success: false,
                        message: error.message || "Media file too large. Exceeds allowable size limit.",
                        code: error.code,
                    });
                }
                if (error.code === "LIMIT_FILE_COUNT") {
                    return res.status(400).json({
                        success: false,
                        message: "Too many files uploaded. Maximum 15 media files allowed per campaign.",
                        code: error.code,
                    });
                }
                if (error.code === "LIMIT_FIELD_VALUE") {
                    return res.status(413).json({
                        success: false,
                        message: "Field data too large. Maximum size is 4MB.",
                        code: error.code,
                    });
                }
                return res.status(400).json({ success: false, message: error.message, code: error.code });
            }
            return res.status(400).json({ success: false, message: error.message });
        }

        try {
            // Validate the entire batch before the controller can save any file.
            for (const file of Object.values(req.files || {}).flat()) {
                await validateCampaignMedia(file);
            }
        } catch (validationError) {
            release();
            return res.status(400).json({ success: false, message: validationError.message });
        }
        next();
    });
}

// 2. Contact Import Spreadsheet Upload (.csv, .xlsx, .xls)
const documentFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExtensions = [".csv", ".xlsx", ".xls"];

    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(
            new Error(
                `Unsupported file format: "${ext}". Please upload a valid CSV (.csv) or Excel spreadsheet (.xlsx, .xls).`
            ),
            false
        );
    }
};

export const uploadDocument = multer({
    storage,
    limits: {
        fileSize: 15 * 1024 * 1024, // 15 MB limit
    },
    fileFilter: documentFilter,
});

export const uploadProfileImage = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Profile image must be JPG, PNG, or WebP."), false);
        }
    },
}).single("dp_img");

export default {
    uploadFiles,
    uploadDocument,
    uploadProfileImage,
    getActiveMediaUploads,
    resetActiveMediaUploads,
    MAX_SINGLE_MEDIA_SIZE,
    MAX_TOTAL_UPLOAD_BYTES,
    MAX_MEDIA_FILES,
    MAX_FIELD_SIZE,
    MAX_FIELDS,
    MAX_CONCURRENT_UPLOADS,
};
