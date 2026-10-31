import multer from "multer";
import path from "path";

// In-Memory Storage: buffers files directly in RAM for zero disk-cleanup overhead
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
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
    fileFilter,
});

export default uploadDocument;

