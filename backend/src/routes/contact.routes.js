import { Router } from "express";
import {
    createContact,
    getContacts,
    deleteContact,
} from "../controllers/contact.controller.js";
import { protect, blockInPreviewMode } from "../middlewares/auth.middleware.js";

const contactRouter = Router();

contactRouter.use(protect);

contactRouter.post("/", blockInPreviewMode("Contact creation"), createContact);
contactRouter.get("/", getContacts);
contactRouter.delete("/:id", blockInPreviewMode("Contact deletion"), deleteContact);

export default contactRouter;

