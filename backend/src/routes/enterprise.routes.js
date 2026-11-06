import { Router } from "express";
import { protect, authorizeRoles, blockInPreviewMode } from "../middlewares/auth.middleware.js";
import { AuditEvent } from "../models/audit.model.js";
import Workflow from "../models/campaign-workflow.model.js";
import { verifyAuditStream } from "../services/audit.service.js";

const router = Router();
router.use(protect, authorizeRoles("Super Admin"), blockInPreviewMode("Audit access"));
router.get("/audit", async (req, res, next) => {
    try {
        const limit = Math.min(200, Math.max(1, Math.floor(Number(req.query.limit) || 50)));
        const filter = {};
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
router.get("/workflows", async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.stage) {
            if (!["pending_approval", "ready", "waiting_webhook", "settling", "completed", "cancelled"].includes(req.query.stage)) return res.status(400).json({ message: "Invalid workflow stage" });
            filter.stage = req.query.stage;
        }
        res.json({ success: true, items: await Workflow.find(filter).select("-completion -dispatchKey -lease").sort({ updatedAt: -1 }).limit(100).lean() });
    } catch (error) { next(error); }
});
export default router;
