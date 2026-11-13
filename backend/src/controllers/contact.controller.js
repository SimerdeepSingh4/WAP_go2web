import xlsx from "xlsx";
import contactModel from "../models/contact.model.js";
import groupModel from "../models/group.model.js";
import userModel from "../models/user.model.js";

/**
 * Helper to auto-detect columns from a header list
 */
function autoDetectColumns(headers, userMapping = {}) {
    const mapping = {
        phone: userMapping.phone || null,
        name: userMapping.name || null,
        email: userMapping.email || null,
        company: userMapping.company || null,
        tags: userMapping.tags || null,
    };

    const phoneRegex = /(phone|mobile|contact|cell|number|whatsapp|tel|recipient)/i;
    const nameRegex = /^(name|full\s*name|first\s*name|contact\s*name|customer)$/i;
    const emailRegex = /(email|mail|e-mail)/i;
    const companyRegex = /(company|organization|org|business)/i;
    const tagsRegex = /(tag|tags|label|category)/i;

    for (const h of headers) {
        const cleanH = String(h).trim();
        if (!mapping.phone && phoneRegex.test(cleanH)) mapping.phone = cleanH;
        else if (!mapping.name && nameRegex.test(cleanH)) mapping.name = cleanH;
        else if (!mapping.email && emailRegex.test(cleanH)) mapping.email = cleanH;
        else if (!mapping.company && companyRegex.test(cleanH)) mapping.company = cleanH;
        else if (!mapping.tags && tagsRegex.test(cleanH)) mapping.tags = cleanH;
    }

    return mapping;
}

/**
 * POST /api/contacts
 * Create single or multiple contacts (comma-separated or array)
 */
export const createContact = async (req, res) => {
    try {
        const { phoneNumber, phoneNumbers, name, email, company, tags, groupId } = req.body;

        if (groupId) {
            const group = await groupModel.findById(groupId);
            if (!group || group.isDeleted) {
                return res.status(404).json({
                    message: "Group not found",
                    success: false,
                });
            }
        }

        let numbersList = [];
        if (phoneNumbers && typeof phoneNumbers === "string") {
            numbersList = phoneNumbers
                .split(/[\n,]+/)
                .map((p) => p.trim())
                .filter((p) => p.length > 0);
        } else if (Array.isArray(phoneNumbers)) {
            numbersList = phoneNumbers.map((p) => (typeof p === "string" ? p.trim() : p.phoneNumber)).filter(Boolean);
        } else if (phoneNumber) {
            numbersList = [phoneNumber.trim()];
        }

        if (numbersList.length === 0) {
            return res.status(400).json({
                message: "At least one phone number is required",
                success: false,
            });
        }

        const docsToInsert = numbersList.map((num, idx) => ({
            userId: req.user._id,
            phoneNumber: String(num).replace(/\D/g, ""),
            name: (idx === 0 && name ? name : "").trim(),
            email: (email || "").trim(),
            company: (company || "").trim(),
            tags: Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",").map(t => t.trim()).filter(Boolean) : [],
            groupId: groupId || null,
            savedToContacts: req.user.role === "Super Admin",
        }));

        const createdContacts = await contactModel.insertMany(docsToInsert);

        if (groupId) {
            const count = await contactModel.countDocuments({ groupId });
            await groupModel.findByIdAndUpdate(groupId, { totalContacts: count });
        }

        return res.status(201).json({
            message: `Successfully added ${createdContacts.length} contact(s)`,
            success: true,
            data: createdContacts,
            count: createdContacts.length,
        });
    } catch (error) {
        console.error("CreateContact error:", error);
        return res.status(500).json({
            message: error.message || "Failed to create contact",
            success: false,
        });
    }
};

/**
 * POST /api/contacts/import-file
 * Bulk import contacts from uploaded .csv or .xlsx file
 */
