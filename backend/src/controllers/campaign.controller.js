import campaignModel from "../models/campaign.model.js";
import userModel from "../models/user.model.js";

export const createCampaign = async (req, res) => {
    try {
        const {
            campaignTitle,
            campaignDescription,
            templateId,
            messageBody,
            recipients,
            schedule,
            scheduledTime,
            attachments,
            mediaId,
            variables,
            messageType,
            status,
        } = req.body;

        // Check required fields (userId is securely taken from authenticated req.user._id)
        const missingFields = [];
        if (!campaignTitle) missingFields.push("campaignTitle");
        if (!campaignDescription) missingFields.push("campaignDescription");
        if (!messageBody && !templateId) missingFields.push("messageBody or templateId");
        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            missingFields.push("recipients (non-empty array)");
        }

        if (missingFields.length > 0) {
            return res.status(400).json({
                message: `${missingFields.join(", ")} ${missingFields.length === 1 ? "is" : "are"} required`,
                missingFields,
                success: false,
            });
        }

        const campaign = await campaignModel.create({
            userId: req.user._id,
            campaignTitle,
            campaignDescription,
            templateId: templateId || null,
            messageBody: messageBody || "",
            recipients,
            schedule: schedule || "now",
            scheduledTime: scheduledTime || null,
            attachments: attachments || [],
            mediaId: mediaId || null,
            variables: variables || [],
            totalRecipients: recipients.length,
            messageType: messageType || "text",
            status: status || (schedule === "later" ? "scheduled" : "pending"),
            campaignStartDate: schedule === "now" ? new Date() : null,
        });

        return res.status(201).json({
            message: "Campaign created successfully",
            success: true,
            data: campaign,
        });
    } catch (error) {
        console.error("Create campaign error:", error);
        return res.status(500).json({
            message: error.message || "Internal server error",
            success: false,
        });
    }
};

/**
 * Get all campaigns based on role permissions:
 * - Super Admin: sees ALL campaigns across the entire platform.
 * - Reseller: sees their own campaigns + campaigns created by users under their resellerId.
 * - User: sees only their own campaigns.
 */
export const getCampaigns = async (req, res) => {
    try {
        let filter = {};

        if (req.user.role === "Super Admin") {
            // Super Admin sees everything
            filter = {};
        } else if (req.user.role === "Reseller") {
            // Find all client users created under this reseller
            const clientUsers = await userModel.find({ resellerId: req.user._id }).select("_id");
            const clientIds = clientUsers.map((u) => u._id);

            // Reseller sees their own campaigns + their client users' campaigns
            filter = {
                userId: { $in: [req.user._id, ...clientIds] },
            };
        } else {
            // Regular User sees only their own campaigns
            filter = { userId: req.user._id };
        }

        const campaigns = await campaignModel
            .find(filter)
            .select("-recipients")
            .populate("userId", "username email role")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: campaigns.length,
            data: campaigns,
        });
    } catch (error) {
        console.error("Get campaigns error:", error);
        return res.status(500).json({
            message: "Failed to fetch campaigns",
            success: false,
        });
    }
};

/**
 * Get single campaign by ID:
 * - Super Admin: can view any campaign.
 * - Reseller: can view their own campaign or any campaign created by their clients.
 * - User: can only view their own campaign.
 */
export const getCampaignById = async (req, res) => {
    try {
        const { id } = req.params;
        const campaign = await campaignModel
            .findById(id)
            .populate("templateId", "title body")
            .populate("userId", "username email role resellerId");

        if (!campaign) {
            return res.status(404).json({
                message: "Campaign not found",
                success: false,
            });
        }

        const isOwner = campaign.userId._id.toString() === req.user._id.toString();
        const isSuperAdmin = req.user.role === "Super Admin";
        const isAssignedReseller =
            req.user.role === "Reseller" &&
            campaign.userId.resellerId &&
            campaign.userId.resellerId.toString() === req.user._id.toString();

        if (!isOwner && !isSuperAdmin && !isAssignedReseller) {
            return res.status(403).json({
                message: "Forbidden: You do not have permission to view this campaign",
                success: false,
            });
        }

        return res.status(200).json({
            success: true,
            data: campaign,
        });
    } catch (error) {
        console.error("Get campaign by ID error:", error);
        return res.status(500).json({
            message: "Failed to fetch campaign details",
            success: false,
        });
    }
};

export default {
    createCampaign,
    getCampaigns,
    getCampaignById,
};
