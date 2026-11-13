import api from "../../../api/client";
const get = async (path, params, signal) => (await api.get(`/support${path}`, { params, signal, timeout: 30000 })).data;
export const supportApi = {
  getOrCreateConversation: async subject => (await api.post("/support/conversations", { subject }, { timeout: 30000 })).data,
  listConversations: (params, signal) => get("/conversations", params, signal),
  getAdminInbox: (params, signal) => get("/admin/inbox", params, signal),
  getConversationById: (id, signal) => get(`/conversations/${id}`, undefined, signal),
  deleteConversation: async id => (await api.delete(`/support/conversations/${id}`, { timeout: 30000 })).data,
  getMessages: (id, params = {}, signal) => get(`/conversations/${id}/messages`, { limit: 50, ...params }, signal),
  sendMessage: async (id, message) => (await api.post(`/support/conversations/${id}/messages`, message, { timeout: 30000 })).data,
  markAsRead: async (id, sequenceNumber) => (await api.post(`/support/conversations/${id}/read`, { sequenceNumber }, { timeout: 30000 })).data,
  updateStatus: async (id, status) => (await api.patch(`/support/conversations/${id}/status`, { status }, { timeout: 30000 })).data,
  requestEscalation: async (id, reason) => (await api.post(`/support/conversations/${id}/escalate`, { reason }, { timeout: 30000 })).data,
  uploadAttachment: async (id, file, clientDuration) => {
    const body = new FormData(); body.append("file", file);
    if (clientDuration) body.append("clientDuration", clientDuration);
    return (await api.post(`/support/conversations/${id}/attachments`, body, { headers: { "Content-Type": "multipart/form-data" }, timeout: 60000 })).data;
  },
  getAttachment: async (id, signal) => (await api.get(`/support/attachments/${id}/view`, { responseType: "blob", signal, timeout: 60000 })).data,
};