export const importContactsFromFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                message: "No file uploaded. Please upload a .csv, .xlsx, or .xls file.",
                success: false,
            });
        }

        const {
            groupId,
            newGroupName,
            newGroupDescription,
            columnMapping: customMappingRaw,
        } = req.body;

        let userMapping = {};
        if (customMappingRaw) {
            try {
                userMapping = typeof customMappingRaw === "string" ? JSON.parse(customMappingRaw) : customMappingRaw;
            } catch (e) {
                console.warn("Invalid columnMapping JSON, falling back to auto-detect");
            }
        }

        // 1. Read workbook buffer with SheetJS
        const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            return res.status(400).json({
                message: "Uploaded file does not contain any sheets.",
                success: false,
            });
        }

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(worksheet, { defval: "" });

        if (rows.length === 0) {
            return res.status(400).json({
                message: "The uploaded sheet is empty or contains no data rows.",
                success: false,
            });
        }

        // 2. Auto-detect columns
        const headers = Object.keys(rows[0]);
        const mapping = autoDetectColumns(headers, userMapping);

        if (!mapping.phone) {
            return res.status(400).json({
                message: "Could not auto-detect a Phone Number column. Please provide a column named 'Phone', 'Mobile', or 'WhatsApp', or specify columnMapping.",
                detectedHeaders: headers,
                success: false,
            });
        }

        // 3. Resolve Group (existing groupId or create newGroupName)
        let targetGroupId = null;
        let groupRecord = null;

        if (newGroupName && typeof newGroupName === "string" && newGroupName.trim()) {
            groupRecord = await groupModel.create({
                userId: req.user._id,
                name: newGroupName.trim(),
                description: newGroupDescription ? newGroupDescription.trim() : `Imported from ${req.file.originalname}`,
            });
            targetGroupId = groupRecord._id;
        } else if (groupId) {
            groupRecord = await groupModel.findById(groupId);
            if (!groupRecord || groupRecord.isDeleted) {
                return res.status(404).json({
                    message: "Specified target group does not exist.",
                    success: false,
                });
            }
            targetGroupId = groupRecord._id;
        }

        // 4. Phone Sanitization & Duplicate Filtering
        const seenNumbersInFile = new Set();
        const duplicatesList = [];
        const invalidList = [];
        const docsToInsert = [];
        const importedNumbers = new Set();

        // Check existing numbers for this user in target group to prevent duplicates
        const existingFilter = { userId: req.user._id };
        if (targetGroupId) existingFilter.groupId = targetGroupId;
        const existingContacts = await contactModel.find(existingFilter).select("phoneNumber");
        const existingDbNumbers = new Set(existingContacts.map((c) => c.phoneNumber));

        for (const row of rows) {
            const rawPhone = row[mapping.phone];
            const cleanPhone = String(rawPhone || "").replace(/\D/g, "");

            // E.164 phone validation (10 to 15 digits)
            if (cleanPhone.length < 10 || cleanPhone.length > 15) {
                invalidList.push(String(rawPhone || "").trim());
                continue;
            }

            // Duplicate in file
            importedNumbers.add(cleanPhone);
            if (seenNumbersInFile.has(cleanPhone)) {
                duplicatesList.push(cleanPhone);
                continue;
            }

            // Already in DB for this user/group
            if (existingDbNumbers.has(cleanPhone)) {
                duplicatesList.push(cleanPhone);
                continue;
            }

            seenNumbersInFile.add(cleanPhone);

            // Collect any non-standard columns into customFields for template interpolation
            const customFields = {};
            for (const [key, val] of Object.entries(row)) {
                if (![mapping.phone, mapping.name, mapping.email, mapping.company, mapping.tags].includes(key)) {
                    if (val !== undefined && val !== null && String(val).trim() !== "") {
                        customFields[key] = String(val).trim();
                    }
                }
            }

            const rawTags = mapping.tags ? row[mapping.tags] : "";
            const tags = typeof rawTags === "string" ? rawTags.split(/[,;]+/).map((t) => t.trim()).filter(Boolean) : [];

            docsToInsert.push({
                userId: req.user._id,
                phoneNumber: cleanPhone,
                name: mapping.name ? String(row[mapping.name] || "").trim() : "",
                email: mapping.email ? String(row[mapping.email] || "").trim() : "",
                company: mapping.company ? String(row[mapping.company] || "").trim() : "",
                tags,
                customFields,
                groupId: targetGroupId,
                savedToContacts: req.user.role === "Super Admin",
            });
        }

        // 5. Bulk Insert Valid Contacts
        let insertedCount = 0;
        if (docsToInsert.length > 0) {
            const inserted = await contactModel.insertMany(docsToInsert, { ordered: false });
            insertedCount = inserted.length;
        }

        if (req.user.role === "Super Admin" && importedNumbers.size) {
            await contactModel.updateMany(
                { ...existingFilter, phoneNumber: { $in: [...importedNumbers] } },
                { $set: { savedToContacts: true } },
            );
        }

        // 6. Update Group totalContacts count
        if (targetGroupId) {
            const count = await contactModel.countDocuments({ groupId: targetGroupId });
            await groupModel.findByIdAndUpdate(targetGroupId, { totalContacts: count });
        }

        return res.status(200).json({
            success: true,
            message: `Successfully imported ${insertedCount} contacts from "${req.file.originalname}".`,
            summary: {
                totalRowsInSheet: rows.length,
                importedCount: insertedCount,
                duplicateCount: duplicatesList.length,
                invalidCount: invalidList.length,
                invalidSamples: invalidList.slice(0, 10),
                columnMappingUsed: mapping,
                group: groupRecord
                    ? {
                          id: groupRecord._id,
                          name: groupRecord.name,
                      }
                    : null,
            },
        });
    } catch (error) {
        console.error("ImportContacts error:", error);
        return res.status(500).json({
            message: error.message || "Failed to process contacts file",
            success: false,
        });
    }
};

