import { Router } from "express";
import {
    createCampaign,
    getCampaigns,
    getCampaignById,
    updateCampaignStatus,
    updateCampaignMetrics,
    downloadRecipientReportTemplate,
    uploadRecipientReport,
    downloadRecipientReport,
} from "../controllers/campaign.controller.js";
import {
    protect,
    authorizeRoles,
    blockInPreviewMode,
} from "../middlewares/auth.middleware.js";
import { uploadDocument, uploadFiles } from "../middlewares/upload.middleware.js";
const campaignRouter = Router();

campaignRouter.use(protect);

campaignRouter.post("/", uploadFiles, blockInPreviewMode("Campaign creation"), createCampaign);
campaignRouter.get("/", getCampaigns);
campaignRouter.get("/:id/recipient-report", downloadRecipientReport);
campaignRouter.get(
    "/:id/recipient-report/template",
    authorizeRoles("Super Admin"),
    blockInPreviewMode("Recipient report template download"),
    downloadRecipientReportTemplate
);
campaignRouter.post(
    "/:id/recipient-report",
    authorizeRoles("Super Admin"),
    blockInPreviewMode("Recipient report upload"),
    uploadDocument.single("file"),
    uploadRecipientReport
);
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

