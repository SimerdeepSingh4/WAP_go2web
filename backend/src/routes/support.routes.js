import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import { supportMediaUpload } from "../middlewares/support-upload.middleware.js";
import {
    getOrCreateConversation,
    listConversations,
    getConversationById,
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

// Conversation lifecycle & inbox
router.post("/conversations", getOrCreateConversation);
router.get("/conversations", listConversations);
router.get("/conversations/:id", getConversationById);
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

