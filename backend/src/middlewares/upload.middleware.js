import multer from "multer";
import path from "path";

// In-Memory Storage: buffers files directly in RAM for zero disk-cleanup overhead
const storage = multer.memoryStorage();

// 1. Campaign Media Upload (Images, Audio, Video, Documents)
const mediaUpload = multer({ storage });

export const uploadFiles = mediaUpload.fields([
    { name: "images", maxCount: 10 },
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 5 },
    { name: "audio", maxCount: 5 },
    { name: "documents", maxCount: 10 },
    { name: "document", maxCount: 1 },
    { name: "pdf", maxCount: 1 },
]);

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

export default {
    uploadFiles,
    uploadDocument,
};
