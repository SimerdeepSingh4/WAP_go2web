import { Router } from "express";
import { protect, authorizeRoles, blockInPreviewMode } from "../middlewares/auth.middleware.js";
import { getMediaUploadLimits, updateMediaUploadDefaults } from "../controllers/media-upload-limits.controller.js";

const router = Router();
router.use(protect);
router.get("/media-limits", getMediaUploadLimits);
router.put("/media-limits", authorizeRoles("Super Admin"), blockInPreviewMode("Upload settings updates"), updateMediaUploadDefaults);
export default router;
