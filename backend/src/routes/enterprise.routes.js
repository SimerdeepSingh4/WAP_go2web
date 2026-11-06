import { Router } from "express";
import { protect, authorizeRoles, blockInPreviewMode } from "../middlewares/auth.middleware.js";
import { AuditEvent } from "../models/audit.model.js";
import { verifyAuditStream } from "../services/audit.service.js";

const router = Router();
router.use(protect, authorizeRoles("Super Admin"), blockInPreviewMode("Audit access"));
router.get("/audit", async (req, res, next) => {
    try {
        const limit = Math.min(200, Math.max(1, Math.floor(Number(req.query.limit) || 50)));
        const filter = {};
        const scope = req.query.scope || "changes";
        if (!["changes", "requests", "all"].includes(scope)) return res.status(400).json({ message: "Invalid audit scope" });
        if (scope === "changes") filter.action = { $not: /^request\./ };
        if (scope === "requests") filter.action = /^request\./;
        if (typeof req.query.search === "string" && req.query.search.trim()) {
            const pattern = new RegExp(req.query.search.trim().slice(0, 120).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = ["actor.name", "actor.id", "stream", "action", "data.after.username", "data.after.email", "data.before.username", "data.before.email", "data.after.type", "request.id"].map((field) => ({ [field]: pattern }));
        }
        if (typeof req.query.stream === "string") filter.stream = req.query.stream.slice(0, 200);
        if (typeof req.query.actorId === "string") filter["actor.id"] = req.query.actorId.slice(0, 100);
        if (typeof req.query.requestId === "string") filter["request.id"] = req.query.requestId.slice(0, 100);
        if (req.query.before) {
            if (!/^[a-f0-9]{24}$/i.test(req.query.before)) return res.status(400).json({ message: "Invalid cursor" });
            filter._id = { $lt: req.query.before };
        }
        const items = await AuditEvent.find(filter).sort({ _id: -1 }).limit(limit).lean();
        res.json({ success: true, items, nextCursor: items.length === limit ? String(items.at(-1)._id) : null });
    } catch (error) { next(error); }
});
router.get("/audit/verify", async (req, res, next) => {
    try {
        if (typeof req.query.stream !== "string" || !req.query.stream || req.query.stream.length > 200) return res.status(400).json({ message: "A stream is required" });
        res.json(await verifyAuditStream(req.query.stream));
    } catch (error) { next(error); }
});
export default router;
