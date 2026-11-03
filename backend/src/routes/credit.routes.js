import { Router } from "express";
import {
    getBalance,
    allocateCredits,
    reclaimCredits,
    deductCredits,
    getTransactions,
    updateRate,
    requestCredits,
    reconcileCreditBalance,
} from "../controllers/credit.controller.js";
import {
    protect,
    authorizeRoles,
    blockInPreviewMode,
} from "../middlewares/auth.middleware.js";

const creditRouter = Router();

// All credit routes require authentication
creditRouter.use(protect);

// GET /api/credits/balance — Any logged-in user can check their own balance
// Super Admin / Reseller can also pass ?userId=xxx to check another user's balance
creditRouter.get("/balance", getBalance);

// GET /api/credits/reconcile — Invariant audit: Wallet Balance === Total Inflows - Total Outflows
// Any user can reconcile their own wallet; Super Admin can audit any user with ?userId=xxx
creditRouter.get("/reconcile", reconcileCreditBalance);

// POST /api/credits/allocate — Super Admin / Reseller only
// Super Admin → Reseller (unlimited pool)
// Reseller → User (from own balance)
creditRouter.post(
    "/allocate",
    authorizeRoles("Super Admin", "Reseller"),
    blockInPreviewMode("Credit allocation"),
    allocateCredits
);

// POST /api/credits/request — User requests credits (creates a pending transaction)
creditRouter.post(
    "/request",
    blockInPreviewMode("Credit request"),
    requestCredits
);

// POST /api/credits/reclaim — Super Admin emergency administrative recall ONLY
// Reseller transfers are final and irreversible (prevents reseller rug-pull fraud)
creditRouter.post(
    "/reclaim",
    authorizeRoles("Super Admin"),
    blockInPreviewMode("Credit reclaim"),
    reclaimCredits
);

// POST /api/credits/deduct — Deduct credits when messages are sent
// Super Admin / Reseller can deduct from any user under them
// Users can deduct from themselves (for sending messages)
creditRouter.post(
    "/deduct",
    blockInPreviewMode("Credit deduction"),
    deductCredits
);

// GET /api/credits/transactions — Audit log with role-based filtering
// Users see only their own, Resellers see their users, Super Admin sees all
creditRouter.get("/transactions", getTransactions);

// PATCH /api/credits/rate — Update a user's rate per message
// Super Admin can set rates for Resellers and Users
// Reseller can set rates for their own Users only
creditRouter.patch(
    "/rate",
    authorizeRoles("Super Admin", "Reseller"),
    blockInPreviewMode("Rate update"),
    updateRate
);

export default creditRouter;
