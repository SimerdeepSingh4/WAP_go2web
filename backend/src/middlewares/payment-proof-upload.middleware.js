import multer from "multer";

const storage = multer.memoryStorage();

export const paymentProofUpload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB max
        files: 1,                  // exactly 1 proof screenshot
    },
});
