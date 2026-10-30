import groupModel from "../models/group.model.js";
import contactModel from "../models/contact.model.js";
import userModel from "../models/user.model.js";

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
            // Super Admin sees everything
        } else if (req.user.role === "Reseller") {
            const clientUsers = await userModel.find({ resellerId: req.user._id }).select("_id");
            const clientIds = clientUsers.map((u) => u._id);
            filter.userId = { $in: [req.user._id, ...clientIds] };
        } else {
            filter.userId = req.user._id;
        }

        const groups = await groupModel
            .find(filter)
            .populate("userId", "username email role")
            .sort({ createdAt: -1 });

        // Update real-time totalContacts count for each group
        const enrichedGroups = await Promise.all(
            groups.map(async (g) => {
                const count = await contactModel.countDocuments({ groupId: g._id });
                return {
                    ...g.toObject(),
                    totalContacts: count,
                };
            })
        );

        return res.status(200).json({
            success: true,
            count: enrichedGroups.length,
            data: enrichedGroups,
        });
    } catch (error) {
        console.error("GetGroups error:", error);
        return res.status(500).json({
            message: "Failed to fetch groups",
            success: false,
        });
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

        group.isDeleted = true;
        group.deletedAt = new Date();
        await group.save();

        // Remove group association from contacts in this group
        await contactModel.updateMany({ groupId: group._id }, { $set: { groupId: null } });

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

