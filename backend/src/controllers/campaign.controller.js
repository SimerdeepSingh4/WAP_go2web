import mongoose from "mongoose";
import campaignModel from "../models/campaign.model.js";
import userModel from "../models/user.model.js";
import walletModel from "../models/wallet.model.js";
import transactionModel from "../models/transaction.model.js";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import cloudinary from "../config/cloudinary.config.js";
import { notifyUser, notifyRole, notifyReseller } from "../services/socket.service.js";
import { scheduleCampaignJob, cancelCampaignJob } from "../queues/campaign.queue.js";
import xlsx from "xlsx";
import { loadSpreadsheetRows, saveSpreadsheetRows } from "../helpers/spreadsheet-storage.js";
import { normalizeColumns, buildPublishedSheet, normalizeDuplicateRows } from "../../../shared/campaignSpreadsheet.js";

const REPORT_CATEGORIES = [
    "whatsapp_successful",
    "non_whatsapp_failed",
    "spam",
];

const REPORT_CATEGORY_LABELS = {
    whatsapp_successful: "WhatsApp Successful",
    non_whatsapp_failed: "Non-WhatsApp Failed",
    spam: "Spam",
};

function makeWorkbookBuffer(rows, sheetName) {
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
    return xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
}

async function findCampaignForReport(req, id) {
    const campaign = await campaignModel.findById(id).populate("userId", "username email role resellerId");
    if (!campaign) return { error: { status: 404, message: "Campaign not found." } };

    const ownsCampaign = String(campaign.userId._id) === String(req.user._id);
    const isSuperAdmin = req.user.role === "Super Admin";
    const isAssignedReseller = req.user.role === "Reseller" &&
        String(campaign.userId.resellerId || "") === String(req.user._id);

    if (!ownsCampaign && !isSuperAdmin && !isAssignedReseller) {
        return { error: { status: 403, message: "You cannot access this campaign report." } };
    }
    return { campaign };
}

export const downloadRecipientReportTemplate = async (req, res) => {
    try {
        const campaign = await campaignModel.findById(req.params.id).select("campaignTitle recipients");
        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found." });

        const rows = [
            ["Phone Number", "Status"],
            ...(campaign.recipients || []).map((recipient) => [recipient.phoneNumber || "", ""]),
        ];
        const buffer = makeWorkbookBuffer(rows, "Recipient Report");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${campaign._id}-recipient-report-template.xlsx"`);
        return res.send(buffer);
    } catch (error) {
        console.error("Download recipient report template error:", error);
        return res.status(500).json({ success: false, message: "Failed to create report template." });
    }
};

export const uploadRecipientReport = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: "Upload an .xlsx report file." });

        const campaign = await campaignModel.findById(req.params.id).select("campaignTitle userId recipients recipientReport");
        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found." });

        const workbook = xlsx.read(req.file.buffer, { type: "buffer", cellDates: false });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!firstSheet) return res.status(400).json({ success: false, message: "The workbook has no worksheet." });
        const rows = xlsx.utils.sheet_to_json(firstSheet, { defval: "", raw: false });
        if (!rows.length) return res.status(400).json({ success: false, message: "The report worksheet is empty." });

        const header = (value) => String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const columns = Object.keys(rows[0]);
        const phoneColumn = columns.find((column) => ["phonenumber", "phone", "number", "mobile"].includes(header(column)));
        const statusColumn = columns.find((column) => ["status", "category", "result"].includes(header(column)));
        const categoryByInput = new Map([
            ["whatsappsuccessful", "whatsapp_successful"],
            ["whatsappsuccessfully", "whatsapp_successful"],
            ["nonwhatsappfailed", "non_whatsapp_failed"],
            ["spam", "spam"],
        ]);
        const categoryColumns = new Map(
            columns
                .map((column) => [categoryByInput.get(header(column)), column])
                .filter(([category]) => category)
        );
        const hasThreeCategoryColumns = REPORT_CATEGORIES.every((category) =>
            [...categoryColumns.keys()].includes(category)
        );
        const hasNumberAndStatusColumns = Boolean(phoneColumn && statusColumn);
        if (!hasThreeCategoryColumns && !hasNumberAndStatusColumns) {
            return res.status(400).json({
                success: false,
                message: "Use columns WhatsApp Successful, Non-WhatsApp Failed, and Spam, or the Phone Number and Status template.",
            });
        }

        const originalRecipients = (campaign.recipients || []).map((recipient) => ({
            phoneNumber: String(recipient.phoneNumber || "").replace(/\D/g, ""),
        }));
        const originalNumbers = new Set(originalRecipients.map((recipient) => recipient.phoneNumber));
        const uploadedByNumber = new Map();
        const errors = [];

        function addReportNumber(rawValue, category, rowIndex) {
            const phoneNumber = String(rawValue || "").replace(/\D/g, "");
            if (!phoneNumber) return;
            if (!originalNumbers.has(phoneNumber)) {
                errors.push(`Row ${rowIndex + 2}: ${phoneNumber} is not in this campaign.`);
                return;
            }
            if (uploadedByNumber.has(phoneNumber)) {
                errors.push(`Row ${rowIndex + 2}: ${phoneNumber} appears more than once.`);
                return;
            }
            uploadedByNumber.set(phoneNumber, category);
        }

        rows.forEach((row, index) => {
            if (hasThreeCategoryColumns) {
                for (const [category, column] of categoryColumns) {
                    addReportNumber(row[column], category, index);
                }
                return;
            }

            const rawStatus = header(row[statusColumn]);
            const category = categoryByInput.get(rawStatus);
            const rawPhone = row[phoneColumn];
            if (!rawPhone && !rawStatus) return;
            if (!rawPhone) {
                errors.push(`Row ${index + 2}: phone number is missing.`);
                return;
            }
            if (!category) {
                errors.push(`Row ${index + 2}: choose WhatsApp Successful, Non-WhatsApp Failed, or Spam.`);
                return;
            }
            addReportNumber(rawPhone, category, index);
        });

        for (const recipient of originalRecipients) {
            if (!uploadedByNumber.has(recipient.phoneNumber)) {
                errors.push(`Missing status for ${recipient.phoneNumber}.`);
            }
        }
        if (errors.length) {
            return res.status(400).json({ success: false, message: "Report was not uploaded. Fix the following rows and try again.", errors: errors.slice(0, 25) });
        }

        campaign.recipientReport = {
            records: originalRecipients.map(({ phoneNumber }) => ({
                phoneNumber,
                category: uploadedByNumber.get(phoneNumber),
            })),
            uploadedAt: new Date(),
            uploadedBy: req.user._id,
        };
        await campaign.save();

        notifyUser(campaign.userId, "CAMPAIGN_UPDATED", {
            campaignId: campaign._id,
            campaignTitle: campaign.campaignTitle,
            recipientReportUploaded: true,
        });
        return res.status(200).json({
            success: true,
            message: "Recipient report uploaded successfully.",
            count: campaign.recipientReport.records.length,
            uploadedAt: campaign.recipientReport.uploadedAt,
        });
    } catch (error) {
        console.error("Upload recipient report error:", error);
        return res.status(400).json({ success: false, message: error.message || "Could not read the Excel report." });
    }
};

