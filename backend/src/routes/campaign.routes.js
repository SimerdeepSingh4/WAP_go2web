import { Router } from "express";
import {
    createCampaign,
    getCampaigns,
    getCampaignById,
    updateCampaignStatus,
    updateCampaignMetrics,
} from "../controllers/campaign.controller.js";
import {
    protect,
    authorizeRoles,
    blockInPreviewMode,
} from "../middlewares/auth.middleware.js";

const campaignRouter = Router();

campaignRouter.use(protect);

campaignRouter.post("/", blockInPreviewMode("Campaign creation"), createCampaign);
campaignRouter.get("/", getCampaigns);
campaignRouter.get("/:id", getCampaignById);

// STRICTLY Super Admin ONLY: Change status of any campaign
campaignRouter.patch(
    "/:id/status",
    authorizeRoles("Super Admin"),
    blockInPreviewMode("Campaign status update"),
    updateCampaignStatus
);

// STRICTLY Super Admin ONLY: Input actual campaign response and delivery metrics
campaignRouter.patch(
    "/:id/metrics",
    authorizeRoles("Super Admin"),
    blockInPreviewMode("Campaign metrics update"),
    updateCampaignMetrics
);

export default campaignRouter;

