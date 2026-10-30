import multer from 'multer';

// Use memory storage so files are kept in RAM and can be processed/uploaded elsewhere
const storage = multer.memoryStorage();

// Define expected fields and max count per field (adjust as needed)
const upload = multer({ storage });

export const uploadFiles = upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'audio', maxCount: 5 },
  { name: 'video', maxCount: 5 },
  { name: 'documents', maxCount: 10 },
]);
