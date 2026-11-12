import { Router } from "express";
import {
    resolveBranding,
    getResellerBranding,
    updateResellerBranding,
    uploadResellerLogo,
    removeResellerLogo,
} from "../controllers/branding.controller.js";
import { protect, authorizeRoles } from "../middlewares/auth.middleware.js";
import { uploadProfileImage } from "../middlewares/upload.middleware.js";

const brandingRouter = Router();

// Public: Resolve branding by subdomain/host
brandingRouter.get("/resolve", resolveBranding);

// Reseller routes (all protected)
brandingRouter.get(
    "/reseller",
    protect,
    authorizeRoles("Reseller", "Super Admin"),
    getResellerBranding
);

brandingRouter.patch(
    "/reseller",
    protect,
    authorizeRoles("Reseller"),
    updateResellerBranding
);

brandingRouter.post(
    "/reseller/logo",
    protect,
    authorizeRoles("Reseller"),
    uploadProfileImage,
    uploadResellerLogo
);

brandingRouter.delete(
    "/reseller/logo",
    protect,
    authorizeRoles("Reseller"),
    removeResellerLogo
);

export default brandingRouter;

