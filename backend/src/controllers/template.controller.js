import templateModel from "../models/template.model.js";

export const createTemplate = async (req, res) => {
    try {
        const { title, description, body, mediaType, mediaUrl, isPublic, variables } = req.body;

        if (!title || !description || !body) {
            return res.status(400).json({
                message: "Title, description, and body are required",
                success: false,
            });
        }

        const template = await templateModel.create({
            userId: req.user._id,
            title,
            description,
            body,
            variables: variables || [],
            mediaType: mediaType || "none",
            mediaUrl: mediaUrl || null,
            isPublic: isPublic || false,
        });

        return res.status(201).json({
            success: true,
            message: "Template created successfully",
            data: template,
        });
    } catch (error) {
        console.error("Create template error:", error);
        return res.status(500).json({
            message: error.message || "Failed to create template",
            success: false,
        });
    }
};

export const getTemplates = async (req, res) => {
    try {
        const filter = req.user.role === "Super Admin" 
            ? {} 
            : { $or: [{ userId: req.user._id }, { isPublic: true }] };

        const templates = await templateModel.find(filter).sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: templates.length,
            data: templates,
        });
    } catch (error) {
        console.error("Get templates error:", error);
        return res.status(500).json({
            message: "Failed to fetch templates",
            success: false,
        });
    }
};

export const getTemplateById = async (req, res) => {
    try {
        const { id } = req.params;
        const template = await templateModel.findById(id);

        if (!template) {
            return res.status(404).json({
                message: "Template not found",
                success: false,
            });
        }

        return res.status(200).json({
            success: true,
            data: template,
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch template",
            success: false,
        });
    }
};

export const deleteTemplate = async (req, res) => {
    try {
        const { id } = req.params;
        const template = await templateModel.findById(id);

        if (!template) {
            return res.status(404).json({
                message: "Template not found",
                success: false,
            });
        }

        const isOwner = template.userId.toString() === req.user._id.toString();
        const isAdmin = req.user.role === "Super Admin";

        if (!isOwner && !isAdmin) {
            return res.status(403).json({
                message: "Forbidden: You do not own this template",
                success: false,
            });
        }

        await templateModel.deleteOne({ _id: id });

        return res.status(200).json({
            success: true,
            message: "Template deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to delete template",
            success: false,
        });
    }
};

export default {  
    createTemplate,
    getTemplates,
    getTemplateById,
    deleteTemplate,
};
