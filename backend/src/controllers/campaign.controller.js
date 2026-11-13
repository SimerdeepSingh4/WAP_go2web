import mongoose from "mongoose";
import crypto from "node:crypto";
import campaignModel from "../models/campaign.model.js";
import userModel from "../models/user.model.js";
import walletModel from "../models/wallet.model.js";
import transactionModel from "../models/transaction.model.js";
import fs from "fs";
import path from "path";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.config.js";
import { notifyUser, notifyRole, notifyReseller } from "../services/socket.service.js";
import { scheduleCampaignJob, cancelCampaignJob } from "../queues/campaign.queue.js";
import xlsx from "xlsx";
import { loadSpreadsheetRows, saveSpreadsheetRows } from "../helpers/spreadsheet-storage.js";
import { normalizeColumns, buildPublishedSheet, normalizeDuplicateRows } from "../../../shared/campaignSpreadsheet.js";
import { creditAmount, creditsForCount, creditDifference, creditTransactionOptions } from "../helpers/credit-amount.js";
import { startCreditSession, saveCreditReceipt } from "../helpers/credit-operation.js";
import { campaignPublicStatus, publicCampaignView } from "../helpers/campaign-visibility.js";
import { failureReportEntries, failureReportSheet } from "../../../shared/campaignFailure.js";
import { campaignContactRows, restoreOriginalCampaignEntries } from "../../../shared/campaignContacts.js";
import { sanitizeRecipientInputAudit } from "../helpers/recipient-input-audit.js";
import { normalizeAccountPhone } from "../helpers/account-phone.js";
import { campaignMediaCategory } from "../helpers/campaign-media.js";
import { getAccountMediaUploadLimits } from "../services/media-upload-limits.service.js";
import { uploadCampaignMedia } from "../helpers/campaign-upload.js";
import { campaignRecipientError, campaignRecipientLines } from "../../../shared/campaignRecipients.js";

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
    const campaign = await campaignModel.findById(id).populate("userId", "username email role resellerId dp_img");
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

export const downloadProfileDp = async (req, res) => {
    try {
        const campaign = await campaignModel.findById(req.params.id).select("profileDp userId").populate("userId", "dp_img resellerId");
        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found." });

        const ownsCampaign = String(campaign.userId?._id || campaign.userId) === String(req.user._id);
        const isSuperAdmin = req.user.role === "Super Admin";
        const isAssignedReseller = req.user.role === "Reseller" && String(campaign.userId?.resellerId || "") === String(req.user._id);
        if (!ownsCampaign && !isSuperAdmin && !isAssignedReseller) {
            return res.status(403).json({ success: false, message: "You cannot access this campaign." });
        }

        const dpUrl = campaign.profileDp || campaign.userId?.dp_img;
        if (!dpUrl) return res.status(404).json({ success: false, message: "No profile picture available for this campaign." });

        // dp_img can be a full Cloudinary URL or a local relative path like /uploads/profile-pictures/...
        const isAbsolute = /^https?:\/\//i.test(dpUrl);
        if (isAbsolute) {
            // Fetch from Cloudinary / external URL
            let parsedUrl;
            try { parsedUrl = new URL(dpUrl); } catch {
                console.error("Profile DP invalid URL:", dpUrl);
                return res.status(400).json({ success: false, message: "Profile picture URL is invalid." });
            }
            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                return res.status(400).json({ success: false, message: "Profile picture URL is not supported." });
            }
            const upstream = await fetch(dpUrl, { signal: AbortSignal.timeout(15000) });
            if (!upstream.ok) return res.status(502).json({ success: false, message: "Could not retrieve profile picture." });
            const contentType = upstream.headers.get("content-type") || "image/jpeg";
            const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
            const buffer = Buffer.from(await upstream.arrayBuffer());
            res.setHeader("Content-Type", contentType);
            res.setHeader("Content-Disposition", `attachment; filename="profile-dp.${ext}"`);
            res.setHeader("Cache-Control", "private, no-store");
            return res.send(buffer);
        } else {
            // Local file — serve directly from disk
            const localPath = path.join(process.cwd(), dpUrl.startsWith("/") ? dpUrl.slice(1) : dpUrl);
            if (!fs.existsSync(localPath)) {
                return res.status(404).json({ success: false, message: "Profile picture file not found on server." });
            }
            const ext = path.extname(localPath).replace(".", "") || "jpg";
            const mimeMap = { webp: "image/webp", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };
            res.setHeader("Content-Type", mimeMap[ext] || "image/jpeg");
            res.setHeader("Content-Disposition", `attachment; filename="profile-dp.${ext}"`);
            res.setHeader("Cache-Control", "private, no-store");
            return res.sendFile(localPath);
        }
    } catch (error) {
        console.error("Profile DP download error:", error.message, "| URL:", error.cause ?? "");
        return res.status(500).json({ success: false, message: "Failed to download profile picture." });
    }
};

