import api from "@/api/client";

const get = async (path, params, signal) => (await api.get(path, { params, signal })).data;

/**
 * Reseller queries — same endpoints as admin but the backend
 * already scopes data by the logged-in reseller's `resellerId`.
 */
export const resellerQueries = {
  overview: (_, signal) => get("/dashboard/stats", undefined, signal),
  campaigns: (_, signal) => get("/campaigns", undefined, signal),
  campaign: ({ id }, signal) => get(`/campaigns/${id}`, undefined, signal),
  // GET /api/users → backend filters by resellerId for Reseller role
  accounts: (_, signal) => get("/users", undefined, signal),
  balance: ({ id }, signal) => get("/credits/balance", id ? { userId: id } : undefined, signal),
  myBalance: (_, signal) => get("/credits/balance", undefined, signal),
  transactions: (params, signal) => get("/credits/transactions", params, signal),
};

export const resellerActions = {
  requestCredits: async (body) => (await api.post("/credits/request", body)).data,
  createAccount: async (body) => (await api.post("/users", body)).data,
  updateAccount: async ({ id, ...body }) => (await api.patch(`/users/${id}/profile`, body)).data,
  accountAccess: async ({ id, ...body }) => (await api.patch(`/users/${id}/access`, body)).data,
  deleteAccount: async (id) => (await api.delete(`/users/${id}`)).data,
  deleteCampaign: async (id) => (await api.delete(`/campaigns/${id}`)).data,
  allocate: async (body) => (await api.post("/credits/allocate", body)).data,
  reclaim: async (body) => (await api.post("/credits/reclaim", body)).data,
  rate: async (body) => (await api.patch("/credits/rate", body)).data,
  status: async ({ id, status }) => (await api.patch(`/campaigns/${id}/status`, { status })).data,
};
