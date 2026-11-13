import groupModel from "../models/group.model.js";
import contactModel from "../models/contact.model.js";
import userModel from "../models/user.model.js";
import mongoose from "mongoose";

const sourceUserPopulation = { path: "sourceUserId", select: "username email role resellerId", populate: { path: "resellerId", select: "username" } };

/**
 * POST /api/groups
 * Create a new contact group
 */
export const createGroup = async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({
                message: "Group name is required",
                success: false,
            });
        }

        const group = await groupModel.create({
            userId: req.user._id,
            adminFolder: req.user.role === "Super Admin",
            name: name.trim(),
            description: (description || "").trim(),
            totalContacts: 0,
        });

        return res.status(201).json({
            message: "Group created successfully",
            success: true,
            data: group,
        });
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ success: false, message: "A folder with this name already exists. Choose the existing folder or use another name." });
        console.error("CreateGroup error:", error);
        return res.status(500).json({
            message: error.message || "Failed to create group",
            success: false,
        });
    }
};

/**
 * GET /api/groups
 * Get all contact groups with role-based visibility:
 * - Super Admin: all groups
 * - Reseller: own groups + client users' groups
 * - User: only own groups
 */
export const getGroups = async (req, res) => {
    try {
        let filter = { isDeleted: false };

        if (req.user.role === "Super Admin") {
            if (req.query.owned === "true") filter.userId = req.user._id;
        } else if (req.user.role === "Reseller") {
            const clientUsers = await userModel.find({ resellerId: req.user._id }).select("_id");
            const clientIds = clientUsers.map((u) => u._id);
            filter.userId = { $in: [req.user._id, ...clientIds] };
        } else {
            filter.userId = req.user._id;
        }

        const paginated = req.query.limit !== undefined || req.query.page !== undefined;
        const requestedPage = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 12);
        if (paginated && (!Number.isSafeInteger(requestedPage) || requestedPage < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)) {
            return res.status(400).json({ success: false, message: "Choose a valid page and a page size between 1 and 100." });
        }
        const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 100) : "";
        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const match = new RegExp(escaped, "i");
            const users = await userModel.find({ $or: [{ username: match }, { email: match }] }).select("_id").lean();
            const userIds = users.map((user) => user._id);
            const [sources, contactGroups] = await Promise.all([
                userModel.find({ $or: [{ _id: { $in: userIds } }, { resellerId: { $in: userIds } }] }).select("_id").lean(),
                contactModel.distinct("groupId", { phoneNumber: match, groupId: { $ne: null }, ...(filter.userId ? { userId: filter.userId } : {}) }),
            ]);
            filter.$or = [{ name: match }, { sourceUserId: { $in: sources.map((user) => user._id) } }, { _id: { $in: contactGroups } }];
        }
        const total = paginated ? await groupModel.countDocuments(filter) : undefined;
        const totalPages = paginated ? Math.max(1, Math.ceil(total / limit)) : undefined;
        const page = paginated ? Math.min(requestedPage, totalPages) : undefined;
        const query = groupModel
            .find(filter)
            .populate("userId", "username email role")
            .populate(sourceUserPopulation)
            .sort({ createdAt: -1, _id: -1 });
        if (paginated) query.skip((page - 1) * limit).limit(limit);
        const groups = await query;

        const counts = groups.length ? await contactModel.aggregate([
            { $match: { groupId: { $in: groups.map((group) => group._id) } } },
            { $group: { _id: "$groupId", count: { $sum: 1 } } },
        ]) : [];
        const totals = new Map(counts.map((item) => [String(item._id), item.count]));
        const enrichedGroups = await Promise.all(
            groups.map(async (g) => {
                const preview = paginated ? await contactModel.find({ groupId: g._id }).select("phoneNumber -_id").limit(2).lean() : [];
                return {
                    ...g.toObject(),
                    totalContacts: totals.get(String(g._id)) || 0,
                    ...(paginated ? { previewNumbers: preview.map((contact) => contact.phoneNumber) } : {}),
                };
            })
        );

        return res.status(200).json({
            success: true,
            count: enrichedGroups.length,
            data: enrichedGroups,
            ...(paginated ? { pagination: { page, limit, total, totalPages } } : {}),
        });
    } catch (error) {
        console.error("GetGroups error:", error);
        return res.status(500).json({
            message: "Failed to fetch groups",
            success: false,
        });
    }
};

export const getGroupById = async (req, res) => {
    try {
        if (req.user.role !== "Super Admin") return res.status(403).json({ success: false, message: "Only super admins can open admin contact folders." });
        if (!mongoose.isObjectIdOrHexString(req.params.id)) return res.status(400).json({ success: false, message: "Invalid folder ID." });
        const group = await groupModel.findOne({ _id: req.params.id, userId: req.user._id, isDeleted: false }).populate(sourceUserPopulation);
        if (!group) return res.status(404).json({ success: false, message: "Folder not found." });
        const totalContacts = await contactModel.countDocuments({ groupId: group._id });
        return res.json({ success: true, data: { ...group.toObject(), totalContacts } });
    } catch (error) {
        console.error("Get folder error:", error);
        return res.status(500).json({ success: false, message: "Unable to load this folder." });
    }
};

/**
 * DELETE /api/groups/:id
 * Delete a contact group (soft delete)
 */
export const deleteGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const group = await groupModel.findById(id);

        if (!group || group.isDeleted) {
            return res.status(404).json({
                message: "Group not found",
                success: false,
            });
        }

        // Permission check
        const isOwner = group.userId.toString() === req.user._id.toString();
        const isSuperAdmin = req.user.role === "Super Admin";

        if (!isOwner && !isSuperAdmin) {
            return res.status(403).json({
                message: "Forbidden: You cannot delete this group",
                success: false,
            });
        }

        // Ungrouped numbers leave the per-folder unique index. This preserves
        // numbers shared by two folders when both folders are deleted.
        await contactModel.updateMany({ groupId: group._id }, { $set: { groupId: null, adminSaved: false } });
        group.isDeleted = true;
        group.deletedAt = new Date();
        await group.save();

        return res.status(200).json({
            success: true,
            message: `Group "${group.name}" deleted successfully`,
        });
    } catch (error) {
        console.error("DeleteGroup error:", error);
        return res.status(500).json({
            message: "Failed to delete group",
            success: false,
        });
    }
};

export default {
    createGroup,
    getGroups,
    deleteGroup,
};

