import mongoose from "mongoose";
import { Router } from "express";
import { authorizeRoles, blockInPreviewMode, protect } from "../middlewares/auth.middleware.js";
import { creditRequest, retryCreditController } from "../helpers/credit-operation.js";
import { createFilteringRequest, getFilteringRequest, listFilteringRequests, saveFilteringResults } from "../controllers/number-filtering.controller.js";

const router = Router();
router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    // The signed request record includes submission metadata, never the pasted list.
    req.auditInput = { numberCharacters: typeof req.body?.numbers === "string" ? req.body.numbers.length : 0 };
    next();
});
router.use(protect);
router.param("id", (_req, res, next, id) => {
    if (!mongoose.isObjectIdOrHexString(id)) return res.status(400).json({ success: false, message: "Invalid filtering request reference." });
    return next();
});
router.get("/", authorizeRoles("Super Admin", "Reseller", "User"), listFilteringRequests);
router.get("/:id", authorizeRoles("Super Admin", "Reseller", "User"), getFilteringRequest);
router.post("/", authorizeRoles("Reseller", "User"), blockInPreviewMode("Number filtering"), creditRequest,
    retryCreditController(createFilteringRequest, { walletIds: req => [req.user._id] }));
router.put("/:id/results", authorizeRoles("Super Admin"), blockInPreviewMode("Filtering results"), saveFilteringResults);

export default router;
