import express from "express";
import mongoose from "mongoose";
import { protect, blockInPreviewMode, authorizeRoles } from "../middlewares/auth.middleware.js";
import { supportMediaUpload } from "../middlewares/support-upload.middleware.js";
import { getSupportContext, getSupportTransactions, getSupportLedger, applySupportAccessAction, applySupportWalletAction } from "../controllers/support-tools.controller.js";
import {
    getOrCreateConversation,
    listConversations,
    getConversationById,
    deleteConversation,
    getConversationMessages,
    sendMessage,
    markAsRead,
    updateStatus,
    requestEscalation,
    getAdminInbox,
    uploadAttachment,
    serveAttachment,
} from "../controllers/support.controller.js";

const router = express.Router();

// All support routes require authentication
router.use(protect);
router.use((req, res, next) => req.method === "GET" ? next() : blockInPreviewMode("Support changes")(req, res, next));
router.param("id", (req, res, next, id) => mongoose.Types.ObjectId.isValid(id) ? next() : res.status(400).json({ success: false, message: "Invalid support reference." }));

// Conversation lifecycle & inbox
router.post("/conversations", getOrCreateConversation);
router.get("/conversations", listConversations);
router.get("/conversations/:id", getConversationById);
router.get("/conversations/:id/context", getSupportContext);
router.get("/conversations/:id/transactions", getSupportTransactions);
router.get("/conversations/:id/ledger", authorizeRoles("Super Admin"), getSupportLedger);
router.post("/conversations/:id/wallet-action", authorizeRoles("Super Admin"), applySupportWalletAction);
router.post("/conversations/:id/access-action", authorizeRoles("Reseller", "Super Admin"), applySupportAccessAction);
router.delete("/conversations/:id", authorizeRoles("Super Admin"), deleteConversation);
router.patch("/conversations/:id/status", updateStatus);
router.post("/conversations/:id/escalate", requestEscalation);
router.post("/conversations/:id/read", markAsRead);

// Messages in a conversation
router.get("/conversations/:id/messages", getConversationMessages);
router.post("/conversations/:id/messages", sendMessage);

// Attachments
router.post("/conversations/:id/attachments", supportMediaUpload.single("file"), uploadAttachment);
router.get("/attachments/:id/view", serveAttachment);
router.get("/attachments/:id/download", serveAttachment);

// Super Admin inbox
router.get("/admin/inbox", getAdminInbox);

export default router;

