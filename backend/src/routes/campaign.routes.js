import { Router } from "express";
import {
    createCampaign,
    getCampaigns,
    getCampaignById,
    updateCampaignStatus,
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

export default campaignRouter;