export const downloadCampaignDocument = async (req, res) => {
    try {
        const { id, documentId } = req.params;
        if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(documentId)) {
            return res.status(400).json({ success: false, message: "Invalid campaign document reference." });
        }
        const campaign = await campaignModel.findById(id).select("userId documents").populate("userId", "resellerId");
        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found." });
        const ownsCampaign = String(campaign.userId?._id || campaign.userId) === String(req.user._id);
        const assignedReseller = req.user.role === "Reseller" && String(campaign.userId?.resellerId || "") === String(req.user._id);
        if (req.user.role !== "Super Admin" && !ownsCampaign && !assignedReseller) {
            return res.status(403).json({ success: false, message: "You cannot access this campaign document." });
        }
        const document = campaign.documents.id(documentId);
        if (!document) return res.status(404).json({ success: false, message: "Document not found." });
        if (!isCloudinaryConfigured()) {
            return res.status(503).json({ success: false, message: "Document storage is temporarily unavailable." });
        }
        const asset = new URL(document.url);
        const parts = asset.pathname.split("/").filter(Boolean).map(decodeURIComponent);
        // Sign only stored assets belonging to this Cloudinary account.
        if (asset.protocol !== "https:" || asset.hostname !== "res.cloudinary.com" || parts[0] !== process.env.CLOUDINARY_CLOUD_NAME ||
            !["raw", "image"].includes(parts[1]) || !["upload", "private", "authenticated"].includes(parts[2])) {
            return res.status(400).json({ success: false, message: "This document does not have a supported Cloudinary URL." });
        }
        const resourceType = parts[1];
        const assetParts = parts.slice(3);
        if (/^v\d+$/.test(assetParts[0])) assetParts.shift();
        let publicId = assetParts.join("/");
        if (!publicId || !/\.pdf$/i.test(publicId)) {
            return res.status(400).json({ success: false, message: "This attachment is not a PDF document." });
        }
        if (resourceType === "image") publicId = publicId.replace(/\.pdf$/i, "");
        const signedUrl = cloudinary.utils.private_download_url(publicId, resourceType === "image" ? "pdf" : undefined, {
            resource_type: resourceType, type: parts[2], expires_at: Math.floor(Date.now() / 1000) + 60,
        });
        const upstream = await fetch(signedUrl, { signal: AbortSignal.timeout(30000), redirect: "error" });
        if (!upstream.ok) {
            console.error("Cloudinary document download failed:", upstream.status);
            return res.status(upstream.status === 404 ? 404 : 502).json({ success: false, message: "The PDF could not be retrieved from storage. Please try again." });
        }
        const file = Buffer.from(await upstream.arrayBuffer());
        if (file.subarray(0, 5).toString("ascii") !== "%PDF-") {
            return res.status(502).json({ success: false, message: "Storage did not return a valid PDF document." });
        }
        const filename = path.basename(document.filename || "document.pdf").replace(/[\r\n]/g, "");
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(filename));
        res.setHeader("Cache-Control", "private, no-store");
        return res.send(file);
    } catch (error) {
        console.error("Campaign PDF retrieval failed:", error.name);
        return res.status(502).json({ success: false, message: "Unable to open this PDF right now. Please try again." });
    }
};

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

