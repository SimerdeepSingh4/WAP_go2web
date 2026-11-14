import { Router } from "express";
import { creditRequest, retryCreditController } from "../helpers/credit-operation.js";
import Campaign from "../models/campaign.model.js";
import {
    createCampaign,
    getCampaigns,
    getCampaignById,
    updateCampaignStatus,
    updateCampaignMetrics,
    saveCampaignReport,
    updateCampaignRecipientsManagement,
    downloadRecipientReportTemplate,
    downloadCampaignDocument,
    uploadRecipientReport,
    downloadRecipientReport,
    exportCampaignRecipients,
    cancelScheduledCampaign,
    rescheduleCampaign,
    launchCampaignNow,
    exportRecipientDraft,
    deleteCampaign,
    downloadProfileDp,
    getCampaignDailyUsage,
} from "../controllers/campaign.controller.js";
import {
    protect,
    authorizeRoles,
    blockInPreviewMode,
} from "../middlewares/auth.middleware.js";
import { uploadDocument, uploadFiles } from "../middlewares/upload.middleware.js";
import { getTrackedNumbers, addTrackedNumbers, saveTrackedContacts, updateTrackedNote } from "../controllers/recipient-tracking.controller.js";
const campaignRouter = Router();
const campaignWallets = async req => {
    const campaign = await Campaign.findById(req.params.id).select("userId").lean();
    return [campaign?.userId];
};

campaignRouter.use(protect);

campaignRouter.post("/", blockInPreviewMode("Campaign creation"), uploadFiles, creditRequest, retryCreditController(createCampaign, { walletIds: req => req.user.role === "Super Admin" ? [] : [req.user._id] }));
campaignRouter.get("/daily-usage", getCampaignDailyUsage);
campaignRouter.get("/", getCampaigns);
campaignRouter.get("/:id/tracked-numbers", authorizeRoles("Super Admin"), blockInPreviewMode("Recipient tracking"), getTrackedNumbers);
campaignRouter.post("/:id/tracked-numbers", authorizeRoles("Super Admin"), blockInPreviewMode("Recipient tracking"), addTrackedNumbers);
campaignRouter.post("/:id/tracked-numbers/contacts", authorizeRoles("Super Admin"), blockInPreviewMode("Saving tracked contacts"), saveTrackedContacts);
campaignRouter.patch("/:id/tracked-numbers/:phoneNumber", authorizeRoles("Super Admin"), blockInPreviewMode("Editing tracked notes"), updateTrackedNote);
campaignRouter.get("/:id/recipient-report", downloadRecipientReport);
campaignRouter.get("/:id/export-recipients", exportCampaignRecipients);
campaignRouter.get("/:id/profile-dp", downloadProfileDp);
campaignRouter.get("/:id/documents/:documentId", downloadCampaignDocument);
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

campaignRouter.post(
    "/:id/cancel",
    blockInPreviewMode("Campaign cancellation"),
    retryCreditController(cancelScheduledCampaign, { walletIds: campaignWallets })
);

// STRICTLY Super Admin ONLY: Recipient management, permanent row numbers, filter & custom tabs
campaignRouter.put(
    "/:id/recipients-management",
    authorizeRoles("Super Admin"),
    blockInPreviewMode("Campaign recipients management"),
    retryCreditController(updateCampaignRecipientsManagement, { walletIds: campaignWallets })
);

// STRICTLY Super Admin ONLY: Configure dynamic categories, billing rules and save report
campaignRouter.put(
    "/:id/report",
    authorizeRoles("Super Admin"),
    blockInPreviewMode("Campaign report update"),
    retryCreditController(saveCampaignReport, { walletIds: campaignWallets })
);

// Only Super Admin can approve or change campaign status.
campaignRouter.patch(
    "/:id/status",
    authorizeRoles("Super Admin"),
    blockInPreviewMode("Campaign status update"),
    retryCreditController(updateCampaignStatus, { walletIds: campaignWallets })
);

// STRICTLY Super Admin ONLY: Input actual campaign response and delivery metrics
campaignRouter.patch(
    "/:id/metrics",
    authorizeRoles("Super Admin"),
    blockInPreviewMode("Campaign metrics update"),
    retryCreditController(updateCampaignMetrics, { walletIds: campaignWallets })
);

campaignRouter.delete("/:id", deleteCampaign);

export default campaignRouter;

