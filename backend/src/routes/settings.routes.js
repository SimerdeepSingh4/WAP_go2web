import { Router } from "express";
import { protect, authorizeRoles, blockInPreviewMode } from "../middlewares/auth.middleware.js";
import { getMediaUploadLimits, updateMediaUploadDefaults } from "../controllers/media-upload-limits.controller.js";
import { getPlatformSettings, updatePlatformSettings } from "../controllers/platform-settings.controller.js";

const router = Router();
router.use(protect);
router.get("/media-limits", getMediaUploadLimits);
router.put("/media-limits", authorizeRoles("Super Admin"), blockInPreviewMode("Upload settings updates"), updateMediaUploadDefaults);
router.get("/platform", getPlatformSettings);
router.put("/platform", authorizeRoles("Super Admin"), blockInPreviewMode("Platform settings updates"), updatePlatformSettings);
router.patch("/platform", authorizeRoles("Super Admin"), blockInPreviewMode("Platform settings updates"), updatePlatformSettings);
export default router;
