import apiClient from "./client";

/**
 * Support Conversations & Messaging API Client
 */
export const supportApi = {
    // Get or start user's ongoing conversation
    getOrCreateConversation: async (subject = "Customer Support") => {
        const response = await apiClient.post("/support/conversations", { subject });
        return response.data;
    },

    // List conversations with status & escalation filters
    listConversations: async (params = {}) => {
        const response = await apiClient.get("/support/conversations", { params });
        return response.data;
    },

    // Get specific conversation metadata
    getConversationById: async (id) => {
        const response = await apiClient.get(`/support/conversations/${id}`);
        return response.data;
    },

    // Get paginated messages
    getMessages: async (conversationId, beforeSequence = null, limit = 50) => {
        const params = { limit };
        if (beforeSequence) params.beforeSequence = beforeSequence;
        const response = await apiClient.get(`/support/conversations/${conversationId}/messages`, { params });
        return response.data;
    },

    // Send a message (retry-safe with clientMessageId)
    sendMessage: async (conversationId, { text, clientMessageId, attachmentIds = [] }) => {
        const response = await apiClient.post(`/support/conversations/${conversationId}/messages`, {
            text,
            clientMessageId,
            attachmentIds,
        });
        return response.data;
    },

    // Mark conversation read
    markAsRead: async (conversationId, sequenceNumber) => {
        const response = await apiClient.post(`/support/conversations/${conversationId}/read`, { sequenceNumber });
        return response.data;
    },

    // Update conversation status (open, resolved, reopened)
    updateStatus: async (conversationId, status) => {
        const response = await apiClient.patch(`/support/conversations/${conversationId}/status`, { status });
        return response.data;
    },

    // Reseller requests Super Admin escalation
    requestEscalation: async (conversationId, reason) => {
        const response = await apiClient.post(`/support/conversations/${conversationId}/escalate`, { reason });
        return response.data;
    },

    // Upload attachment (images max 5MB, video/audio max 10MB/30s)
    uploadAttachment: async (conversationId, file, clientDuration = null) => {
        const formData = new FormData();
        formData.append("file", file);
        if (clientDuration) formData.append("clientDuration", clientDuration);

        const response = await apiClient.post(`/support/conversations/${conversationId}/attachments`, formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });
        return response.data;
    },

    // Super Admin Inbox
    getAdminInbox: async (params = {}) => {
        const response = await apiClient.get("/support/admin/inbox", { params });
        return response.data;
    },
};

export default supportApi;

