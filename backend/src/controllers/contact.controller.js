import contactModel from "../models/contact.model.js";
import groupModel from "../models/group.model.js";
import userModel from "../models/user.model.js";

/**
 * POST /api/contacts
 * Create single or multiple contacts (support comma-separated phone numbers or array)
 */
export const createContact = async (req, res) => {
    try {
        const { phoneNumber, phoneNumbers, name, groupId } = req.body;

        // If groupId is provided, ensure group exists
        if (groupId) {
            const group = await groupModel.findById(groupId);
            if (!group || group.isDeleted) {
                return res.status(404).json({
                    message: "Group not found",
                    success: false,
                });
            }
        }

        // Support multiple phone numbers (bulk paste comma-separated or newline-separated)
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
            phoneNumber: num,
            name: (idx === 0 && name ? name : "").trim(),
            groupId: groupId || null,
        }));

        const createdContacts = await contactModel.insertMany(docsToInsert);

        // Update totalContacts count on group
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
            // Super Admin sees all contacts
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
    getContacts,
    deleteContact,
};

