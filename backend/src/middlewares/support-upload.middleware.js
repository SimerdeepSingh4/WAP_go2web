import multer from "multer";

const storage = multer.memoryStorage();

export const supportMediaUpload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB absolute max multipart boundary
        files: 5,                   // Max 5 attachments at once
    },
});

