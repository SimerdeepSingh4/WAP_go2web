import { Router } from "express";
import {
    createTemplate,
    getTemplates,
    getTemplateById,
    deleteTemplate,
} from "../controllers/template.controller.js";
import { protect, blockInPreviewMode } from "../middlewares/auth.middleware.js";

const templateRouter = Router();

templateRouter.use(protect);

templateRouter.post("/", blockInPreviewMode("Template creation"), createTemplate);
templateRouter.get("/", getTemplates);
templateRouter.get("/:id", getTemplateById);
templateRouter.delete("/:id", blockInPreviewMode("Template deletion"), deleteTemplate);

export default templateRouter;

