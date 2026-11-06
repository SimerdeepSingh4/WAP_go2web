import { Router } from "express";
import { creditRequest } from "../helpers/credit-operation.js";
import {
    createCampaign,
    getCampaigns,
    getCampaignById,
    updateCampaignStatus,
    updateCampaignMetrics,
    saveCampaignReport,
    updateCampaignRecipientsManagement,
    downloadRecipientReportTemplate,
    uploadRecipientReport,
    downloadRecipientReport,
    exportCampaignRecipients,
    cancelScheduledCampaign,
    rescheduleCampaign,
    launchCampaignNow,
    exportRecipientDraft,
    deleteCampaign,
} from "../controllers/campaign.controller.js";
import {
    protect,
    authorizeRoles,
    blockInPreviewMode,
} from "../middlewares/auth.middleware.js";
import { uploadDocument, uploadFiles } from "../middlewares/upload.middleware.js";
const campaignRouter = Router();

campaignRouter.use(protect);

campaignRouter.post("/", blockInPreviewMode("Campaign creation"), uploadFiles, creditRequest, createCampaign);
campaignRouter.get("/", getCampaigns);
campaignRouter.get("/:id/recipient-report", downloadRecipientReport);
campaignRouter.get("/:id/export-recipients", exportCampaignRecipients);
campaignRouter.post("/:id/recipient-report/export", authorizeRoles("Super Admin"), exportRecipientDraft);
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

// STRICTLY Super Admin ONLY: Recipient management, permanent row numbers, filter & custom tabs
campaignRouter.put(
    "/:id/recipients-management",
    authorizeRoles("Super Admin"),
    blockInPreviewMode("Campaign recipients management"),
    updateCampaignRecipientsManagement
);

// STRICTLY Super Admin ONLY: Configure dynamic categories, billing rules and save report
campaignRouter.put(
    "/:id/report",
    authorizeRoles("Super Admin"),
    blockInPreviewMode("Campaign report update"),
    saveCampaignReport
);

// Only Super Admin can approve or change campaign status.
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

campaignRouter.delete("/:id", deleteCampaign);

export default campaignRouter;