export const exportCampaignRecipients = async (req, res) => {
    try {
        const result = await findCampaignForReport(req, req.params.id);
        if (result.error) return res.status(result.error.status).json({ success: false, message: result.error.message });
        const { campaign } = result;

        if (campaign.publishedSpreadsheet?.publishedAt) campaign.publishedSpreadsheet.rows = await loadSpreadsheetRows(campaign._id, "published");
        const contacts = campaignContactRows(campaign);
        const rows = [["#", "Phone Number", "Status", "Category"], ...contacts.map((row) => [row.rowNumber, row.phoneNumber, row.status === "pending_report" ? "Awaiting report" : row.status, row.kind === "invalid" ? "Invalid input" : row.kind === "duplicate" ? "Repeated entry" : "Submitted"] )];

        const workbook = xlsx.utils.book_new();
        const worksheet = xlsx.utils.aoa_to_sheet(rows);
        worksheet["!cols"] = [
            { wch: 8 },   // #
            { wch: 20 },  // Phone Number
            { wch: 16 },  // Status
            { wch: 24 }   // Category
        ];
        xlsx.utils.book_append_sheet(workbook, worksheet, "Recipients");
        const buffer = xlsx.write(workbook, { type: "buffer", bookType: "xlsx" });

        const safeTitle = String(campaign.campaignTitle || "campaign").replace(/[^a-z0-9_-]+/gi, "-");
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${safeTitle}-recipients.xlsx"`);
        return res.send(buffer);
    } catch (error) {
        console.error("Export campaign recipients error:", error);
        return res.status(500).json({ success: false, message: "Failed to export campaign recipients." });
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
    const mongoSession = await startCreditSession(req);
    mongoSession.startTransaction({
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority", j: true },
    });

    try {
        const {
            campaignTitle,
            campaignDescription,
            campaignNumber,
            campaignLink,
            campaignLinkName,
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

        const uploadedImages = [...(req.files?.images || []), ...(req.files?.image || [])];

        let normalizedCampaignNumber = "";
        if (campaignNumber != null && campaignNumber !== "") {
            if (req.user.role !== "Super Admin" && req.user.featureAccess?.campaignNumber !== true) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(403).json({ success: false, message: "Campaign number access is not enabled for this account." });
            }
            try {
                normalizedCampaignNumber = normalizeAccountPhone(campaignNumber);
            } catch (error) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({ success: false, message: error.message });
            }
        }

        const normalizedCampaignLink = typeof campaignLink === "string" ? campaignLink.trim() : "";
        const normalizedCampaignLinkName = typeof campaignLinkName === "string" ? campaignLinkName.trim().slice(0, 150) : "";
        if (campaignLink != null && typeof campaignLink !== "string") {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({ success: false, message: "Campaign link must be a URL string." });
        }
        if (normalizedCampaignLink && req.user.role !== "Super Admin" && req.user.featureAccess?.campaignLink !== true) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(403).json({ success: false, message: "Campaign link access is not enabled for this account." });
        }
        if (normalizedCampaignLink) {
            try {
                const parsedLink = new URL(normalizedCampaignLink);
                if (!["http:", "https:"].includes(parsedLink.protocol) || normalizedCampaignLink.length > 2048) throw new Error("Invalid campaign link.");
            } catch {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({ success: false, message: "Enter a valid HTTP or HTTPS campaign link." });
            }
        }

        const shareProfileDp = req.body.shareProfileDp === true || req.body.shareProfileDp === "true";
        if (shareProfileDp && req.user.role !== "Super Admin" && req.user.featureAccess?.campaignDp !== true) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(403).json({ success: false, message: "Campaign profile DP sharing is not enabled for this account." });
        }

        // Safely parse recipients whether sent as JSON array or via multipart/form-data
        let recipients = rawInputRecipients;
        if (typeof recipients === "string") {
            try {
                recipients = JSON.parse(recipients);
            } catch {
                recipients = campaignRecipientLines(recipients).map(({ value }) => value);
            }
        }
        if (!Array.isArray(recipients) && recipients) {
            recipients = [recipients];
        }
        const recipientInputAudit = sanitizeRecipientInputAudit(req.body.recipientInputAudit, recipients || [], req.user._id);

        // 1. Validate required fields before processing or uploading media
        const missingFields = [];
        if (!campaignTitle) missingFields.push("campaignTitle");

        const hasUploadedMedia = Boolean(
            (req.files?.images && req.files.images.length > 0) ||
            (req.files?.image && req.files.image.length > 0) ||
            (req.files?.video && req.files.video.length > 0) ||
            (req.files?.audio && req.files.audio.length > 0) ||
            (req.files?.documents && req.files.documents.length > 0) ||
            (req.files?.document && req.files.document.length > 0) ||
            (req.files?.pdf && req.files.pdf.length > 0)
        );

        const hasContent =
            messageBody ||
            templateId ||
            hasUploadedMedia ||
            (shareProfileDp && req.user.dp_img) ||
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

        const invalidEntries = recipients.flatMap((recipient, index) => {
            const message = campaignRecipientError(typeof recipient === "string" ? recipient : recipient?.phoneNumber);
            return message ? [{ lineNumber: index + 1, message }] : [];
        });
        if (invalidEntries.length) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(400).json({
                success: false,
                message: "Every recipient must contain exactly 12 digits, start with 91, and be entered one per line without spaces, commas or +.",
                invalidCount: invalidEntries.length,
                invalidEntries: invalidEntries.slice(0, 10),
            });
        }

        // 2. Validate the complete batch before uploading any media to Cloudinary.
        const mediaLimits = req.campaignMediaUploadLimits || await getAccountMediaUploadLimits(req.user);
        const IMG_MAX_SIZE = mediaLimits.imageMB * 1024 * 1024;
        const AUDIO_MAX_SIZE = parseInt(process.env.AUDIO_MAX_SIZE_MB || "7") * 1024 * 1024; // default 7 MB
        const VIDEO_MAX_SIZE = mediaLimits.videoMB * 1024 * 1024;
        const DOC_MAX_SIZE = mediaLimits.pdfMB * 1024 * 1024;
        const fieldLimits = { images: IMG_MAX_SIZE, audio: AUDIO_MAX_SIZE, video: VIDEO_MAX_SIZE, documents: DOC_MAX_SIZE };
        for (const [field, files] of Object.entries(req.files || {})) {
            const category = campaignMediaCategory(field);
            const limit = fieldLimits[category];
            const oversized = files.find(file => file.size > limit);
            if (oversized) {
                await mongoSession.abortTransaction();
                mongoSession.endSession();
                return res.status(400).json({
                    success: false,
                    message: `${oversized.originalname} exceeds the ${limit / (1024 * 1024)} MB limit for ${category}.`,
                });
            }
        }

        const isCloudinaryActive = isCloudinaryConfigured();
        const useCloudinary = process.env.USE_CLOUDINARY === "true" || (isCloudinaryActive && process.env.USE_CLOUDINARY !== "false");
        const uploadedMediaTrackers = [];

        const uploadField = async (field) => {
            const rawFiles = [
                ...(req.files?.[field] || []),
                ...(field === "images" ? (req.files?.image || []) : []),
                ...(field === "documents" ? [...(req.files?.pdf || []), ...(req.files?.document || [])] : []),
            ];
            const fileList = Array.from(new Set(rawFiles));
            if (!fileList || fileList.length === 0) return [];
            if (!useCloudinary || !isCloudinaryActive) {
                throw new Error("Campaign attachments require Cloudinary. Configure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET, and set USE_CLOUDINARY=true on the backend.");
            }

            const uploads = await Promise.allSettled(fileList.map(file =>
                uploadCampaignMedia(file, field, cloudinary, tracker => uploadedMediaTrackers.push(tracker))
            ));
            const failed = uploads.find(upload => upload.status === "rejected");
            if (failed) throw failed.reason;
            return uploads.map(upload => upload.value);
        };

        // Upload all media fields concurrently with error handling
        let images = [];
        let audio = [];
        let video = [];
        let documents = [];
        try {
            const uploads = await Promise.allSettled([
                uploadField("images"),
                uploadField("audio"),
                uploadField("video"),
                uploadField("documents"),
            ]);
            const failed = uploads.find(upload => upload.status === "rejected");
            if (failed) throw failed.reason;
            [images, audio, video, documents] = uploads.map(upload => upload.value);
        } catch (uploadErr) {
            console.error("Media upload error:", uploadErr);
            for (const item of uploadedMediaTrackers) {
                if (item.publicId && isCloudinaryActive) {
                    cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType }).catch(() => {});
                } else if (item.localPath) {
                    try { fs.unlinkSync(item.localPath); } catch {}
                }
            }
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(500).json({ message: "Failed to upload media files", error: uploadErr.message });
        }

        // ── Single-Campaign Duplicate Detection & Phone Sanitization ──
        const seenNumbers = new Set();
        const duplicatesList = []; // Preserves every duplicate phone number submitted
        const invalidList = [];    // Preserves every invalid/malformed number submitted
        const sanitizedRecipients = [];

        for (const r of recipients) {
            const rawPhone = typeof r === "string" ? r : r.phoneNumber || "";
            // The entire batch was validated before media uploads or billing.
            const clean = rawPhone;

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

            rate = creditAmount(senderUser.ratePerMsg ?? 12);
            requiredCredits = creditsForCount(rate, totalRecipients);

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

            if (requiredCredits > 0) {
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
                    campaignNumber: normalizedCampaignNumber,
                    campaignLink: normalizedCampaignLink,
                    campaignLinkName: normalizedCampaignLink ? normalizedCampaignLinkName : "",
                    shareProfileDp: Boolean(shareProfileDp),
                    profileDp: shareProfileDp && req.user.dp_img ? req.user.dp_img : "",
                    templateId: templateId || null,
                    messageBody: messageBody || "",
                    recipients: sanitizedRecipients,
                    originalRecipients: recipients.map((number) => String(number)),
                    recipientInputAudit,
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

        const newCampaign = createdCampaigns[0];
        await saveCreditReceipt(req, mongoSession, 201, { success: true, message: "Campaign created successfully.", data: newCampaign, creditDeduction });
        await mongoSession.commitTransaction();
        mongoSession.endSession();


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
        if (typeof uploadedMediaTrackers !== "undefined" && uploadedMediaTrackers.length > 0) {
            for (const item of uploadedMediaTrackers) {
                if (item.publicId && isCloudinaryConfigured()) {
                    cloudinary.uploader.destroy(item.publicId, { resource_type: item.resourceType }).catch(() => {});
                } else if (item.localPath) {
                    try { fs.unlinkSync(item.localPath); } catch {}
                }
            }
        }
        await mongoSession.abortTransaction();
        mongoSession.endSession();
        console.error("Create campaign error:", error);
        return res.status(error.statusCode || 500).json({
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
            .select("-recipientInputAudit -originalRecipients -recipients -recipientReport.records -recipientEntries -spreadsheetColumns -publishedSpreadsheet.rows -publishedSpreadsheet.columns -customRecipientTabs -deletedTabKeys -draftReportNotes -recipientCategoryLabels")
            .populate("userId", "username email role dp_img")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: campaigns.length,
            data: req.user.role === "Super Admin" ? campaigns : campaigns.map(publicCampaignView),
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
            .populate("userId", "username email role resellerId dp_img");

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
        if (!campaign.recipientEntries || campaign.recipientEntries.length === 0) {
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
                const clean = String(inv).replace(/\D/g, "") || String(inv).trim();
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
        if (isSuperAdmin) campaign.recipientEntries = restoreOriginalCampaignEntries(campaign);
        const view = campaign.toObject ? campaign.toObject() : { ...campaign };
        try {
            const accounting = await getCampaignRefundAccounting(campaign, undefined, { strict: false });
            view.settledRefundCredits = accounting.settled;
            if (isSuperAdmin) view.refundAccounting = accounting;
        } catch (accErr) {
            console.warn(`[getCampaignById] Ledger reconciliation notice for ${campaign._id}:`, accErr.message);
            view.settledRefundCredits = creditAmount(campaign.campaignSummary?.creditsRefunded || 0);
            if (isSuperAdmin) {
                view.refundAccounting = {
                    charged: creditAmount(campaign.creditsDeducted || 0),
                    settled: view.settledRefundCredits,
                    remaining: creditDifference(creditAmount(campaign.creditsDeducted || 0), view.settledRefundCredits),
                    reconciled: false,
                };
            }
        }
        if (!isSuperAdmin) {
            if (Array.isArray(view.recipientEntries)) {
                view.recipientEntries = view.recipientEntries.map((e) => ({
                    rowNumber: e.rowNumber,
                    phoneNumber: e.phoneNumber,
                    status: e.status,
                    category: e.category,
                }));
            }
            delete view.spreadsheetColumns;
            delete view.customRecipientTabs;
            delete view.deletedTabKeys;
            delete view.draftReportNotes;
            delete view.recipientCategoryLabels;
        }
        return res.status(200).json({ success: true, data: isSuperAdmin ? view : publicCampaignView(view) });
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
async function getCampaignRefundAccounting(campaign, session, { strict = true } = {}) {
    // A report/category amount can be a plan. Only posted wallet transactions
    // count as money returned; debit adjustments reverse earlier refunds.
    let query = transactionModel.aggregate([
        { $match: { campaignId: campaign._id, type: { $in: ["REFUND", "DEDUCT"] } } },
        { $group: { _id: null,
            charged: { $sum: { $cond: [{ $and: [{ $eq: ["$type", "DEDUCT"] }, { $eq: [{ $ifNull: ["$refundOperationId", null] }, null] }] }, "$amount", 0] } },
            total: { $sum: { $cond: [{ $eq: ["$type", "REFUND"] }, "$amount", { $cond: [{ $ne: [{ $ifNull: ["$refundOperationId", null] }, null] }, { $multiply: ["$amount", -1] }, 0] }] } },
        } },
    ]);
    if (session) query = query.session(session);
    const [record] = await query;
    let charged = creditAmount(Number(record?.charged) || 0);
    const settled = creditAmount(Number(record?.total) || 0);
    const expectedCharged = creditAmount(campaign.creditsDeducted || 0);

    // If campaign has creditsDeducted recorded, but no ledger transactions exist (e.g. test or imported campaign),
    // treat the recorded creditsDeducted as the baseline charged amount if record is empty.
    if (!record && expectedCharged > 0) {
        charged = expectedCharged;
    }

    if (strict && (charged !== expectedCharged || settled < 0 || settled > charged)) {
        const error = new Error("Campaign credit records do not reconcile. Review the ledger before making further billing changes.");
        error.statusCode = 409;
        throw error;
    }
    return { charged, settled, remaining: creditDifference(charged, settled), reconciled: charged === expectedCharged };
}

function validateCampaignBillingStatus(campaign, status) {
    const finalizedFailure = campaign.publicStatus === "failed" || (campaign.publishedSpreadsheet?.publishedAt && (campaign.publishedSpreadsheet.status === "failed" || (!campaign.publicStatus && campaign.status === "failed")));
    if (finalizedFailure && status && status !== "failed") {
        const error = new Error("A failed campaign cannot be restarted after its credits have been refunded. Create a new campaign for another run.");
        error.statusCode = 409;
        throw error;
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

        const session = await mongoose.startSession();
        let campaign;
        let previousStatus;
        const refundInfo = null;
        try {
            await session.withTransaction(async () => {
                campaign = await campaignModel.findById(id).session(session);
                if (!campaign) { const error = new Error("Campaign not found"); error.statusCode = 404; throw error; }
                validateCampaignBillingStatus(campaign, status);
                previousStatus = campaign.status;
                if (previousStatus === status) return;
                if (["completed", "sent", "failed"].includes(previousStatus)) campaign.manualStatusOverride = true;
                if (!["completed", "sent", "failed"].includes(status)) campaign.publicStatus = status;
                else campaign.publicStatus = campaignPublicStatus(campaign);
                campaign.status = status;
                campaign.campaignEndDate = ["completed", "stopped", "failed"].includes(status) ? new Date() : null;
                if (status === "ongoing" && !campaign.campaignStartDate) campaign.campaignStartDate = new Date();

                // Draft status decisions do not settle credits. Refunds are posted
                // atomically with final report publication or workflow settlement.

                await campaign.save({ session });
            }, creditTransactionOptions);
        } finally { await session.endSession(); }
        if (previousStatus === status) return res.status(200).json({ success: true, message: "Campaign already has this status.", data: campaign });
        try {
            if ((status === "ongoing" || status === "scheduled") && !campaign.manualStatusOverride) {
                await scheduleCampaignJob(campaign);
            } else {
                await cancelCampaignJob(id);
            }
        } catch (error) { console.error("[BullMQ] Status saved, but queue update failed:", error.message); }

        if (refundInfo) {
            notifyUser(campaign.userId, "WALLET_UPDATED", {
                campaignId: campaign._id,
                newBalance: refundInfo.newBalance,
                delta: refundInfo.amount,
                reason: "REFUND",
            });
        }

        notifyUser(campaign.userId, "CAMPAIGN_UPDATED", {
            campaignId: campaign._id,
            campaignTitle: campaign.campaignTitle,
            previousStatus,
            status: campaignPublicStatus(campaign),
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
            refundInfo,
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
        return res.status(error.statusCode || 500).json({
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
            !Number.isSafeInteger(numSent) || numSent < 0 ||
            !Number.isSafeInteger(numDelivered) || numDelivered < 0 ||
            !Number.isSafeInteger(numRead) || numRead < 0 ||
            !Number.isSafeInteger(numFailed) || numFailed < 0
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

        validateCampaignBillingStatus(campaign, req.body.status);
        if (campaign.status === "failed" || req.body.status === "failed") { const error = new Error("Publish the failure report to finalize the campaign and refund its credits."); error.statusCode = 409; throw error; }
        const campaignOwner = await userModel.findById(campaign.userId).session(mongoSession);
        const isEligibleForRefund = campaignOwner && campaignOwner.role !== "Super Admin";

        const wholeCampaignFailed = status === "failed" || campaign.status === "failed";
        if (isEligibleForRefund && (numFailed > 0 || wholeCampaignFailed)) {
            const alreadyRefunded = (await getCampaignRefundAccounting(campaign, mongoSession)).settled;

            {
                const rate = campaign.rateSnapshot || campaignOwner.ratePerMsg || 12;
                let refundAmount = wholeCampaignFailed ? campaign.creditsDeducted || 0 : creditsForCount(rate, numFailed);

                if (refundAmount > (campaign.creditsDeducted || 0)) {
                    refundAmount = campaign.creditsDeducted;
                }
                refundAmount = Math.max(0, creditDifference(refundAmount, alreadyRefunded));

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
                                refundOperationId: new mongoose.Types.ObjectId(),
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
        return res.status(error.statusCode || 500).json({
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

        validateCampaignBillingStatus(campaign, req.body.status);
        if (campaign.status === "failed" || req.body.status === "failed") { const error = new Error("Publish the failure report to finalize the campaign and refund its credits."); error.statusCode = 409; throw error; }
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
            let targetRefundAmount = campaign.status === "failed" || status === "failed" ? campaign.creditsDeducted || 0 : creditsForCount(rate, totalRefundNumbersCount);
            if (targetRefundAmount > (campaign.creditsDeducted || 0)) {
                targetRefundAmount = campaign.creditsDeducted;
            }

            const previousRefundAmount = (await getCampaignRefundAccounting(campaign, mongoSession)).settled;
            const netRefundDelta = creditDifference(targetRefundAmount, previousRefundAmount);

            if (netRefundDelta !== 0) {
                updatedUserWallet = await walletModel.findOneAndUpdate(
                    { userId: campaign.userId, ...(netRefundDelta < 0 ? { balance: { $gte: -netRefundDelta } } : {}) },
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

                if (!updatedUserWallet) { const error = new Error("Insufficient credits to reverse the previous refund. No changes were saved."); error.statusCode = 409; throw error; }
                const txType = netRefundDelta > 0 ? "REFUND" : "DEDUCT";
                const absAmount = Math.abs(netRefundDelta);
                const txNotes = netRefundDelta > 0
                    ? `Campaign report adjustment: Refund for ${totalRefundNumbersCount} number(s) on "${campaign.campaignTitle}" (${previousRefundAmount ? `incremental +${netRefundDelta}` : `${targetRefundAmount}`} credits)`
                    : `Campaign report adjustment: Re-debit adjustment of ${absAmount} credits on "${campaign.campaignTitle}"`;

                const [refundTx] = await transactionModel.create(
                    [
                        {
                            fromUser: netRefundDelta > 0 ? req.user._id : campaign.userId,
                            toUser: campaign.userId,
                            amount: absAmount,
                            type: txType,
                            campaignId: campaign._id,
                            refundOperationId: new mongoose.Types.ObjectId(),
                            notes: txNotes,
                            rateSnapshot: rate,
                            balanceAfterFrom: netRefundDelta < 0 ? updatedUserWallet.balance : null,
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
        return res.status(error.statusCode || 500).json({
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
async function saveFailureReport(req, res, campaign, session) {
    const mode = req.body.saveMode;
    if (!["draft", "publish"].includes(mode)) { const error = new Error("Save or publish the failure report before finalizing this campaign."); error.statusCode = 409; throw error; }
    if (Number(req.body.spreadsheetRevision) !== (campaign.spreadsheetRevision || 0)) { const error = new Error("This report changed in another session. Refresh before saving."); error.statusCode = 409; throw error; }
    const notes = String(req.body.reportNotes ?? campaign.draftReportNotes ?? "").trim();
    if (notes.length > 4000 || (mode === "publish" && !notes)) { const error = new Error("Enter a failure reason of 1 to 4000 characters before publishing."); error.statusCode = 400; throw error; }
    const entries = failureReportEntries(campaign);
    if (!entries.length) { const error = new Error("The original campaign contacts are unavailable. Review this campaign before publishing."); error.statusCode = 409; throw error; }
    campaign.draftReportNotes = notes;
    campaign.spreadsheetRevision = (campaign.spreadsheetRevision || 0) + 1;
    let refundInfo = null;
    if (mode === "publish") {
        const accounting = await getCampaignRefundAccounting(campaign, session);
        const owner = await userModel.findById(campaign.userId).session(session);
        if (!owner) throw new Error("Campaign creator not found");
        if (accounting.remaining > 0 && owner.role !== "Super Admin") {
            const wallet = await walletModel.findOneAndUpdate(
                { userId: campaign.userId },
                { $inc: { balance: accounting.remaining }, $setOnInsert: { resellerId: owner.resellerId || null } },
                { returnDocument: "after", upsert: true, session }
            );
            const [transaction] = await transactionModel.create([{
                type: "REFUND", campaignId: campaign._id, refundOperationId: new mongoose.Types.ObjectId(),
                fromUser: req.user._id, toUser: campaign.userId, performedBy: req.user._id,
                amount: accounting.remaining, balanceAfterTo: wallet.balance, rateSnapshot: campaign.rateSnapshot,
                notes: `Full credit refund: failure report published for campaign "${campaign.campaignTitle}".`,
            }], { session });
            refundInfo = { amount: accounting.remaining, newBalance: wallet.balance, transactionId: transaction._id };
        }
        const sheet = failureReportSheet(campaign, notes);
        const publishedAt = new Date();
        campaign.status = "failed";
        campaign.publicStatus = "failed";
        campaign.manualStatusOverride = true;
        campaign.campaignEndDate = publishedAt;
        if (!campaign.campaignSummary) campaign.campaignSummary = {};
        Object.assign(campaign.campaignSummary, { delivered: 0, read: 0, failed: entries.length, creditsRefunded: accounting.charged, adminNotes: notes, reportedAt: publishedAt, reportedBy: req.user._id });
        await saveSpreadsheetRows(campaign._id, "published", sheet.rows, session);
        campaign.publishedSpreadsheet = { ...sheet, rows: [], publishedAt, publishedBy: req.user._id };
    }
    await campaign.save({ session });
    await session.commitTransaction();
    await session.endSession();
    if (mode === "publish") {
        notifyUser(campaign.userId, "CAMPAIGN_UPDATED", { campaignId: campaign._id, campaignTitle: campaign.campaignTitle, status: "failed", reportUpdated: true });
        if (refundInfo) notifyUser(campaign.userId, "WALLET_UPDATED", { campaignId: campaign._id, reason: "REFUND", delta: refundInfo.amount, newBalance: refundInfo.newBalance });
    }
    notifyRole("Super Admin", "CAMPAIGN_UPDATED", { campaignId: campaign._id, status: "failed", reportUpdated: true });
    const view = campaign.toObject ? campaign.toObject() : { ...campaign };
    if (view.publishedSpreadsheet?.publishedAt) view.publishedSpreadsheet = { ...view.publishedSpreadsheet, rows: await loadSpreadsheetRows(campaign._id, "published") };
    return res.status(200).json({ success: true, message: mode === "publish" ? "Failure report published and remaining credits refunded." : "Failure report draft saved.", data: view, refundInfo });
}

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

        if (campaign.status === "failed") return await saveFailureReport(req, res, campaign, mongoSession);
        if (req.body.status === "failed") { const error = new Error("Select Failed on the campaign before preparing its failure report."); error.statusCode = 409; throw error; }

        entries = normalizeDuplicateRows(entries);
        const spreadsheetSave = saveMode === "draft" || saveMode === "publish";
        if (saveMode === "publish" && req.body.status && req.body.status !== "completed") { const error = new Error("A completed report must be published as Completed. Use the failure report for a failed campaign."); error.statusCode = 400; throw error; }
        if (saveMode && !spreadsheetSave) throw new Error("Invalid spreadsheet save mode.");
        if (spreadsheetSave && Number(spreadsheetRevision) !== (campaign.spreadsheetRevision || 0)) {
            await mongoSession.abortTransaction();
            mongoSession.endSession();
            return res.status(409).json({ success: false, message: "This spreadsheet changed in another session. Reload before saving." });
        }
        if (spreadsheetSave && campaign.spreadsheetRevision > 0) {
            campaign.recipientEntries = await loadSpreadsheetRows(campaign._id, "draft", mongoSession);
        }
        campaign.recipientEntries = restoreOriginalCampaignEntries(campaign);
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
                const phoneNumber = String(entry.phoneNumber || "").replace(/\D/g, "") || String(entry.phoneNumber || "").trim();
                if (!phoneNumber) throw new Error("Every row needs a phone number.");
                const cells = Object.fromEntries(Object.entries(entry.cells || {}).filter(([id]) => customIds.has(id)).map(([id, value]) => [id, String(value ?? "").slice(0, 2000)]));
                return { ...entry, rowNumber, phoneNumber, notes: String(entry.notes || "").slice(0, 2000), cells };
            });
            if ([...knownIds].some((rowNumber) => !rowIds.has(rowNumber))) throw new Error("Keep existing recipient rows and their All indexes. Move rows into a category instead of deleting them.");
            if (saveMode === "publish") publishedSheet = buildPublishedSheet(entries, sheetColumns);
          } catch (error) { error.statusCode = 400; throw error; }
        }

        validateCampaignBillingStatus(campaign, saveMode === "publish" && campaign.status === "failed" ? "failed" : req.body.status);
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
            let targetRefundAmount = campaign.status === "failed" || req.body.status === "failed" ? campaign.creditsDeducted || 0 : creditsForCount(rate, refundCount);
            if (targetRefundAmount > (campaign.creditsDeducted || 0)) {
                targetRefundAmount = campaign.creditsDeducted;
            }

            const previousRefundAmount = (await getCampaignRefundAccounting(campaign, mongoSession)).settled;
            const netRefundDelta = creditDifference(targetRefundAmount, previousRefundAmount);

            if (netRefundDelta !== 0) {
                const updatedUserWallet = await walletModel.findOneAndUpdate(
                    { userId: campaign.userId, ...(netRefundDelta < 0 ? { balance: { $gte: -netRefundDelta } } : {}) },
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

                if (!updatedUserWallet) { const error = new Error("Insufficient credits to reverse the previous refund. No changes were saved."); error.statusCode = 409; throw error; }
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
                            toUser: campaign.userId,
                            amount: absAmount,
                            type: txType,
                            campaignId: campaign._id,
                            refundOperationId: new mongoose.Types.ObjectId(),
                            notes: txNotes,
                            rateSnapshot: rate,
                            balanceAfterFrom: netRefundDelta < 0 ? updatedUserWallet.balance : null,
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
            campaign.publicStatus = campaign.status;
            campaign.campaignEndDate = publishedAt;
            campaign.campaignSummary.reportedAt = publishedAt;
            campaign.campaignSummary.reportedBy = req.user._id;
            campaign.campaignSummary.adminNotes = campaign.draftReportNotes;
            campaign.campaignSummary.failed = refundCount;
            await saveSpreadsheetRows(campaign._id, "published", publishedSheet.rows, mongoSession);
            campaign.publishedSpreadsheet = {
                columns: publishedSheet.columns, status: campaign.status, notes: campaign.draftReportNotes, publishedAt, publishedBy: req.user._id,
                summary: {
                    total: entries.length, delivered: entries.filter((row) => ["delivered", "read"].includes(row.status)).length,
                    failed: entries.filter((row) => row.status === "failed").length, read: entries.filter((row) => row.status === "read").length,
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
        if (saveMode === "publish") {
            const update = { campaignId: campaign._id, status: campaign.status, reportUpdated: true };
            notifyUser(campaign.userId, "CAMPAIGN_UPDATED", update);
            notifyRole("Super Admin", "CAMPAIGN_UPDATED", update);
        }

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


export const cancelScheduledCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const campaign = await campaignModel.findById(id);
        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found" });

        const isOwner = String(campaign.userId) === String(req.user._id);
        const isSuperAdmin = req.user.role === "Super Admin";
        const isAssignedReseller = req.user.role === "Reseller" && campaign.userId?.resellerId && String(campaign.userId.resellerId) === String(req.user._id);

        if (!isOwner && !isSuperAdmin && !isAssignedReseller) {
            return res.status(403).json({ success: false, message: "You do not have permission to cancel this campaign." });
        }

        if (!["pending", "scheduled"].includes(campaign.status)) {
            return res.status(400).json({ success: false, message: `Only pending or scheduled campaigns can be cancelled. Current status is "${campaign.status}".` });
        }

        const session = await mongoose.startSession();
        let refundInfo = null;
        try {
            await session.withTransaction(async () => {
                const liveCampaign = await campaignModel.findById(id).session(session);
                if (!liveCampaign) {
                    throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });
                }
                if (!["pending", "scheduled"].includes(liveCampaign.status)) {
                    throw Object.assign(new Error(`Only pending or scheduled campaigns can be cancelled. Current status is "${liveCampaign.status}".`), { statusCode: 409 });
                }
                liveCampaign.status = "stopped";
                liveCampaign.publicStatus = "stopped";
                liveCampaign.campaignEndDate = new Date();

                const owner = await userModel.findById(liveCampaign.userId).session(session);
                if (owner && owner.role !== "Super Admin") {
                    const alreadyRefunded = (await getCampaignRefundAccounting(liveCampaign, session)).settled;
                    const totalCharged = liveCampaign.creditsDeducted || 0;
                    const remainingRefund = Math.max(0, totalCharged - alreadyRefunded);
                    if (remainingRefund > 0) {
                        const updatedWallet = await walletModel.findOneAndUpdate(
                            { userId: liveCampaign.userId },
                            { $inc: { balance: remainingRefund }, $setOnInsert: { resellerId: owner.resellerId || null } },
                            { returnDocument: 'after', upsert: true, session }
                        );
                        const rate = liveCampaign.rateSnapshot || owner.ratePerMsg || 12;
                        const [refundTx] = await transactionModel.create([
                            {
                                fromUser: req.user._id,
                                toUser: liveCampaign.userId,
                                amount: remainingRefund,
                                type: "REFUND",
                                refundOperationId: new mongoose.Types.ObjectId(),
                                campaignId: liveCampaign._id,
                                notes: `Cancellation refund: campaign "${liveCampaign.campaignTitle}" cancelled before launch.`,
                                rateSnapshot: rate,
                                balanceAfterTo: updatedWallet.balance,
                                performedBy: req.user._id,
                            }
                        ], { session });
                        if (!liveCampaign.campaignSummary) liveCampaign.campaignSummary = {};
                        liveCampaign.campaignSummary.creditsRefunded = alreadyRefunded + remainingRefund;
                        refundInfo = {
                            amount: remainingRefund,
                            newBalance: updatedWallet.balance,
                            transactionId: refundTx._id,
                        };
                    }
                }

                await liveCampaign.save({ session });
            }, creditTransactionOptions);
        } finally {
            await session.endSession();
        }

        try { await cancelCampaignJob(id); }
        catch (error) { console.error("[BullMQ] Campaign cancelled, but queue cleanup failed:", error.message); }

        if (refundInfo) {
            notifyUser(campaign.userId, "WALLET_UPDATED", {
                campaignId: campaign._id,
                newBalance: refundInfo.newBalance,
                delta: refundInfo.amount,
                reason: "REFUND",
            });
        }

        const updateData = {
            campaignId: campaign._id,
            campaignTitle: campaign.campaignTitle,
            status: "stopped",
            updatedAt: new Date(),
        };
        notifyUser(campaign.userId, "CAMPAIGN_UPDATED", updateData);
        notifyRole("Super Admin", "CAMPAIGN_UPDATED", updateData);

        return res.status(200).json({
            success: true,
            message: `Campaign cancelled successfully.${refundInfo ? ` ${refundInfo.amount} credits returned to wallet.` : ""}`,
            refundInfo,
        });
    } catch (error) {
        console.error("Cancel scheduled campaign error:", error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.message || "Failed to cancel campaign." });
    }
};

export const rescheduleCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const { scheduledTime } = req.body;
        if (!scheduledTime) {
            return res.status(400).json({ success: false, message: "Please provide a valid scheduledTime." });
        }

        const newDate = new Date(scheduledTime);
        if (Number.isNaN(newDate.getTime()) || newDate.getTime() <= Date.now()) {
            return res.status(400).json({ success: false, message: "Scheduled time must be in the future." });
        }

        const campaign = await campaignModel.findById(id);
        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found." });

        const isOwner = String(campaign.userId) === String(req.user._id);
        const isSuperAdmin = req.user.role === "Super Admin";
        const isAssignedReseller = req.user.role === "Reseller" && campaign.userId?.resellerId && String(campaign.userId.resellerId) === String(req.user._id);

        if (!isOwner && !isSuperAdmin && !isAssignedReseller) {
            return res.status(403).json({ success: false, message: "You do not have permission to reschedule this campaign." });
        }

        if (!["pending", "scheduled"].includes(campaign.status)) {
            return res.status(400).json({ success: false, message: `Only pending or scheduled campaigns can be rescheduled. Current status is "${campaign.status}".` });
        }

        campaign.schedule = "later";
        campaign.scheduledTime = newDate;
        await campaign.save();

        if (campaign.status === "scheduled") {
            await scheduleCampaignJob(campaign);
        }

        const updateData = {
            campaignId: campaign._id,
            campaignTitle: campaign.campaignTitle,
            status: campaign.status,
            scheduledTime: campaign.scheduledTime,
        };
        notifyUser(campaign.userId, "CAMPAIGN_UPDATED", updateData);
        notifyRole("Super Admin", "CAMPAIGN_UPDATED", updateData);

        return res.status(200).json({
            success: true,
            message: "Campaign schedule updated successfully.",
            data: {
                id: campaign._id,
                scheduledTime: campaign.scheduledTime,
                status: campaign.status,
            },
        });
    } catch (error) {
        console.error("Reschedule campaign error:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to reschedule campaign." });
    }
};

export const launchCampaignNow = async (req, res) => {
    try {
        const { id } = req.params;
        const campaign = await campaignModel.findById(id);
        if (!campaign) return res.status(404).json({ success: false, message: "Campaign not found." });

        const isOwner = String(campaign.userId) === String(req.user._id);
        const isSuperAdmin = req.user.role === "Super Admin";
        const isAssignedReseller = req.user.role === "Reseller" && campaign.userId?.resellerId && String(campaign.userId.resellerId) === String(req.user._id);

        if (!isOwner && !isSuperAdmin && !isAssignedReseller) {
            return res.status(403).json({ success: false, message: "You do not have permission to launch this campaign." });
        }

        if (!["pending", "scheduled"].includes(campaign.status)) {
            return res.status(400).json({ success: false, message: `Only pending or scheduled campaigns can be launched. Current status is "${campaign.status}".` });
        }

        if (campaign.status === "pending" && !isSuperAdmin) {
            return res.status(403).json({ success: false, message: "Campaign is awaiting admin approval before it can be launched." });
        }

        campaign.status = "ongoing";
        campaign.publicStatus = "ongoing";
        campaign.schedule = "now";
        campaign.scheduledTime = null;
        campaign.campaignStartDate = new Date();
        await campaign.save();

        await scheduleCampaignJob(campaign);

        const updateData = {
            campaignId: campaign._id,
            campaignTitle: campaign.campaignTitle,
            status: "ongoing",
            startDate: campaign.campaignStartDate,
        };
        notifyUser(campaign.userId, "CAMPAIGN_UPDATED", updateData);
        notifyRole("Super Admin", "CAMPAIGN_UPDATED", updateData);

        return res.status(200).json({
            success: true,
            message: "Campaign launched successfully.",
            data: {
                id: campaign._id,
                status: campaign.status,
                startDate: campaign.campaignStartDate,
            },
        });
    } catch (error) {
        console.error("Launch campaign now error:", error);
        return res.status(500).json({ success: false, message: error.message || "Failed to launch campaign." });
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
    cancelScheduledCampaign,
    rescheduleCampaign,
    launchCampaignNow,
};

/**
 * DELETE /api/campaigns/:id
 * Delete a campaign.
 * Permitted for:
 * - Super Admin (can delete any campaign)
 * - Owning User or Reseller
 */
export const deleteCampaign = async (req, res) => {
    const session = await mongoose.startSession();
    let campaign;
    try {
        await session.withTransaction(async () => {
            // Re-read on every transaction retry so authorization and report
            // checks use the same snapshot as the deletion.
            campaign = await campaignModel.findById(req.params.id).session(session);
            if (!campaign) throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });
            const isSuperAdmin = req.user.role === "Super Admin";
            const isOwner = String(campaign.userId) === String(req.user._id);
            let isAssignedReseller = false;
            if (req.user.role === "Reseller") {
                const owner = await userModel.findById(campaign.userId).session(session);
                isAssignedReseller = owner?.resellerId && String(owner.resellerId) === String(req.user._id);
            }
            if (!isSuperAdmin && !isOwner && !isAssignedReseller) {
                throw Object.assign(new Error("You are not authorized to delete this campaign."), { statusCode: 403 });
            }
            if (!campaign.publishedSpreadsheet?.publishedAt) {
                throw Object.assign(new Error("This campaign has no published report. A Super Admin must create and publish its report before it can be deleted."), { statusCode: 409, code: "CAMPAIGN_REPORT_REQUIRED" });
            }
            // Publishing settles credits. Deleting a reported campaign must
            // preserve its final charges, refunds, and immutable ledger.
            await campaignModel.deleteOne({ _id: campaign._id }).session(session);
        }, creditTransactionOptions);
        // External queue work happens only after the database commits.
        try { await cancelCampaignJob(campaign._id); }
        catch (error) { console.warn("[deleteCampaign] Could not cancel queue job:", error.message); }
        return res.status(200).json({ success: true, message: "Campaign deleted successfully. Credit transactions have been kept." });
    } catch (error) {
        console.error("Delete campaign error:", error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Failed to delete campaign", ...(error.code === "CAMPAIGN_REPORT_REQUIRED" ? { code: error.code } : {}) });
    } finally {
        await session.endSession();
    }
};