export const exportRecipientDraft = async (req, res) => {
    try {
        if (req.user.role !== "Super Admin") return res.status(403).json({ success: false, message: "Only Super Admin can export draft recipients." });
        const campaign = await campaignModel.findById(req.params.id);
        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found." });
        const { entries, spreadsheetColumns, cards = [], originalEntries = [] } = req.body;
        if (!Array.isArray(entries) || !entries.length) return res.status(400).json({ success: false, message: "Add recipient numbers before downloading." });
        if (!Array.isArray(cards) || cards.length > 40 || cards.some((card) => !card || typeof card.key !== "string" || typeof card.label !== "string")) return res.status(400).json({ success: false, message: "Invalid recipient cards." });
        if (!Array.isArray(originalEntries)) return res.status(400).json({ success: false, message: "Invalid original recipient list." });
        const sheet = buildPublishedSheet(normalizeDuplicateRows(entries), spreadsheetColumns);
        const workbook = xlsx.utils.book_new();
        const names = new Set();
        const append = (label, rows) => {
            const base = String(label).replace(/[:\\/?*\[\]]/g, " ").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Category";
            let name = base;
            for (let suffix = 2; names.has(name.toLowerCase()); suffix++) {
                const tail = ` (${suffix})`;
                name = base.slice(0, 31 - tail.length) + tail;
            }
            names.add(name.toLowerCase());
            const worksheet = xlsx.utils.aoa_to_sheet(rows);
            worksheet["!cols"] = rows[0].map((_, index) => ({ wch: index === 0 ? 10 : 24 }));
            xlsx.utils.book_append_sheet(workbook, worksheet, name);
        };
        const header = ["Row", ...sheet.columns.map((column) => column.label)];
        const values = (row) => [row.rowNumber, ...sheet.columns.map((column) => row.values[column.id] ?? "")];
        append("All recipients", [header, ...sheet.rows.map(values)]);
        append("Original upload", [["Row", "Phone number"], ...originalEntries.map((row) => [row.rowNumber, String(row.phoneNumber || "")])]);
        const byCard = new Map();
        for (const row of sheet.rows) {
            if (!byCard.has(row.tabKey)) byCard.set(row.tabKey, []);
            byCard.get(row.tabKey).push(row);
        }
        append("Categories", [["Category", "Numbers", "Credit treatment"], ...cards.map((card) => [card.label, byCard.get(card.key)?.length || 0, card.billingAction === "refund" ? "Refunded" : "Charged"])]);
        for (const card of cards) append(card.label, [header, ...(byCard.get(card.key) || []).map(values)]);
        const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", 'attachment; filename="campaign-recipients.xlsx"');
        return res.send(buffer);
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message || "Could not export the recipients." });
    }
};

