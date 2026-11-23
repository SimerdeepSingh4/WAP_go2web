import { Router } from "express";
import { creditRequest, retryCreditController } from "../helpers/credit-operation.js";
import { ownCreditBalanceResult } from "../controllers/credit-reconciliation.controller.js";
import {
    getBalance,
    allocateCredits,
    reclaimCredits,
    getTransactions,
    updateRate,
    requestCredits,
    reconcileCreditBalance,
} from "../controllers/credit.controller.js";
import {
    getRates,
    setRate,
    getPaymentInstructions,
    updatePaymentInstructions,
    getSellerPaymentInstructions,
} from "../controllers/credit-rate.controller.js";
import {
    createQuote,
    submitProof,
    getProof,
    listPurchases,
    getPurchaseById,
    approvePurchase,
    rejectPurchase,
    flagPurchaseForReview,
    fixFlaggedProof,
} from "../controllers/credit-purchase.controller.js";
import { paymentProofUpload } from "../middlewares/payment-proof-upload.middleware.js";
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
// Super Admin only; private reconciliation details are never returned to clients or resellers.
creditRouter.get("/reconcile", authorizeRoles("Super Admin"), reconcileCreditBalance);
creditRouter.get("/balance-result", ownCreditBalanceResult);

// Purchase Rates
creditRouter.get("/rates", getRates);
creditRouter.post(
    "/rates",
    authorizeRoles("Super Admin", "Reseller"),
    blockInPreviewMode("Rate update"),
    setRate
);

// Payment Instructions
creditRouter.get("/payment-instructions", getPaymentInstructions);
creditRouter.put(
    "/payment-instructions",
    authorizeRoles("Super Admin", "Reseller"),
    blockInPreviewMode("Payment instructions update"),
    updatePaymentInstructions
);
creditRouter.get("/payment-instructions/seller", getSellerPaymentInstructions);

// Purchases & Quotes
creditRouter.post(
    "/purchases/quote",
    blockInPreviewMode("Credit quote"),
    creditRequest,
    retryCreditController(createQuote)
);
creditRouter.post(
    "/purchases/:id/proof",
    blockInPreviewMode("Payment proof"),
    paymentProofUpload.single("proof"),
    submitProof
);
creditRouter.get("/purchases/:id/proof", getProof);
creditRouter.get("/purchases", listPurchases);
creditRouter.get("/purchases/:id", getPurchaseById);
creditRouter.post(
    "/purchases/:id/approve",
    authorizeRoles("Super Admin", "Reseller"),
    blockInPreviewMode("Purchase approval"),
    creditRequest,
    retryCreditController(approvePurchase)
);
creditRouter.post(
    "/purchases/:id/reject",
    authorizeRoles("Super Admin", "Reseller"),
    blockInPreviewMode("Purchase rejection"),
    creditRequest,
    retryCreditController(rejectPurchase)
);

creditRouter.post(
    "/purchases/:id/flag",
    authorizeRoles("Super Admin", "Reseller"),
    blockInPreviewMode("Flag purchase"),
    flagPurchaseForReview
);
creditRouter.post(
    "/purchases/:id/manual-review",
    authorizeRoles("Super Admin", "Reseller"),
    blockInPreviewMode("Payment review"),
    flagPurchaseForReview
);
creditRouter.patch(
    "/purchases/:id/fix",
    blockInPreviewMode("Fix payment proof"),
    paymentProofUpload.single("proof"),
    fixFlaggedProof
);
creditRouter.post(
    "/purchases/:id/fix",
    blockInPreviewMode("Fix payment proof"),
    paymentProofUpload.single("proof"),
    fixFlaggedProof
);

// POST /api/credits/allocate — Super Admin / Reseller only
// Super Admin → Reseller (unlimited pool)
// Reseller → User (from own balance)
creditRouter.post(
    "/allocate",
    authorizeRoles("Super Admin", "Reseller"),
    blockInPreviewMode("Credit allocation"),
    creditRequest,
    retryCreditController(allocateCredits, { walletIds: req => [req.body.toUserId, req.user.role === "Reseller" ? req.user._id : null] })
);

// POST /api/credits/request — User requests credits (creates a pending transaction)
creditRouter.post(
    "/request",
    blockInPreviewMode("Credit request"),
    creditRequest,
    requestCredits
);

// POST /api/credits/reclaim — Super Admin + Reseller
// Super Admin: reclaim from any Reseller or User
// Reseller: reclaim from their own Users only (credits return to reseller wallet)
creditRouter.post(
    "/reclaim",
    authorizeRoles("Super Admin", "Reseller"),
    blockInPreviewMode("Credit reclaim"),
    creditRequest,
    retryCreditController(reclaimCredits, { walletIds: req => [req.body.fromUserId, req.user.role === "Reseller" ? req.user._id : null] })
);

// Preserve a clear response for clients using the retired endpoint.
creditRouter.post("/deduct", (_req, res) => res.status(410).json({
    success: false,
    message: "Usage debits are posted when a campaign or number filtering request is accepted.",
}));

// GET /api/credits/transactions — Audit log with role-based filtering
// Users see only their own, Resellers see their users, Super Admin sees all
creditRouter.get("/transactions", getTransactions);

// PATCH /api/credits/rate — Update a user's rate per recipient
// Super Admin can set rates for Resellers and Users
// Reseller can set rates for their own Users only
creditRouter.patch(
    "/rate",
    authorizeRoles("Super Admin", "Reseller"),
    blockInPreviewMode("Rate update"),
    updateRate
);

export default creditRouter;
