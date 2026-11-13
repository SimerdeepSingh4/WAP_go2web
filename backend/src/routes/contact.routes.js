import { Router } from "express";
import {
    createContact,
    getContacts,
    deleteContact,
    importContactsFromFile,
    exportContactsToCSV,
} from "../controllers/contact.controller.js";
import { protect, authorizeRoles, blockInPreviewMode } from "../middlewares/auth.middleware.js";
import { saveFolderContacts } from "../controllers/recipient-tracking.controller.js";
import { uploadDocument } from "../middlewares/upload.middleware.js";

const contactRouter = Router();

contactRouter.use(protect);
contactRouter.post("/save-to-folder", authorizeRoles("Super Admin"), blockInPreviewMode("Saving folder contacts"), saveFolderContacts);

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
