import multer from "multer";
import path from "path";
import { checkCampaignMediaName, validateCampaignMedia } from "../helpers/campaign-media.js";

// In-Memory Storage: buffers files directly in RAM for zero disk-cleanup overhead
const storage = multer.memoryStorage();

// Memory & DoS Protection Limits for Campaign Media Uploads
const MAX_SINGLE_MEDIA_SIZE = 16 * 1024 * 1024; // 16 MB per file
const MAX_TOTAL_UPLOAD_BYTES = 35 * 1024 * 1024; // 35 MB total multipart payload
const MAX_MEDIA_FILES = 15; // Max 15 files per campaign request
const MAX_FIELD_SIZE = 4 * 1024 * 1024; // 4 MB for non-file text/JSON fields
const MAX_FIELDS = 50;
const MAX_CONCURRENT_UPLOADS = 5;

let activeMediaUploads = 0;

// 1. Campaign Media Upload (Images, Audio, Video, Documents)
// Enforces parser-level file size, field size, and file count limits before memory buffering
const mediaUpload = multer({
    storage,
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

export function uploadFiles(req, res, next) {
    // 1. Pre-buffering total request size guard (Content-Length check)
    const contentLength = Number(req.headers["content-length"]);
    if (contentLength && contentLength > MAX_TOTAL_UPLOAD_BYTES) {
        return res.status(413).json({
            success: false,
            message: `Total upload size (${(contentLength / 1024 / 1024).toFixed(1)}MB) exceeds the 35MB maximum allowable limit.`,
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

    parseMedia(req, res, async (error) => {
        if (error) {
            release();
            if (error instanceof multer.MulterError) {
                if (error.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({
                        success: false,
                        message: "Media file too large. Maximum allowed size per file is 16MB.",
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
};
