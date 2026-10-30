import mongoose from "mongoose";
import campaignModel from "../models/campaign.model.js";
import userModel from "../models/user.model.js";
import walletModel from "../models/wallet.model.js";
import transactionModel from "../models/transaction.model.js";
import fs from "fs";
import path from "path";
import cloudinary from "../config/cloudinary.config.js";

export const createCampaign = async (req, res) => {
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction();

    try {
        const {
            campaignTitle,
            campaignDescription,
            templateId,
            messageBody,
            recipients,
            schedule,
            scheduledTime,
        
            thumbnail,
            attachments,
            mediaId,
            variables,
            messageType,
            status,
        } = req.body;

        // Upload files to Cloudinary
        const uploadField = async (field) => {
            if (!req.files || !req.files[field]) return [];
            const useCloudinary = process.env.USE_CLOUDINARY === "true";
            if (useCloudinary) {
                // Cloudinary upload
                const uploads = await Promise.all(
                    req.files[field].map(
                        (file) =>
                            new Promise((resolve, reject) => {
                                const uploadStream = cloudinary.uploader.upload_stream(
                                    { folder: `${field}s` },
                                    (error, result) => {
                                        if (error) reject(error);
                                        else resolve(result.secure_url);
                                    }
                                );
                                uploadStream.end(file.buffer);
                            })
                    )
                );
                return uploads;
            } else {
                // Local storage fallback
                const localDir = path.join(__dirname, "../../../uploads", `${field}s`);
                fs.mkdirSync(localDir, { recursive: true });
                const uploads = await Promise.all(
                    req.files[field].map((file) => {
                        const filename = `${Date.now()}_${file.originalname}`;
                        const filepath = path.join(localDir, filename);
                        fs.writeFileSync(filepath, file.buffer);
                        // Return a relative URL or path that can be saved in DB
                        return `/uploads/${field}s/${filename}`;
                    })
                );
                return uploads;
            }
        };

        // Upload all media fields concurrently with error handling
        let images = [];
        let audio = [];
        let video = [];
        let documents = [];
        try {
            [images, audio, video, documents] = await Promise.all([
                uploadField('images'),
                uploadField('audio'),
                uploadField('video'),
                uploadField('documents'),
            ]);
        } catch (uploadErr) {
            console.error('Media upload error:', uploadErr);
            return res.status(500).json({ message: 'Failed to upload media files', error: uploadErr.message });
        }

        // Check required fields (userId is securely taken from authenticated req.user._id)
        const missingFields = [];
        if (!campaignTitle) missingFields.push("campaignTitle");
        if (!campaignDescription) missingFields.push("campaignDescription");
        
            const hasContent =
                messageBody ||
                templateId ||
                (images && Array.isArray(images) && images.length > 0) ||
                (video && Array.isArray(video) && video.length > 0) ||
                (audio && Array.isArray(audio) && audio.length > 0) ||
                (documents && Array.isArray(documents) && documents.length > 0);

        if (!hasContent) {
            missingFields.push("messageBody, templateId, or media (images, audio, or video)");
        }

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            missingFields.push("recipients (non-empty array)");
        }

        if (missingFields.length > 0) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: `${missingFields.join(", ")} ${missingFields.length === 1 ? "is" : "are"} required`,
                missingFields,
                success: false,
            });
        }

        // ── Single-Campaign Duplicate Detection & Phone Sanitization ──
        const seenNumbers = new Set();
        const duplicatesList = []; // Preserves every duplicate phone number submitted
        const invalidList = [];    // Preserves every invalid/malformed number submitted
        const sanitizedRecipients = [];

        for (const r of recipients) {
            const rawPhone = typeof r === "string" ? r : r.phoneNumber || "";
            // Keep digits only
            const clean = String(rawPhone).replace(/\D/g, "");

            // International phone format validation (E.164: 10 to 15 digits)
            if (clean.length < 10 || clean.length > 15) {
                invalidList.push(String(rawPhone).trim());
                continue;
            }

            if (seenNumbers.has(clean)) {
                duplicatesList.push(clean);
            } else {
                seenNumbers.add(clean);
                sanitizedRecipients.push({
                    contactId: r.contactId || null,
                    phoneNumber: clean,
                    status: "queued",
                });
            }
        }

        if (sanitizedRecipients.length === 0) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: `No valid phone numbers found. Rejected invalid entries: ${invalidList.slice(0, 10).join(", ")}${invalidList.length > 10 ? "..." : ""}`,
                success: false,
                stats: {
                    totalSubmitted: recipients.length,
                    invalidCount: invalidList.length,
                    invalidNumbers: invalidList,
                    duplicateCount: duplicatesList.length,
                    duplicatesList,
                },
            });
        }

        // Only bill and queue UNIQUE, VALID phone numbers!
        const totalRecipients = sanitizedRecipients.length;
        const duplicateOccurrences = duplicatesList.length;
        const invalidCount = invalidList.length;
        let creditDeduction = null;

        // Check and deduct credits for User and Reseller roles (Super Admin has unlimited pool)
        if (req.user.role !== "Super Admin") {
            const senderUser = await userModel
                .findById(req.user._id)
                .session(mongoSession);

            if (!senderUser) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(404).json({
                    message: "Sender user not found.",
                    success: false,
                });
            }

            const rate = senderUser.ratePerMsg && senderUser.ratePerMsg > 0 ? senderUser.ratePerMsg : 12;
            const requiredCredits = totalRecipients * rate;

            const wallet = await walletModel
                .findOne({ userId: req.user._id })
                .session(mongoSession);

            const currentBalance = wallet ? wallet.balance : 0;

            if (!wallet || currentBalance < requiredCredits) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({
                    message: `Insufficient credits to launch campaign. Required: ${requiredCredits} credits (${totalRecipients} unique recipients × ${rate}/msg), Available: ${currentBalance} credits.`,
                    success: false,
                    required: requiredCredits,
                    available: currentBalance,
                    uniqueRecipients: totalRecipients,
                    duplicatesFiltered: duplicateOccurrences,
                });
            }

            // Deduct credits from wallet
            wallet.balance -= requiredCredits;
            await wallet.save({ session: mongoSession });

            // Record transaction audit log
            const auditNotes = duplicateOccurrences > 0
                ? `Campaign "${campaignTitle}": ${totalRecipients} unique recipient(s) (${duplicateOccurrences} duplicate(s) filtered out) at rate ${rate}/msg`
                : `Campaign "${campaignTitle}": ${totalRecipients} recipient(s) at rate ${rate}/msg`;

            await transactionModel.create(
                [
                    {
                        fromUser: req.user._id,
                        toUser: req.user._id,
                        amount: requiredCredits,
                        type: "DEDUCT",
                        notes: auditNotes,
                        rateSnapshot: rate,
                        balanceAfterFrom: wallet.balance,
                        balanceAfterTo: wallet.balance,
                        performedBy: req.user._id,
                    },
                ],
                { session: mongoSession }
            );

            creditDeduction = {
                amount: requiredCredits,
                remainingBalance: wallet.balance,
                ratePerMsg: rate,
            };
        }

        // Determine inferred messageType if not specified
        let resolvedMessageType = messageType || "text";
        if (!messageType) {
            const hasImages = images && images.length > 0;
            const hasVideo = video && video.length > 0;
            const hasAudio = audio && audio.length > 0;
            const countTypes = (hasImages ? 1 : 0) + (hasVideo ? 1 : 0) + (hasAudio ? 1 : 0);

            if (countTypes > 1) {
                resolvedMessageType = "mixed";
            } else if (hasImages) {
                resolvedMessageType = "image";
            } else if (hasVideo) {
                resolvedMessageType = "video";
            } else if (hasAudio) {
                resolvedMessageType = "audio";
            }
        }

        const createdCampaigns = await campaignModel.create(
            [
                {
                    userId: req.user._id,
                    campaignTitle,
                    campaignDescription,
                    templateId: templateId || null,
                    messageBody: messageBody || "",
                    recipients: sanitizedRecipients,
                    recipientStats: {
                        totalSubmitted: recipients.length,
                        uniqueCount: totalRecipients,
                        duplicateCount: duplicateOccurrences,
                        invalidCount,
                        duplicatesList, // Full preserved list of duplicate numbers
                    },
                    schedule: schedule || "now",
                    scheduledTime: scheduledTime || null,
                    images: images || [],
                    audio: audio || [],
                    video: video || [],
                    documents: documents || [],
                    thumbnail: thumbnail || null,
                    attachments: attachments || [],
                    mediaId: mediaId || null,
                    variables: variables || [],
                    totalRecipients,
                    messageType: resolvedMessageType,
                    status: status || (schedule === "later" ? "scheduled" : "pending"),
                    campaignStartDate: schedule === "now" ? new Date() : null,
                },
            ],
            { session: mongoSession }
        );

        await mongoSession.commitTransaction();
        mongoSession.endSession();

        let notice = "";
        if (duplicateOccurrences > 0 && invalidCount > 0) {
            notice = ` (${duplicateOccurrences} duplicates removed, ${invalidCount} invalid numbers rejected: ${invalidList.slice(0, 5).join(", ")}${invalidList.length > 5 ? "..." : ""})`;
        } else if (duplicateOccurrences > 0) {
            notice = ` (${duplicateOccurrences} duplicate numbers removed)`;
        } else if (invalidCount > 0) {
            notice = ` (${invalidCount} invalid numbers rejected: ${invalidList.slice(0, 5).join(", ")}${invalidList.length > 5 ? "..." : ""})`;
        }

        return res.status(201).json({
            message: `Campaign created successfully!${notice}`,
            success: true,
            data: createdCampaigns[0],
            creditDeduction,
            duplicateStats: {
                totalSubmitted: recipients.length,
                uniqueRecipients: totalRecipients,
                duplicatesFound: duplicateOccurrences,
                duplicatesList, // Preserved in full for frontend
                invalidCount,
                invalidNumbers: invalidList, // Shown directly to user
            },
        });
    } catch (error) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
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

