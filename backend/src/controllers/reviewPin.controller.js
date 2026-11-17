import ReviewPin from "../models/reviewPin.model.js";
import { isValidObjectId } from "mongoose";
import { broadcastAll } from "../services/socket.service.js";

/**
 * Derive tenantId from the authenticated user.
 * - Super Admin  → null  (sees all pins with tenantId: null)
 * - Reseller     → their own _id
 * - User         → their resellerId (or null if not linked to a reseller)
 */
function getTenantId(user) {
    if (user.role === "Super Admin") return null;
    if (user.role === "Reseller") return user._id;
    // User role
    return user.resellerId ?? null;
}

// GET /api/review-pins?page=/some/path
export async function listPins(req, res) {
    try {
        const { page } = req.query;
        if (!page) {
            return res.status(400).json({ success: false, message: "Query param 'page' is required." });
        }

        const query = { page };
        if (req.user.role !== "Super Admin") {
            query.tenantId = getTenantId(req.user);
        }

        const pins = await ReviewPin.find(query)
            .sort({ createdAt: 1 })
            .lean();

        return res.json({ success: true, pins });
    } catch (err) {
        console.error("[ReviewPin] listPins error:", err);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
}

// POST /api/review-pins
export async function createPin(req, res) {
    try {
        const {
            page,
            testerName,
            description,
            elementSelector,
            elementRelX,
            elementRelY,
            pageRelX,
            pageRelY,
            scrollY,
        } = req.body;

        if (!page || !testerName || !description) {
            return res.status(400).json({
                success: false,
                message: "Fields 'page', 'testerName', and 'description' are required.",
            });
        }

        const tenantId = getTenantId(req.user);

        const pin = await ReviewPin.create({
            page,
            role: req.user.role,
            tenantId,
            createdByUserId: req.user._id,
            testerName,
            description,
            elementSelector: elementSelector ?? null,
            elementRelX: elementRelX ?? null,
            elementRelY: elementRelY ?? null,
            pageRelX: pageRelX ?? null,
            pageRelY: pageRelY ?? null,
            scrollY: scrollY ?? null,
        });

        broadcastAll("REVIEW_PIN_CHANGED", { action: "create", page, pinId: pin._id });
        return res.status(201).json({ success: true, pin });
    } catch (err) {
        console.error("[ReviewPin] createPin error:", err);
        if (err.name === "ValidationError") {
            return res.status(400).json({ success: false, message: err.message });
        }
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
}

// PATCH /api/review-pins/:id/resolve
export async function resolvePin(req, res) {
    const { id } = req.params;
    const resolvedByName = typeof req.body?.resolvedByName === "string" ? req.body.resolvedByName.trim() : "";
    if (!isValidObjectId(id)) {
        return res.status(400).json({ success: false, message: "Invalid pin ID." });
    }
    if (!resolvedByName || resolvedByName.length > 120) {
        return res.status(400).json({ success: false, message: "Enter your name (up to 120 characters)." });
    }
    try {
        const scope = { _id: id };
        if (req.user.role !== "Super Admin") scope.tenantId = getTenantId(req.user);
        // The first resolver wins, including when two people resolve concurrently.
        // $ne also supports pins created before the status field existed.
        let pin = await ReviewPin.findOneAndUpdate(
            { ...scope, status: { $ne: "resolved" } },
            { $set: { status: "resolved", resolvedByName, resolvedByUserId: req.user._id, resolvedAt: new Date() } },
            { new: true, runValidators: true }
        );
        if (!pin) pin = await ReviewPin.findOne(scope);
        if (!pin) return res.status(404).json({ success: false, message: "Pin not found." });
        broadcastAll("REVIEW_PIN_CHANGED", { action: "resolve", page: pin.page, pinId: pin._id });
        return res.json({ success: true, pin });
    } catch (err) {
        console.error("[ReviewPin] resolvePin error:", err);
        return res.status(500).json({ success: false, message: "Could not resolve this pin. Please try again." });
    }
}

// DELETE /api/review-pins/:id
export async function deletePin(req, res) {
    try {
        const pin = await ReviewPin.findById(req.params.id);
        if (!pin) {
            return res.status(404).json({ success: false, message: "Pin not found." });
        }

        const isSuperAdmin = req.user.role === "Super Admin";
        const isOwner = req.user._id.toString() === pin.createdByUserId.toString();

        if (!isSuperAdmin && !isOwner) {
            return res.status(403).json({ success: false, message: "Not authorized to delete this pin." });
        }

        await pin.deleteOne();
        broadcastAll("REVIEW_PIN_CHANGED", { action: "delete", page: pin.page, pinId: pin._id });
        return res.json({ success: true, message: "Pin deleted." });
    } catch (err) {
        console.error("[ReviewPin] deletePin error:", err);
        return res.status(500).json({ success: false, message: "Internal server error." });
    }
}
