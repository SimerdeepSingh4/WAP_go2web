import api from "@/api/client";

const get = async (path, params, signal) => (await api.get(path, { params, signal })).data;

export const adminQueries = {
  overview: (_, signal) => get("/dashboard/stats", undefined, signal),
  campaigns: (_, signal) => get("/campaigns", undefined, signal),
  campaign: ({ id }, signal) => get(`/campaigns/${id}`, undefined, signal),
  accounts: (_, signal) => get("/users", undefined, signal),
  balance: ({ id }, signal) => get("/credits/balance", { userId: id }, signal),
  transactions: (params, signal) => get("/credits/transactions", params, signal),
  reconcile: ({ id }, signal) => get("/credits/reconcile", id ? { userId: id } : undefined, signal),
  contacts: (params, signal) => get("/contacts", params, signal),
};

export const adminActions = {
  createAccount: async (body) => (await api.post("/auth/register", body)).data,
  updateAccount: async ({ id, ...body }) => (await api.patch(`/users/${id}`, body)).data,
  accountAccess: async ({ id, ...body }) => (await api.patch(`/users/${id}/access`, body)).data,
  changeRole: async ({ id, role }) => (await api.patch(`/users/${id}/role`, { role })).data,
  deleteAccount: async (id) => (await api.delete(`/users/${id}`)).data,
  deleteCampaign: async (id) => (await api.delete(`/campaigns/${id}`)).data,
  allocate: async (body) => (await api.post("/credits/allocate", body)).data,
  reclaim: async (body) => (await api.post("/credits/reclaim", body)).data,
  rate: async (body) => (await api.patch("/credits/rate", body)).data,
  status: async ({ id, status }) => (await api.patch(`/campaigns/${id}/status`, { status })).data,
  report: async ({ id, ...body }) => (await api.patch(`/campaigns/${id}/metrics`, body)).data,
  importContacts: async (formData) => (await api.post("/contacts/import-file", formData, { headers: { "Content-Type": "multipart/form-data" } })).data,
  deleteContact: async (id) => (await api.delete(`/contacts/${id}`)).data,
};
