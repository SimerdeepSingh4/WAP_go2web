import { Router } from "express";
import {
    createContact,
    getContacts,
    deleteContact,
    importContactsFromFile,
    exportContactsToCSV,
} from "../controllers/contact.controller.js";
import { protect, blockInPreviewMode } from "../middlewares/auth.middleware.js";
import { uploadDocument } from "../middlewares/upload.middleware.js";

const contactRouter = Router();

contactRouter.use(protect);

// Standard Contact CRUD
contactRouter.post("/", blockInPreviewMode("Contact creation"), createContact);
contactRouter.get("/", getContacts);
contactRouter.delete("/:id", blockInPreviewMode("Contact deletion"), deleteContact);

// Bulk Import & Export
contactRouter.post(
    "/import-file",
    blockInPreviewMode("Contact bulk import"),
    uploadDocument.single("file"),
    importContactsFromFile
);

contactRouter.get("/export", exportContactsToCSV);

export default contactRouter;
