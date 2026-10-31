import api from "@/api/client";

const get = async (path, params, signal) => (await api.get(path, { params, signal })).data;

export const adminQueries = {
  overview: (_, signal) => get("/dashboard/stats", undefined, signal),
  campaigns: (_, signal) => get("/campaigns", undefined, signal),
  campaign: ({ id }, signal) => get(`/campaigns/${id}`, undefined, signal),
  accounts: (_, signal) => get("/users", undefined, signal),
  balance: ({ id }, signal) => get("/credits/balance", { userId: id }, signal),
  transactions: (params, signal) => get("/credits/transactions", params, signal),
};

export const adminActions = {
  createAccount: async (body) => (await api.post("/auth/register", body)).data,
  allocate: async (body) => (await api.post("/credits/allocate", body)).data,
  rate: async (body) => (await api.patch("/credits/rate", body)).data,
  status: async ({ id, status }) => (await api.patch(`/campaigns/${id}/status`, { status })).data,
  report: async ({ id, ...body }) => (await api.patch(`/campaigns/${id}/metrics`, body)).data,
};
