import { notifyUser, notifyRole, notifyReseller } from "../services/socket.service.js";
import mongoose from "mongoose";
import campaignModel from "../models/campaign.model.js";
import userModel from "../models/user.model.js";
import walletModel from "../models/wallet.model.js";
import transactionModel from "../models/transaction.model.js";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import cloudinary from "../config/cloudinary.config.js";

export const createCampaign = async (req, res) => {
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction({
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority", j: true },
    });

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

        // Upload files to Cloudinary or local fallback with size limits and image compression
        const IMG_MAX_SIZE = parseInt(process.env.IMG_MAX_SIZE_MB || "5") * 1024 * 1024; // default 5 MB
        const AUDIO_MAX_SIZE = parseInt(process.env.AUDIO_MAX_SIZE_MB || "7") * 1024 * 1024; // default 7 MB
        const VIDEO_MAX_SIZE = parseInt(process.env.VIDEO_MAX_SIZE_MB || "7") * 1024 * 1024; // default 7 MB
        const DOC_MAX_SIZE = parseInt(process.env.DOC_MAX_SIZE_MB || "3") * 1024 * 1024; // default 3 MB

        const uploadField = async (field) => {
            if (!req.files || !req.files[field]) return [];
            const useCloudinary = process.env.USE_CLOUDINARY === "true";
            const limitMap = {
                images: IMG_MAX_SIZE,
                audio: AUDIO_MAX_SIZE,
                video: VIDEO_MAX_SIZE,
                documents: DOC_MAX_SIZE,
            };
            const fieldLimit = limitMap[field] || IMG_MAX_SIZE;

            // Validate size limits
            const oversized = req.files[field].find((file) => file.size > fieldLimit);
            if (oversized) {
                throw new Error(`${field} file ${oversized.originalname} exceeds size limit of ${fieldLimit / (1024 * 1024)} MB`);
            }

            // Prepare buffers (compress images)
            const buffers = await Promise.all(
                req.files[field].map(async (file) => {
                    if (field === "images") {
                        // Compress image to WebP using sharp
                        return await sharp(file.buffer)
                            .rotate()
                            .resize({ width: 1920, withoutEnlargement: true })
                            .webp({ quality: 80 })
                            .toBuffer();
                    }
                    return file.buffer;
                })
            );

            if (useCloudinary) {
                // Upload to Cloudinary
                const uploads = await Promise.all(
                    buffers.map((buf, idx) =>
                        new Promise((resolve, reject) => {
                            const uploadStream = cloudinary.uploader.upload_stream(
                                { folder: `${field}s` },
                                (error, result) => {
                                    if (error) reject(error);
                                    else resolve(result.secure_url);
                                }
                            );
                            uploadStream.end(buf);
                        })
                    )
                );
                return uploads;
            } else {
                // Local storage fallback
                const localDir = path.join(__dirname, "../../../uploads", `${field}s`);
                fs.mkdirSync(localDir, { recursive: true });
                const uploads = await Promise.all(
                    buffers.map((buf, idx) => {
                        const originalName = req.files[field][idx].originalname;
                        const filename = `${Date.now()}_${originalName}`;
                        const filepath = path.join(localDir, filename);
                        fs.writeFileSync(filepath, buf);
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
            missingFields.push("messageBody, templateId, or media (images, audio, video, documents)");
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
        let updatedWallet = null;
        let rate = null;
        let requiredCredits = 0;

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

            rate = senderUser.ratePerMsg && senderUser.ratePerMsg > 0 ? senderUser.ratePerMsg : 12;
            requiredCredits = totalRecipients * rate;

            // ATOMIC ISOLATION GUARD (Compare-And-Swap):
            // Deducts strictly if current balance >= requiredCredits at DB engine level
            updatedWallet = await walletModel.findOneAndUpdate(
                {
                    userId: req.user._id,
                    balance: { $gte: requiredCredits },
                },
                {
                    $inc: { balance: -requiredCredits },
                },
                {
                    new: true,
                    session: mongoSession,
                }
            );

            if (!updatedWallet) {
                const currentWallet = await walletModel.findOne({ userId: req.user._id }).session(mongoSession);
                const available = currentWallet ? currentWallet.balance : 0;
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({
                    message: `Insufficient credits to launch campaign. Required: ${requiredCredits} credits (${totalRecipients} unique recipients × ${rate}/msg), Available: ${available} credits.`,
                    success: false,
                    required: requiredCredits,
                    available,
                    uniqueRecipients: totalRecipients,
                    duplicatesFiltered: duplicateOccurrences,
                });
            }

            creditDeduction = {
                amount: requiredCredits,
                remainingBalance: updatedWallet.balance,
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
                    creditsDeducted: creditDeduction ? creditDeduction.amount : 0,
                    rateSnapshot: rate,
                },
            ],
            { session: mongoSession }
        );

        // Record transaction audit log linking campaignId
        if (creditDeduction && updatedWallet) {
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
                        campaignId: createdCampaigns[0]._id,
                        notes: auditNotes,
                        rateSnapshot: rate,
                        balanceAfterFrom: updatedWallet.balance,
                        balanceAfterTo: updatedWallet.balance,
                        performedBy: req.user._id,
                    },
                ],
                { session: mongoSession }
            );
        }

        await mongoSession.commitTransaction();
        mongoSession.endSession();

        // ── Real-Time WebSockets (POST-COMMIT) ────────────────────
        // 1. Notify client's other tabs & active view of updated balance
        if (creditDeduction && updatedWallet) {
            notifyUser(req.user._id, "WALLET_UPDATED", {
                newBalance: updatedWallet.balance,
                delta: -requiredCredits,
                reason: "DEDUCT",
                campaignTitle,
                campaignId: createdCampaigns[0]._id,
            });
        }

        // 2. Notify Super Admin live triage queue
        notifyRole("Super Admin", "NEW_CAMPAIGN_SUBMITTED", {
            campaignId: createdCampaigns[0]._id,
            campaignTitle,
            totalRecipients,
            submittedBy: req.user.username || req.user.email,
            role: req.user.role,
            submittedAt: createdCampaigns[0].createdAt,
        });

        // 3. Notify Reseller if this was launched by their client
        if (req.user.resellerId) {
            notifyReseller(req.user.resellerId, "CLIENT_CAMPAIGN_LAUNCHED", {
                clientId: req.user._id,
                clientName: req.user.username,
                campaignId: createdCampaigns[0]._id,
                campaignTitle,
                totalRecipients,
            });
        }

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

        // ── Real-Time WebSockets ──────────────────────────────────
        notifyUser(campaign.userId, "CAMPAIGN_UPDATED", {
            campaignId: campaign._id,
            campaignTitle: campaign.campaignTitle,
            previousStatus,
            status: campaign.status,
            updatedAt: campaign.updatedAt,
        });

        notifyRole("Super Admin", "CAMPAIGN_UPDATED", {
            campaignId: campaign._id,
            campaignTitle: campaign.campaignTitle,
            previousStatus,
            status: campaign.status,
            updatedAt: campaign.updatedAt,
        });

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

/**
 * Super Admin ONLY: Manually update campaign response and delivery metrics.
 * Since actual messaging is dispatched via external services, Super Admin inputs
 * real delivery stats (sent, delivered, read, failed, adminNotes, and optionally completed status).
 */
export const updateCampaignMetrics = async (req, res) => {
    const mongoSession = await mongoose.startSession();
    mongoSession.startTransaction({
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority", j: true },
    });

    try {
        if (req.user.role !== "Super Admin") {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(403).json({
                message: "Forbidden: Only Super Admin is authorized to record campaign delivery metrics.",
                success: false,
            });
        }

        const { id } = req.params;
        const { sent, delivered, read = 0, failed = 0, adminNotes = "", status } = req.body;

        if (sent === undefined || delivered === undefined) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: "Missing required delivery metrics: 'sent' and 'delivered' counts are required.",
                success: false,
            });
        }

        const numSent = Number(sent);
        const numDelivered = Number(delivered);
        const numRead = Number(read);
        const numFailed = Number(failed);

        if (
            isNaN(numSent) || numSent < 0 ||
            isNaN(numDelivered) || numDelivered < 0 ||
            isNaN(numRead) || numRead < 0 ||
            isNaN(numFailed) || numFailed < 0
        ) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: "Metrics 'sent', 'delivered', 'read', and 'failed' must be non-negative numbers.",
                success: false,
            });
        }

        const campaign = await campaignModel.findById(id).session(mongoSession);
        if (!campaign) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(404).json({
                message: "Campaign not found",
                success: false,
            });
        }

        // ── Automated Wrong / Failed Number Refund Flow ───────────
        let refundInfo = null;
        let updatedUserWallet = null;

        const campaignOwner = await userModel.findById(campaign.userId).session(mongoSession);
        const isEligibleForRefund = campaignOwner && campaignOwner.role !== "Super Admin";

        if (isEligibleForRefund && numFailed > 0) {
            const alreadyRefunded = campaign.campaignSummary?.creditsRefunded || 0;

            if (alreadyRefunded > 0) {
                console.log(`Campaign ${campaign._id} was already refunded ${alreadyRefunded} credits. Skipping duplicate refund.`);
            } else {
                const rate = campaign.rateSnapshot || campaignOwner.ratePerMsg || 12;
                let refundAmount = numFailed * rate;

                // Cap refund so it never exceeds total credits deducted
                if (campaign.creditsDeducted > 0 && refundAmount > campaign.creditsDeducted) {
                    refundAmount = campaign.creditsDeducted;
                }

                if (refundAmount > 0) {
                    // Atomic Guarded Increment on user's wallet
                    updatedUserWallet = await walletModel.findOneAndUpdate(
                        { userId: campaign.userId },
                        {
                            $inc: { balance: refundAmount },
                            $setOnInsert: { resellerId: campaignOwner.resellerId || null },
                        },
                        {
                            new: true,
                            upsert: true,
                            session: mongoSession,
                        }
                    );

                    // Insert immutable ledger record (with partial unique index guard on { campaignId: 1, type: "REFUND" })
                    const refundTransaction = await transactionModel.create(
                        [
                            {
                                fromUser: req.user._id,
                                toUser: campaign.userId,
                                amount: refundAmount,
                                type: "REFUND",
                                campaignId: campaign._id,
                                notes: `Automated refund for ${numFailed} failed/wrong number(s) on campaign "${campaign.campaignTitle}" at rate ${rate}/msg`,
                                rateSnapshot: rate,
                                balanceAfterTo: updatedUserWallet.balance,
                                performedBy: req.user._id,
                            },
                        ],
                        { session: mongoSession }
                    );

                    campaign.campaignSummary.creditsRefunded = refundAmount;
                    refundInfo = {
                        amount: refundAmount,
                        failedCount: numFailed,
                        rate,
                        newBalance: updatedUserWallet.balance,
                        transactionId: refundTransaction[0]._id,
                    };
                }
            }
        }

        // Update campaign summary metrics
        campaign.campaignSummary.sent = numSent;
        campaign.campaignSummary.delivered = numDelivered;
        campaign.campaignSummary.read = numRead;
        campaign.campaignSummary.failed = numFailed;
        campaign.campaignSummary.adminNotes = typeof adminNotes === "string" ? adminNotes.trim() : "";
        campaign.campaignSummary.reportedAt = new Date();
        campaign.campaignSummary.reportedBy = req.user._id;

        // If status is provided, update status as well
        if (status) {
            const allowedStatuses = [
                "draft",
                "scheduled",
                "pending",
                "ongoing",
                "completed",
                "sent",
                "paused",
                "stopped",
                "failed",
            ];
            if (allowedStatuses.includes(status)) {
                campaign.status = status;
                if (status === "completed" || status === "sent" || status === "stopped" || status === "failed") {
                    campaign.campaignEndDate = new Date();
                }
            }
        }

        await campaign.save({ session: mongoSession });

        await mongoSession.commitTransaction();
        mongoSession.endSession();

        // ── Real-Time WebSockets (POST-COMMIT) ────────────────────
        // 1. If refund was issued, immediately notify client's wallet
        if (refundInfo && updatedUserWallet) {
            notifyUser(campaign.userId, "WALLET_UPDATED", {
                newBalance: updatedUserWallet.balance,
                delta: +refundInfo.amount,
                reason: "REFUND",
                campaignTitle: campaign.campaignTitle,
                campaignId: campaign._id,
                failedCount: numFailed,
            });
        }

        // 2. Notify client of campaign delivery metrics and status update
        notifyUser(campaign.userId, "CAMPAIGN_UPDATED", {
            campaignId: campaign._id,
            campaignTitle: campaign.campaignTitle,
            status: campaign.status,
            delivered: numDelivered,
            sent: numSent,
            failed: numFailed,
            read: numRead,
            creditsRefunded: campaign.campaignSummary.creditsRefunded,
            updatedAt: campaign.updatedAt,
        });

        // 3. Notify Super Admin & Reseller
        notifyRole("Super Admin", "CAMPAIGN_UPDATED", {
            campaignId: campaign._id,
            status: campaign.status,
            delivered: numDelivered,
            failed: numFailed,
        });

        if (campaignOwner && campaignOwner.resellerId) {
            notifyReseller(campaignOwner.resellerId, "CLIENT_CAMPAIGN_UPDATED", {
                clientId: campaign.userId,
                campaignId: campaign._id,
                campaignTitle: campaign.campaignTitle,
                status: campaign.status,
                delivered: numDelivered,
                failed: numFailed,
            });
        }

        return res.status(200).json({
            success: true,
            message: "Campaign delivery metrics recorded successfully." + (refundInfo ? ` ${refundInfo.amount} credits refunded for ${refundInfo.failedCount} failed messages.` : ""),
            data: {
                id: campaign._id,
                campaignTitle: campaign.campaignTitle,
                status: campaign.status,
                campaignSummary: campaign.campaignSummary,
                updatedAt: campaign.updatedAt,
            },
            refund: refundInfo,
        });
    } catch (error) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        console.error("Update campaign metrics error:", error);
        return res.status(500).json({
            message: error.message || "Failed to update campaign metrics",
            success: false,
        });
    }
};

export default {
    createCampaign,
    getCampaigns,
    getCampaignById,
    updateCampaignStatus,
    updateCampaignMetrics,
};