/**
 * GET /api/contacts/export
 * Export contacts to a clean, downloadable CSV file
 */
export const exportContactsToCSV = async (req, res) => {
    try {
        const { groupId } = req.query;
        let filter = {};

        if (groupId) {
            filter.groupId = groupId;
        }

        if (req.user.role === "Super Admin") {
            if (req.query.owned === "true") filter.userId = req.user._id;
            if (req.query.saved === "true") {
                filter.userId = req.user._id;
                filter.$or = [{ adminSaved: true }, { savedToContacts: true }];
            }
        } else if (req.user.role === "Reseller") {
            const clientUsers = await userModel.find({ resellerId: req.user._id }).select("_id");
            const clientIds = clientUsers.map((u) => u._id);
            filter.userId = { $in: [req.user._id, ...clientIds] };
        } else {
            filter.userId = req.user._id;
        }

        const contacts = await contactModel
            .find(filter)
            .populate("groupId", "name")
            .populate("userId", "username email")
            .sort({ createdAt: -1 });

        const exportData = contacts.map((c) => {
            const row = {
                "Phone Number": c.phoneNumber,
                Name: c.name || "",
                Email: c.email || "",
                Company: c.company || "",
                Group: c.groupId?.name || "Ungrouped",
                Tags: (c.tags || []).join(", "),
                "Created At": c.createdAt ? new Date(c.createdAt).toISOString() : "",
            };

            // Flatten customFields for template compatibility
            if (c.customFields) {
                const mapObj = c.customFields instanceof Map ? Object.fromEntries(c.customFields) : c.customFields;
                for (const [k, v] of Object.entries(mapObj)) {
                    row[k] = v;
                }
            }

            return row;
        });

        // Convert to CSV with SheetJS
        const worksheet = xlsx.utils.json_to_sheet(exportData);
        const csvContent = xlsx.utils.sheet_to_csv(worksheet);

        const filename = `contacts_export_${new Date().toISOString().slice(0, 10)}.csv`;

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

        return res.status(200).send(csvContent);
    } catch (error) {
        console.error("ExportContacts error:", error);
        return res.status(500).json({
            message: error.message || "Failed to export contacts",
            success: false,
        });
    }
};

/**
 * GET /api/contacts
 * Get contacts with role-based visibility and optional groupId filter
 */
export const getContacts = async (req, res) => {
    try {
        const { groupId } = req.query;
        let filter = {};

        if (groupId) {
            filter.groupId = groupId;
        }

        if (req.user.role === "Super Admin") {
            if (req.query.owned === "true") filter.userId = req.user._id;
            if (req.query.saved === "true") {
                filter.userId = req.user._id;
                filter.$or = [{ adminSaved: true }, { savedToContacts: true }];
            }
        } else if (req.user.role === "Reseller") {
            const clientUsers = await userModel.find({ resellerId: req.user._id }).select("_id");
            const clientIds = clientUsers.map((u) => u._id);
            filter.userId = { $in: [req.user._id, ...clientIds] };
        } else {
            filter.userId = req.user._id;
        }

        const contacts = await contactModel
            .find(filter)
            .populate("groupId", "name")
            .populate("userId", "username email role")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: contacts.length,
            data: contacts,
        });
    } catch (error) {
        console.error("GetContacts error:", error);
        return res.status(500).json({
            message: "Failed to fetch contacts",
            success: false,
        });
    }
};

/**
 * DELETE /api/contacts/:id
 * Delete a single contact
 */
export const deleteContact = async (req, res) => {
    try {
        const { id } = req.params;
        const contact = await contactModel.findById(id);

        if (!contact) {
            return res.status(404).json({
                message: "Contact not found",
                success: false,
            });
        }

        const isOwner = contact.userId.toString() === req.user._id.toString();
        const isSuperAdmin = req.user.role === "Super Admin";

        if (!isOwner && !isSuperAdmin) {
            return res.status(403).json({
                message: "Forbidden: You cannot delete this contact",
                success: false,
            });
        }

        const groupId = contact.groupId;
        await contactModel.deleteOne({ _id: id });

        if (groupId) {
            const count = await contactModel.countDocuments({ groupId });
            await groupModel.findByIdAndUpdate(groupId, { totalContacts: count });
        }

        return res.status(200).json({
            success: true,
            message: "Contact deleted successfully",
        });
    } catch (error) {
        console.error("DeleteContact error:", error);
        return res.status(500).json({
            message: "Failed to delete contact",
            success: false,
        });
    }
};

export default {
    createContact,
    importContactsFromFile,
    exportContactsToCSV,
    getContacts,
    deleteContact,
};