export const downloadRecipientReport = async (req, res) => {
    try {
        const result = await findCampaignForReport(req, req.params.id);
        if (result.error) return res.status(result.error.status).json({ success: false, message: result.error.message });
        const { campaign } = result;
        if (campaign.publishedSpreadsheet?.publishedAt) {
            const sheet = campaign.publishedSpreadsheet;
            sheet.rows = await loadSpreadsheetRows(campaign._id, "published");
            const rows = [["All index", ...sheet.columns.map((column) => column.label)], ...sheet.rows.map((row) => [row.rowNumber, ...sheet.columns.map((column) => row.values[column.id] ?? "")])];
            const buffer = makeWorkbookBuffer(rows, "Campaign Report");
            res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            res.setHeader("Content-Disposition", 'attachment; filename="campaign-report.xlsx"');
            return res.send(buffer);
        }
        const report = campaign.recipientReport;
        if (!report?.uploadedAt || !report.records?.length) {
            return res.status(404).json({ success: false, message: "No recipient report has been published for this campaign." });
        }

        const categoryByNumber = new Map(report.records.map((record) => [record.phoneNumber, record.category]));
        const orderedRows = [["S.No", "Phone Number", "Status"]];
        const categoryRows = [[
            REPORT_CATEGORY_LABELS.whatsapp_successful,
            REPORT_CATEGORY_LABELS.non_whatsapp_failed,
            REPORT_CATEGORY_LABELS.spam,
        ]];
        for (const [index, recipient] of (campaign.recipients || []).entries()) {
            const phoneNumber = String(recipient.phoneNumber || "");
            const category = categoryByNumber.get(phoneNumber);
            orderedRows.push([
                index + 1,
                phoneNumber,
                REPORT_CATEGORY_LABELS[category] || "",
            ]);
            categoryRows.push(REPORT_CATEGORIES.map((item) => item === category ? phoneNumber : ""));
        }

        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(orderedRows), "Ordered Report");
        xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(categoryRows), "Status Columns");
        const summary = campaign.campaignSummary || {};
        const totalsRows = [
            ["Delivery totals", "Count"],
            ["Sent", Number(summary.sent) || 0],
            ["Delivered", Number(summary.delivered) || 0],
            ["Read", Number(summary.read) || 0],
            ["Failed", Number(summary.failed) || 0],
            [],
            ["Report published", summary.reportedAt ? new Date(summary.reportedAt).toISOString() : "Not published"],
            ["Admin note", summary.adminNotes || ""],
        ];
        xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(totalsRows), "Delivery Totals");
        const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });
        const safeTitle = String(campaign.campaignTitle || "campaign-report").replace(/[^a-z0-9_-]+/gi, "-");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}-report.xlsx"`);
        return res.send(buffer);
    } catch (error) {
        console.error("Download recipient report error:", error);
        return res.status(500).json({ success: false, message: "Failed to download recipient report." });
    }
};

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
            recipients: rawInputRecipients,
            schedule,
            scheduledTime,
            thumbnail,
            attachments,
            mediaId,
            variables,
            messageType,
            status,
        } = req.body;

        // Safely parse recipients whether sent as JSON array or via multipart/form-data
        let recipients = rawInputRecipients;
        if (typeof recipients === "string") {
            try {
                recipients = JSON.parse(recipients);
            } catch {
                recipients = recipients.split(/[\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
            }
        }
        if (!Array.isArray(recipients) && recipients) {
            recipients = [recipients];
        }

        // Upload files to Cloudinary or local fallback with size limits and image compression
        const IMG_MAX_SIZE = parseInt(process.env.IMG_MAX_SIZE_MB || "5") * 1024 * 1024; // default 5 MB
        const AUDIO_MAX_SIZE = parseInt(process.env.AUDIO_MAX_SIZE_MB || "7") * 1024 * 1024; // default 7 MB
        const VIDEO_MAX_SIZE = parseInt(process.env.VIDEO_MAX_SIZE_MB || "7") * 1024 * 1024; // default 7 MB
        const DOC_MAX_SIZE = parseInt(process.env.DOC_MAX_SIZE_MB || "3") * 1024 * 1024; // default 3 MB

        const uploadField = async (field) => {
            const fileList =
                req.files?.[field] ||
                (field === "images" ? req.files?.image : null) ||
                (field === "documents" ? (req.files?.pdf || req.files?.document) : null) ||
                [];
            if (!fileList || fileList.length === 0) return [];
            const useCloudinary = process.env.USE_CLOUDINARY === "true";
            const limitMap = {
                images: IMG_MAX_SIZE,
                audio: AUDIO_MAX_SIZE,
                video: VIDEO_MAX_SIZE,
                documents: DOC_MAX_SIZE,
            };
            const fieldLimit = limitMap[field] || IMG_MAX_SIZE;

            // Validate size limits
            const oversized = fileList.find((file) => file.size > fieldLimit);
            if (oversized) {
                throw new Error(`${field} file ${oversized.originalname} exceeds size limit of ${fieldLimit / (1024 * 1024)} MB`);
            }

            // Prepare buffers (compress images)
            const buffers = await Promise.all(
                fileList.map(async (file) => {
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
                    buffers.map((buf) =>
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
                const localDir = path.join(process.cwd(), "uploads", `${field}s`);
                fs.mkdirSync(localDir, { recursive: true });
                const uploads = await Promise.all(
                    buffers.map((buf, idx) => {
                        const originalName = fileList[idx].originalname;
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
                uploadField("images"),
                uploadField("audio"),
                uploadField("video"),
                uploadField("documents"),
            ]);
        } catch (uploadErr) {
            console.error("Media upload error:", uploadErr);
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(500).json({ message: "Failed to upload media files", error: uploadErr.message });
        }

        // Check required fields (userId is securely taken from authenticated req.user._id)
        const missingFields = [];
        if (!campaignTitle) missingFields.push("campaignTitle");
        
        const hasContent =
            messageBody ||
            templateId ||
            (images && Array.isArray(images) && images.length > 0) ||
            (video && Array.isArray(video) && video.length > 0) ||
            (audio && Array.isArray(audio) && audio.length > 0) ||
            (documents && Array.isArray(documents) && documents.length > 0) ||
            (attachments && Array.isArray(attachments) && attachments.length > 0);

        if (!hasContent) {
            missingFields.push("messageBody, templateId, or media (images, audio, video, documents, attachments)");
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

        // Charge every submitted occurrence; dispatch only valid first occurrences.
        const totalRecipients = recipients.length;
        const duplicateOccurrences = duplicatesList.length;
        const invalidCount = invalidList.length;
        let creditDeduction = null;
        let updatedWallet = null;
        let rate = null;
        let requiredCredits = 0;

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

            rate = senderUser.ratePerMsg && senderUser.ratePerMsg > 0 ? senderUser.ratePerMsg : 12;
            requiredCredits = totalRecipients * rate;

            // Check if wallet is expired or locked
            const currentWallet = await walletModel.findOne({ userId: req.user._id }).session(mongoSession);
            const isExpired = Boolean(currentWallet && currentWallet.expiresAt && new Date(currentWallet.expiresAt) <= new Date());
            const isLocked = Boolean(currentWallet && (currentWallet.isLocked || isExpired));

            if (isLocked) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(403).json({
                    message: "Your credit balance has expired and is locked. Please contact administrator to renew.",
                    success: false,
                    isLocked: true,
                    expiresAt: currentWallet?.expiresAt,
                });
            }

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
                    returnDocument: 'after',
                    session: mongoSession,
                }
            );

            if (!updatedWallet) {
                const currentWallet = await walletModel.findOne({ userId: req.user._id }).session(mongoSession);
                const available = currentWallet ? currentWallet.balance : 0;
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({
                    message: `Insufficient credits to launch campaign. Required: ${requiredCredits} credits (${totalRecipients} numbers × ${rate}/msg), Available: ${available} credits.`,
                    success: false,
                    required: requiredCredits,
                    available,
                    totalRecipients,
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

        const resolvedStatus =
            req.user.role === "Super Admin" && status
                ? status
                : "pending";

        const createdCampaigns = await campaignModel.create(
            [
                {
                    userId: req.user._id,
                    campaignTitle,
                    campaignDescription: campaignDescription || "",
                    templateId: templateId || null,
                    messageBody: messageBody || "",
                    recipients: sanitizedRecipients,
                    recipientStats: {
                        totalSubmitted: recipients.length,
                        uniqueCount: sanitizedRecipients.length,
                        duplicateCount: duplicateOccurrences,
                        invalidCount,
                        invalidList,
                        duplicatesList, // Full preserved list of duplicate numbers
                    },
                    schedule: schedule || "now",
                    scheduledTime: scheduledTime || null,
                    images: (images || []).map((img) => (typeof img === "string" ? { url: img } : img)),
                    audio: (audio || []).map((aud) => (typeof aud === "string" ? { url: aud } : aud)),
                    video: (video || []).map((vid) => (typeof vid === "string" ? { url: vid } : vid)),
                    documents: (documents || []).map((doc) => (typeof doc === "string" ? { url: doc } : doc)),
                    thumbnail: thumbnail || null,
                    attachments: attachments || [],
                    mediaId: mediaId || null,
                    variables: variables || [],
                    totalRecipients,
                    creditsDeducted: creditDeduction ? creditDeduction.amount : 0,
                    rateSnapshot: rate,
                    messageType: resolvedMessageType,
                    status: resolvedStatus,
                    campaignStartDate: resolvedStatus === "ongoing" ? new Date() : null,
                },
            ],
            { session: mongoSession }
        );

        // Record transaction audit log linking campaignId
        if (creditDeduction && updatedWallet) {
            const auditNotes = `Campaign "${campaignTitle}": ${totalRecipients} submitted number(s), including ${duplicateOccurrences} repeat occurrence(s), at rate ${rate}/msg`;

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

        const newCampaign = createdCampaigns[0];

        // ── Real-Time WebSockets (POST-COMMIT) ────────────────────
        if (creditDeduction && updatedWallet) {
            notifyUser(req.user._id, "WALLET_UPDATED", {
                newBalance: updatedWallet.balance,
                delta: -requiredCredits,
                reason: "DEDUCT",
                campaignTitle,
                campaignId: newCampaign._id,
            });
        }

        notifyRole("Super Admin", "NEW_CAMPAIGN_SUBMITTED", {
            campaignId: newCampaign._id,
            campaignTitle,
            totalRecipients,
            submittedBy: req.user.username || req.user.email,
            role: req.user.role,
            submittedAt: newCampaign.createdAt,
        });

        if (req.user.resellerId) {
            notifyReseller(req.user.resellerId, "CLIENT_CAMPAIGN_LAUNCHED", {
                clientId: req.user._id,
                clientName: req.user.username,
                campaignId: newCampaign._id,
                campaignTitle,
                totalRecipients,
            });
        }

        // ── BullMQ: Enqueue for Delayed Scheduling or Background Execution ──
        // Submission alone never approves a campaign for dispatch.
        if (newCampaign.status === "ongoing") {
            try {
                await scheduleCampaignJob(newCampaign);
            } catch (queueErr) {
                console.error("[BullMQ] Failed to enqueue campaign job:", queueErr.message);
            }
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
            data: newCampaign,
            creditDeduction,
            duplicateStats: {
                totalSubmitted: recipients.length,
                uniqueRecipients: sanitizedRecipients.length,
                duplicatesFound: duplicateOccurrences,
                duplicatesList,
                invalidCount,
                invalidNumbers: invalidList,
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
            filter = {};
        } else if (req.user.role === "Reseller") {
            const clientUsers = await userModel.find({ resellerId: req.user._id }).select("_id");
            const clientIds = clientUsers.map((u) => u._id);
            filter = {
                userId: { $in: [req.user._id, ...clientIds] },
            };
        } else {
            filter = { userId: req.user._id };
        }

        const campaigns = await campaignModel
            .find(filter)
            .select("-recipients -recipientReport.records -recipientEntries -spreadsheetColumns -publishedSpreadsheet.rows -publishedSpreadsheet.columns -customRecipientTabs -deletedTabKeys -draftReportNotes -recipientCategoryLabels")
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

        if (isSuperAdmin) {
            if (campaign.spreadsheetRevision > 0 || !campaign.recipientEntries || campaign.recipientEntries.length === 0) {
                const storedDraft = await loadSpreadsheetRows(campaign._id, "draft");
                if (storedDraft && storedDraft.length > 0) {
                    campaign.recipientEntries = storedDraft;
                }
            }
        }
        // Initialize permanent row numbers for recipientEntries if not yet established
        if (isSuperAdmin && (!campaign.recipientEntries || campaign.recipientEntries.length === 0)) {
            const reportMap = new Map();
            for (const rec of campaign.recipientReport?.records || []) {
                if (rec.phoneNumber) {
                    reportMap.set(String(rec.phoneNumber).replace(/\D/g, ""), {
                        category: rec.category,
                        billingAction: rec.billingAction,
                    });
                }
            }

            const initialEntries = [];
            let rowCounter = 1;

            // 1. Valid/queued recipients submitted
            for (const r of campaign.recipients || []) {
                const clean = String(r.phoneNumber || "").replace(/\D/g, "");
                if (!clean) continue;
                const info = reportMap.get(clean);
                const isDelivered = r.status === "delivered";
                const isFailed = r.status === "failed";
                initialEntries.push({
                    rowNumber: rowCounter++,
                    phoneNumber: clean,
                    status: r.status || "queued",
                    classification: isDelivered ? "delivered" : isFailed ? "wrong" : "pending",
                    category: info?.category || (isDelivered ? "Delivered" : isFailed ? "Wrong number" : "Queued"),
                    tabKey: isDelivered ? "delivered" : isFailed ? "wrong" : "all",
                    billingAction: info?.billingAction || (isFailed ? "refund" : "keep"),
                    tags: isFailed ? ["Failed"] : [],
                });
            }

            // 2. Duplicate numbers submitted
            for (const dup of campaign.recipientStats?.duplicatesList || []) {
                const clean = String(dup).replace(/\D/g, "");
                if (!clean) continue;
                const info = reportMap.get(clean);
                initialEntries.push({
                    rowNumber: rowCounter++,
                    phoneNumber: clean,
                    status: "failed",
                    classification: "duplicate",
                    category: info?.category || "Duplicate number",
                    tabKey: "duplicate",
                    billingAction: info?.billingAction || "refund",
                    tags: ["Duplicate"],
                });
            }

            // 3. Invalid format numbers submitted
            for (const inv of campaign.recipientStats?.invalidList || []) {
                const clean = String(inv).replace(/\D/g, "");
                if (!clean) continue;
                const info = reportMap.get(clean);
                initialEntries.push({
                    rowNumber: rowCounter++,
                    phoneNumber: clean,
                    status: "failed",
                    classification: "wrong",
                    category: info?.category || "Wrong number",
                    tabKey: "wrong",
                    billingAction: info?.billingAction || "refund",
                    tags: ["Wrong Number"],
                });
            }

            if (initialEntries.length > 0) {
                campaign.recipientEntries = initialEntries;
                // Initial indexes are deterministic; persist the first edit as a draft.
            }
        }

        if (campaign.publishedSpreadsheet?.publishedAt) {
            campaign.publishedSpreadsheet.rows = await loadSpreadsheetRows(campaign._id, "published");
        }
        const view = campaign.toObject ? campaign.toObject() : { ...campaign };
        if (isSuperAdmin) view.refundAccounting = await getCampaignRefundAccounting(campaign);
        if (!isSuperAdmin) {
            delete view.recipientEntries;
            delete view.spreadsheetColumns;
            delete view.customRecipientTabs;
            delete view.deletedTabKeys;
            delete view.draftReportNotes;
            delete view.recipientCategoryLabels;
        }
        return res.status(200).json({ success: true, data: view });
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
 */
async function getCampaignRefundAccounting(campaign, session) {
    // A report/category amount can be a plan. Only posted wallet transactions
    // count as money returned; debit adjustments reverse earlier refunds.
    let query = transactionModel.aggregate([
        { $match: { campaignId: campaign._id, $or: [
            { type: "REFUND" },
            { type: "DEDUCT", refundOperationId: { $exists: true } },
        ] } },
        { $group: { _id: null, total: { $sum: { $cond: [
            { $eq: ["$type", "REFUND"] }, "$amount", { $multiply: ["$amount", -1] },
        ] } } } },
    ]);
    if (session) query = query.session(session);
    const [record] = await query;
    const charged = Math.max(0, Number(campaign.creditsDeducted) || 0);
    const settled = Math.max(0, Number(record?.total) || 0);
    return { charged, settled, remaining: Math.max(0, charged - settled) };
}

async function failCampaignAndRefund(id, adminId) {
    const session = await mongoose.startSession();
    let result;
    try {
        await session.withTransaction(async () => {
            const campaign = await campaignModel.findById(id).session(session);
            if (!campaign) { result = null; return; }
            const previousStatus = campaign.status;
            const accounting = await getCampaignRefundAccounting(campaign, session);
            const refunded = accounting.settled;
            const amount = accounting.remaining;
            let refundInfo = null;
            if (amount > 0) {
                const owner = await userModel.findById(campaign.userId).session(session);
                if (!owner) throw new Error("Campaign creator not found. No credits were changed.");
                const wallet = await walletModel.findOneAndUpdate(
                    { userId: campaign.userId },
                    { $inc: { balance: amount }, $setOnInsert: { resellerId: owner.resellerId || null } },
                    { returnDocument: 'after', upsert: true, session }
                );
                const [transaction] = await transactionModel.create([{
                    type: "REFUND", campaignId: campaign._id, refundOperationId: new mongoose.Types.ObjectId(),
                    fromUser: adminId, toUser: campaign.userId, performedBy: adminId,
                    amount, balanceAfterTo: wallet.balance, rateSnapshot: campaign.rateSnapshot,
                    notes: `Full credit refund: campaign "${campaign.campaignTitle}" marked failed by admin.`,
                }], { session });
                refundInfo = { amount, newBalance: wallet.balance, transactionId: transaction._id };
            }
            if (previousStatus !== "failed" || amount > 0 || campaign.campaignSummary?.creditsRefunded !== refunded) {
                campaign.status = "failed";
                campaign.campaignEndDate = new Date();
                if (!campaign.campaignSummary) campaign.campaignSummary = {};
                campaign.campaignSummary.creditsRefunded = refunded + amount;
                if (campaign.publishedSpreadsheet?.summary) {
                    campaign.publishedSpreadsheet.summary.creditsRefunded = refunded + amount;
                    campaign.markModified("publishedSpreadsheet");
                }
                await campaign.save({ session });
            }
            result = { campaign, previousStatus, refundInfo };
        });
        return result;
    } finally {
        await session.endSession();
    }
}

export const updateCampaignStatus = async (req, res) => {
    try {
        if (req.user.role !== "Super Admin") {
            return res.status(403).json({ message: "Forbidden: Only Super Admin can change campaign status.", success: false });
        }
        const { id } = req.params;
        const { status } = req.body;

        const allowedManualStatuses = [
            "ongoing",
            "completed",
            "stopped",
            "failed",
            "pending",
            "paused",
            "scheduled",
        ];

        if (!status || !allowedManualStatuses.includes(status)) {
            return res.status(400).json({
                message: `Invalid status. Status update is limited to: ${allowedManualStatuses.join(", ")}.`,
                success: false,
                allowedManualStatuses,
            });
        }

        if (status === "failed") {
            const result = await failCampaignAndRefund(id, req.user._id);
            if (!result) return res.status(404).json({ success: false, message: "Campaign not found" });
            const { campaign, previousStatus, refundInfo } = result;
            try { await cancelCampaignJob(id); }
            catch (error) { console.error("[BullMQ] Failed to cancel failed campaign job:", error.message); }
            const update = { campaignId: campaign._id, campaignTitle: campaign.campaignTitle, previousStatus, status: "failed", updatedAt: campaign.updatedAt };
            notifyUser(campaign.userId, "CAMPAIGN_UPDATED", update);
            notifyRole("Super Admin", "CAMPAIGN_UPDATED", update);
            if (refundInfo) notifyUser(campaign.userId, "WALLET_UPDATED", { campaignId: campaign._id, newBalance: refundInfo.newBalance, delta: refundInfo.amount, reason: "REFUND" });
            return res.status(200).json({ success: true, message: "Campaign marked failed. All charged credits have been returned to its creator.", data: update, refundInfo });
        }

        const campaign = await campaignModel.findById(id);
        if (!campaign) {
            return res.status(404).json({
                message: "Campaign not found",
                success: false,
            });
        }

        if (campaign.status === status) {
            return res.status(200).json({
                success: true,
                message: `Campaign is already in "${status}" status.`,
                data: campaign,
            });
        }

        const previousStatus = campaign.status;
        if (["completed", "sent"].includes(previousStatus)) {
            campaign.manualStatusOverride = true;
        }
        campaign.status = status;

        if (status === "stopped" || status === "failed") {
            campaign.campaignEndDate = new Date();
            // Cancel BullMQ job if it was waiting in queue
            try {
                await cancelCampaignJob(id);
            } catch (queueErr) {
                console.error("[BullMQ] Failed to cancel job:", queueErr.message);
            }
        } else if (status === "completed") {
            campaign.campaignEndDate = new Date();
        } else if (status === "ongoing") {
            if (["completed", "sent", "stopped", "failed"].includes(previousStatus)) {
                campaign.campaignEndDate = null;
            }
            if (!campaign.campaignStartDate) {
                campaign.campaignStartDate = new Date();
            }
        } else if (status === "pending" || status === "scheduled" || status === "paused") {
            if (["completed", "sent", "stopped", "failed"].includes(previousStatus)) {
                campaign.campaignEndDate = null;
            }
            // Put on hold: remove from queue if scheduled
            try {
                await cancelCampaignJob(id);
            } catch (queueErr) {
                console.error("[BullMQ] Failed to cancel job on pending hold:", queueErr.message);
            }
        }

        await campaign.save();

        // Persist admin approval before a worker can pick up the job.
        if (status === "ongoing" && !campaign.manualStatusOverride) {
            try {
                await scheduleCampaignJob(campaign);
            } catch (queueErr) {
                console.error("[BullMQ] Failed to enqueue on start:", queueErr.message);
            }
        }

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

        const wholeCampaignFailed = status === "failed" || campaign.status === "failed";
        if (isEligibleForRefund && (numFailed > 0 || wholeCampaignFailed)) {
            const alreadyRefunded = wholeCampaignFailed ? (await getCampaignRefundAccounting(campaign, mongoSession)).settled : campaign.campaignSummary?.creditsRefunded || 0;

            if (alreadyRefunded > 0 && !wholeCampaignFailed) {
                console.log(`Campaign ${campaign._id} was already refunded ${alreadyRefunded} credits. Skipping duplicate refund.`);
            } else {
                const rate = campaign.rateSnapshot || campaignOwner.ratePerMsg || 12;
                let refundAmount = wholeCampaignFailed ? campaign.creditsDeducted || 0 : numFailed * rate;

                if (campaign.creditsDeducted > 0 && refundAmount > campaign.creditsDeducted) {
                    refundAmount = campaign.creditsDeducted;
                }
                if (wholeCampaignFailed) refundAmount = Math.max(0, refundAmount - alreadyRefunded);

                if (refundAmount > 0) {
                    updatedUserWallet = await walletModel.findOneAndUpdate(
                        { userId: campaign.userId },
                        {
                            $inc: { balance: refundAmount },
                            $setOnInsert: { resellerId: campaignOwner.resellerId || null },
                        },
                        {
                            returnDocument: 'after',
                            upsert: true,
                            session: mongoSession,
                        }
                    );

                    const refundTransaction = await transactionModel.create(
                        [
                            {
                                fromUser: req.user._id,
                                toUser: campaign.userId,
                                amount: refundAmount,
                                type: "REFUND",
                                ...(wholeCampaignFailed ? { refundOperationId: new mongoose.Types.ObjectId() } : {}),
                                campaignId: campaign._id,
                                notes: wholeCampaignFailed ? `Remaining credit refund: campaign "${campaign.campaignTitle}" marked failed.` : `Automated refund for ${numFailed} failed/wrong number(s) on campaign "${campaign.campaignTitle}" at rate ${rate}/msg`,
                                rateSnapshot: rate,
                                balanceAfterTo: updatedUserWallet.balance,
                                performedBy: req.user._id,
                            },
                        ],
                        { session: mongoSession }
                    );

                    campaign.campaignSummary.creditsRefunded = alreadyRefunded + refundAmount;
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

/**
 * PUT /api/campaigns/:id/report
 * -----------------------------
 * Dynamic Campaign Report & Rule Engine for Super Admin.
 * Categorizes numbers into distinct dynamic sections/buckets.
 * Evaluates billing toggle per category (deduct vs refund).
 * Automatically calculates and updates refunds with full ledger audit.
 */
export const saveCampaignReport = async (req, res) => {
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
                message: "Forbidden: Only Super Admin is authorized to configure and save campaign reports.",
                success: false,
            });
        }

        const { id } = req.params;
        const { categories, adminNotes = "", status } = req.body;

        if (!categories || !Array.isArray(categories)) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: "Invalid categories: 'categories' must be an array of category sections.",
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

        const campaignOwner = await userModel.findById(campaign.userId).session(mongoSession);
        const rate = campaign.rateSnapshot || (campaignOwner && campaignOwner.ratePerMsg > 0 ? campaignOwner.ratePerMsg : 12);

        // Sanitize and process numbers per category
        const seenInReport = new Set();
        let totalRefundNumbersCount = 0;
        let totalDeductNumbersCount = 0;
        let deliveredCount = 0;
        const categorySummaries = [];
        const flatRecords = [];

        for (const cat of categories) {
            const catName = typeof cat.name === "string" ? cat.name.trim() : "Untitled Category";
            const billingAction = cat.billingAction === "refund" ? "refund" : "deduct";
            const rawNumbers = Array.isArray(cat.numbers) ? cat.numbers : [];

            const sanitizedCategoryNumbers = [];
            for (const num of rawNumbers) {
                const clean = String(num).replace(/\D/g, "");
                if (!clean) continue;
                if (seenInReport.has(clean)) continue;
                seenInReport.add(clean);
                sanitizedCategoryNumbers.push(clean);
                flatRecords.push({
                    phoneNumber: clean,
                    category: catName,
                    billingAction,
                });
            }

            const count = sanitizedCategoryNumbers.length;
            if (billingAction === "refund") {
                totalRefundNumbersCount += count;
            } else {
                totalDeductNumbersCount += count;
                // Treat successful / delivered as delivered count
                if (/success|deliver/i.test(catName) || cat.id === "successful") {
                    deliveredCount += count;
                }
            }

            categorySummaries.push({
                id: cat.id || `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                name: catName,
                billingAction,
                count,
                creditsImpact: billingAction === "refund" ? count * rate : -(count * rate),
            });
        }

        // Default delivered count if no category specifically called successful
        if (deliveredCount === 0 && totalDeductNumbersCount > 0) {
            deliveredCount = totalDeductNumbersCount;
        }

        // ── Credit & Refund Rule Engine Calculation ─────────────
        const isEligibleForBilling = campaignOwner && campaignOwner.role !== "Super Admin";
        let refundInfo = null;
        let updatedUserWallet = null;

        if (isEligibleForBilling) {
            let targetRefundAmount = campaign.status === "failed" || status === "failed" ? campaign.creditsDeducted || 0 : totalRefundNumbersCount * rate;
            if (campaign.creditsDeducted > 0 && targetRefundAmount > campaign.creditsDeducted) {
                targetRefundAmount = campaign.creditsDeducted;
            }

            const previousRefundAmount = campaign.status === "failed" || status === "failed" ? (await getCampaignRefundAccounting(campaign, mongoSession)).settled : campaign.campaignSummary?.creditsRefunded || 0;
            const netRefundDelta = targetRefundAmount - previousRefundAmount;

            if (netRefundDelta !== 0) {
                updatedUserWallet = await walletModel.findOneAndUpdate(
                    { userId: campaign.userId },
                    {
                        $inc: { balance: netRefundDelta },
                        $setOnInsert: { resellerId: campaignOwner.resellerId || null },
                    },
                    {
                        returnDocument: 'after',
                        upsert: true,
                        session: mongoSession,
                    }
                );

                const txType = netRefundDelta > 0 ? "REFUND" : "DEDUCT";
                const absAmount = Math.abs(netRefundDelta);
                const txNotes = netRefundDelta > 0
                    ? `Campaign report adjustment: Refund for ${totalRefundNumbersCount} number(s) on "${campaign.campaignTitle}" (${previousRefundAmount ? `incremental +${netRefundDelta}` : `${targetRefundAmount}`} credits)`
                    : `Campaign report adjustment: Re-debit adjustment of ${absAmount} credits on "${campaign.campaignTitle}"`;

                const [refundTx] = await transactionModel.create(
                    [
                        {
                            fromUser: netRefundDelta > 0 ? req.user._id : campaign.userId,
                            toUser: netRefundDelta > 0 ? campaign.userId : req.user._id,
                            amount: absAmount,
                            type: txType,
                            campaignId: campaign._id,
                            refundOperationId: new mongoose.Types.ObjectId(),
                            notes: txNotes,
                            rateSnapshot: rate,
                            balanceAfterTo: updatedUserWallet.balance,
                            performedBy: req.user._id,
                        },
                    ],
                    { session: mongoSession }
                );

                refundInfo = {
                    netRefundDelta,
                    totalRefundAmount: targetRefundAmount,
                    previousRefundAmount,
                    rate,
                    newBalance: updatedUserWallet.balance,
                    transactionId: refundTx._id,
                };
            }

            campaign.campaignSummary.creditsRefunded = targetRefundAmount;
        }

        // Update campaign summary metrics
        campaign.campaignSummary.sent = campaign.totalRecipients || flatRecords.length;
        campaign.campaignSummary.delivered = deliveredCount;
        campaign.campaignSummary.failed = totalRefundNumbersCount;
        campaign.campaignSummary.adminNotes = typeof adminNotes === "string" ? adminNotes.trim() : "";
        campaign.campaignSummary.reportedAt = new Date();
        campaign.campaignSummary.reportedBy = req.user._id;
        campaign.campaignSummary.categories = categorySummaries;

        // Update recipient report records
        campaign.recipientReport = {
            records: flatRecords,
            uploadedAt: new Date(),
            uploadedBy: req.user._id,
        };

        if (status) {
            campaign.status = status;
            if (status === "completed" || status === "sent") {
                campaign.campaignEndDate = new Date();
            }
        } else if (campaign.status === "pending" || campaign.status === "ongoing") {
            campaign.status = "completed";
            campaign.campaignEndDate = new Date();
        }

        await campaign.save({ session: mongoSession });

        await mongoSession.commitTransaction();
        mongoSession.endSession();

        // Real-time WebSockets notification
        if (refundInfo && updatedUserWallet) {
            notifyUser(campaign.userId, "WALLET_UPDATED", {
                newBalance: updatedUserWallet.balance,
                delta: refundInfo.netRefundDelta,
                reason: refundInfo.netRefundDelta > 0 ? "REFUND" : "DEDUCT",
                campaignTitle: campaign.campaignTitle,
                campaignId: campaign._id,
                refundAmount: refundInfo.totalRefundAmount,
            });
        }
        notifyUser(campaign.userId, "CAMPAIGN_UPDATED", {
            campaignId: campaign._id,
            campaignTitle: campaign.campaignTitle,
            reportUpdated: true,
            status: campaign.status,
            delivered: campaign.campaignSummary.delivered,
        });

        return res.status(200).json({
            success: true,
            message: "Campaign report saved and credit adjustments applied successfully.",
            data: campaign,
            refundInfo,
        });
    } catch (error) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        console.error("Save campaign report error:", error);
        return res.status(500).json({
            message: error.message || "Failed to save campaign report",
            success: false,
        });
    }
};

/**
 * PUT /api/campaigns/:id/recipients-management
 * -------------------------------------------
 * Update campaign recipient entries, custom tabs, classifications, and credit adjustments.
 * STRICTLY Super Admin ONLY.
 */
export const updateCampaignRecipientsManagement = async (req, res) => {
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
                message: "Forbidden: Only Super Admin can manage recipient numbers.",
                success: false,
            });
        }

        const { id } = req.params;
        let { entries } = req.body;
        const { customTabs, deletedTabKeys, saveMode, spreadsheetColumns, spreadsheetRevision, reportNotes, recipientCategoryLabels } = req.body;

        if (!entries || !Array.isArray(entries)) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                message: "Invalid payload: 'entries' must be an array of recipient entries.",
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

        entries = normalizeDuplicateRows(entries);
        const spreadsheetSave = saveMode === "draft" || saveMode === "publish";
        if (saveMode && !spreadsheetSave) throw new Error("Invalid spreadsheet save mode.");
        if (spreadsheetSave && Number(spreadsheetRevision) !== (campaign.spreadsheetRevision || 0)) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(409).json({ success: false, message: "This spreadsheet changed in another session. Reload before saving." });
        }
        if (spreadsheetSave && campaign.spreadsheetRevision > 0) {
            campaign.recipientEntries = await loadSpreadsheetRows(campaign._id, "draft", mongoSession);
        }
        let sheetColumns;
        let publishedSheet;
        if (spreadsheetSave) {
          try {
            sheetColumns = normalizeColumns(spreadsheetColumns);
            const rowIds = new Set();
            const knownIds = new Set((campaign.recipientEntries || []).map((row) => row.rowNumber));
            const maxId = (campaign.recipientEntries || []).reduce((max, row) => Math.max(max, row.rowNumber), 0);
            const customIds = new Set(sheetColumns.filter((column) => column.field === "custom").map((column) => column.id));
            entries = entries.map((entry) => {
                const rowNumber = Number(entry.rowNumber);
                if (!Number.isSafeInteger(rowNumber) || rowNumber < 1 || rowIds.has(rowNumber) || (!knownIds.has(rowNumber) && rowNumber <= maxId)) throw new Error("Each recipient must retain its unique All index.");
                rowIds.add(rowNumber);
                const phoneNumber = String(entry.phoneNumber || "").replace(/\D/g, "");
                if (!phoneNumber) throw new Error("Every row needs a phone number.");
                const cells = Object.fromEntries(Object.entries(entry.cells || {}).filter(([id]) => customIds.has(id)).map(([id, value]) => [id, String(value ?? "").slice(0, 2000)]));
                return { ...entry, rowNumber, phoneNumber, notes: String(entry.notes || "").slice(0, 2000), cells };
            });
            if ([...knownIds].some((rowNumber) => !rowIds.has(rowNumber))) throw new Error("Keep existing recipient rows and their All indexes. Move rows into a category instead of deleting them.");
            if (saveMode === "publish") publishedSheet = buildPublishedSheet(entries, sheetColumns);
          } catch (error) { error.statusCode = 400; throw error; }
        }

        const campaignOwner = await userModel.findById(campaign.userId).session(mongoSession);
        const rate =
            campaign.rateSnapshot ||
            (campaignOwner && campaignOwner.ratePerMsg > 0 ? campaignOwner.ratePerMsg : 12);

        let refundCount = 0;
        let deductCount = 0;
        let deliveredCount = 0;
        const flatRecords = [];

        for (const e of entries) {
            const clean = String(e.phoneNumber || "").replace(/\D/g, "");
            const billingAction = e.billingAction === "refund" ? "refund" : "deduct";
            if (billingAction === "refund") {
                refundCount++;
            } else {
                deductCount++;
                if (e.status === "delivered" || /delivered|success/i.test(e.category || "")) {
                    deliveredCount++;
                }
            }
            flatRecords.push({
                rowNumber: e.rowNumber,
                phoneNumber: clean,
                category: e.category || e.tabKey || "General",
                billingAction,
            });
        }

        if (!campaign.campaignSummary) {
            campaign.campaignSummary = {
                sent: 0,
                delivered: 0,
                read: 0,
                failed: 0,
                creditsRefunded: 0,
                adminNotes: "",
            };
        }

        const isEligibleForBilling = campaignOwner && campaignOwner.role !== "Super Admin";
        let refundInfo = null;

        if (isEligibleForBilling && saveMode !== "draft") {
            let targetRefundAmount = campaign.status === "failed" || req.body.status === "failed" ? campaign.creditsDeducted || 0 : refundCount * rate;
            if (campaign.creditsDeducted > 0 && targetRefundAmount > campaign.creditsDeducted) {
                targetRefundAmount = campaign.creditsDeducted;
            }

            const previousRefundAmount = campaign.status === "failed" || req.body.status === "failed" ? (await getCampaignRefundAccounting(campaign, mongoSession)).settled : campaign.campaignSummary?.creditsRefunded || 0;
            const netRefundDelta = targetRefundAmount - previousRefundAmount;

            if (netRefundDelta !== 0) {
                const updatedUserWallet = await walletModel.findOneAndUpdate(
                    { userId: campaign.userId },
                    {
                        $inc: { balance: netRefundDelta },
                        $setOnInsert: { resellerId: campaignOwner.resellerId || null },
                    },
                    {
                        returnDocument: 'after',
                        upsert: true,
                        session: mongoSession,
                    }
                );

                const txType = netRefundDelta > 0 ? "REFUND" : "DEDUCT";
                const absAmount = Math.abs(netRefundDelta);
                const txNotes =
                    netRefundDelta > 0
                        ? `Recipient number management: Refund for ${refundCount} entry(s) on "${campaign.campaignTitle}" (+${netRefundDelta} credits)`
                        : `Recipient number management: Debit adjustment of -${absAmount} credits on "${campaign.campaignTitle}"`;

                const [refundTx] = await transactionModel.create(
                    [
                        {
                            fromUser: netRefundDelta > 0 ? req.user._id : campaign.userId,
                            toUser: netRefundDelta > 0 ? campaign.userId : req.user._id,
                            amount: absAmount,
                            type: txType,
                            campaignId: campaign._id,
                            refundOperationId: new mongoose.Types.ObjectId(),
                            notes: txNotes,
                            rateSnapshot: rate,
                            balanceAfterTo: updatedUserWallet.balance,
                            performedBy: req.user._id,
                        },
                    ],
                    { session: mongoSession }
                );

                refundInfo = {
                    netRefundDelta,
                    targetRefundAmount,
                    previousRefundAmount,
                    newBalance: updatedUserWallet.balance,
                    transactionId: refundTx._id,
                };
            }

            campaign.campaignSummary.creditsRefunded = targetRefundAmount;
        }

        // Always store large recipient sets (>500 rows) in chunked spreadsheet storage
        // to avoid MongoDB 16MB BSON document size overflow
        const useChunkedStorage = spreadsheetSave || entries.length > 500;
        if (useChunkedStorage) {
            await saveSpreadsheetRows(campaign._id, "draft", entries, mongoSession);
            campaign.recipientEntries = [];
            campaign.spreadsheetRevision = (campaign.spreadsheetRevision || 0) + 1;
        } else {
            campaign.recipientEntries = entries;
        }
        if (recipientCategoryLabels !== undefined) {
            if (!recipientCategoryLabels || typeof recipientCategoryLabels !== "object" || Array.isArray(recipientCategoryLabels) || Object.keys(recipientCategoryLabels).length > 40) throw new Error("Invalid category names.");
            const labels = Object.entries(recipientCategoryLabels);
            if (labels.some(([key, value]) => !/^[a-zA-Z][a-zA-Z0-9_]{0,80}$/.test(key) || typeof value !== "string" || !value.trim() || value.trim().length > 80)) throw new Error("Category names must contain 1 to 80 characters.");
            campaign.recipientCategoryLabels = Object.fromEntries(labels.map(([key, value]) => [key, value.trim()]));
        }
        if (customTabs && Array.isArray(customTabs)) {
            campaign.customRecipientTabs = customTabs;
        }
        if (deletedTabKeys && Array.isArray(deletedTabKeys)) {
            campaign.deletedTabKeys = deletedTabKeys;
        }
        if (spreadsheetSave) {
            campaign.draftReportNotes = String(reportNotes ?? campaign.draftReportNotes ?? campaign.campaignSummary?.adminNotes ?? "").slice(0, 4000);
            campaign.spreadsheetColumns = sheetColumns;
        }
        if (saveMode !== "draft") {
            campaign.recipientReport = {
                records: useChunkedStorage ? [] : flatRecords,
                uploadedAt: new Date(),
                uploadedBy: req.user._id,
            };
            campaign.campaignSummary.delivered = deliveredCount;
        }
        if (saveMode === "publish") {
            const publishedAt = new Date();
            campaign.status = campaign.status === "failed" ? "failed" : req.body.status || "completed";
            campaign.campaignSummary.reportedAt = publishedAt;
            campaign.campaignSummary.reportedBy = req.user._id;
            campaign.campaignSummary.adminNotes = campaign.draftReportNotes;
            campaign.campaignSummary.failed = refundCount;
            await saveSpreadsheetRows(campaign._id, "published", publishedSheet.rows, mongoSession);
            campaign.publishedSpreadsheet = {
                columns: publishedSheet.columns, notes: campaign.draftReportNotes, publishedAt, publishedBy: req.user._id,
                summary: {
                    total: entries.length, delivered: entries.filter((row) => ["delivered", "read"].includes(row.status)).length,
                    refunded: refundCount, creditsRefunded: campaign.campaignSummary.creditsRefunded || 0,
                    creditsCharged: campaign.creditsDeducted || 0,
                },
            };
        }

        await campaign.save({ session: mongoSession });

        await mongoSession.commitTransaction();
        mongoSession.endSession();

        if (refundInfo) notifyUser(campaign.userId, "WALLET_UPDATED", {
            campaignId: campaign._id, newBalance: refundInfo.newBalance, delta: refundInfo.netRefundDelta,
            reason: refundInfo.netRefundDelta > 0 ? "REFUND" : "DEDUCT",
        });
        if (saveMode === "publish") notifyUser(campaign.userId, "CAMPAIGN_UPDATED", { campaignId: campaign._id, reportUpdated: true });

        const viewData = campaign.toObject ? campaign.toObject() : { ...campaign };
        viewData.recipientEntries = entries;

        return res.status(200).json({
            success: true,
            message: saveMode === "draft" ? "Spreadsheet draft saved." : saveMode === "publish" ? "Campaign report published." : "Campaign recipient numbers and credit adjustments saved successfully.",
            data: viewData,
            refundInfo,
        });
    } catch (error) {
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        console.error("Update campaign recipients management error:", error);
        return res.status(error.statusCode || 500).json({
            message: error.message || "Failed to update campaign recipient numbers",
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
    saveCampaignReport,
    updateCampaignRecipientsManagement,
};