/**
 * PATCH /api/campaigns/:id/status
 * -------------------------------
 * Update status of any campaign.
 * STRICTLY RESTRICTED: Only Super Admin can change campaign status.
 *
 * Body: { status }
 * Allowed statuses: ["draft", "pending", "sent", "failed", "scheduled", "paused", "stopped"]
 */
export const updateCampaignStatus = async (req, res) => {
    try {
        if (req.user.role !== "Super Admin") {
            return res.status(403).json({
                message: "Forbidden: Only Super Admin is authorized to change campaign status.",
                success: false,
            });
        }

        const { id } = req.params;
        const { status } = req.body;

        // Limited manual statuses allowed for Super Admin intervention:
        // Everything else ('draft', 'scheduled', 'completed') is managed automatically by the system.
        const allowedManualStatuses = [
            "paused",
            "stopped",
            "failed",
            "ongoing",
        ];

        if (!status || !allowedManualStatuses.includes(status)) {
            return res.status(400).json({
                message: `Invalid status. Super Admin manual override is limited to: ${allowedManualStatuses.join(", ")}. Lifecycle statuses ('draft', 'scheduled', 'completed') are managed automatically by the platform.`,
                success: false,
                allowedManualStatuses,
            });
        }

        const campaign = await campaignModel.findById(id);
        if (!campaign) {
            return res.status(404).json({
                message: "Campaign not found",
                success: false,
            });
        }

        const previousStatus = campaign.status;
        campaign.status = status;

        if (status === "stopped" || status === "failed") {
            campaign.campaignEndDate = new Date();
        } else if (status === "ongoing" && !campaign.campaignStartDate) {
            campaign.campaignStartDate = new Date();
        }

        await campaign.save();

        return res.status(200).json({
            success: true,
            message: `Campaign status updated from "${previousStatus}" to "${status}" successfully.`,
            data: {
                id: campaign._id,
                campaignTitle: campaign.campaignTitle,
                previousStatus,
                status: campaign.status,
                updatedAt: campaign.updatedAt,
            },
        });
    } catch (error) {
        console.error("Update campaign status error:", error);
        return res.status(500).json({
            message: error.message || "Failed to update campaign status",
            success: false,
        });
    }
};

export default {
    createCampaign,
    getCampaigns,
    getCampaignById,
    updateCampaignStatus,
};
