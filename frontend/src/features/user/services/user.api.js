// src/features/user/services/user.api.js
import api from "@/api/client";

const get = async (path, params, signal) => (await api.get(path, { params, signal })).data;

/**
 * User‑facing API queries.
 */
export const userQueries = {
  overview: (_, signal) => get("/dashboard/stats", undefined, signal),
  campaigns: (_, signal) => get("/campaigns", { ownedByUser: true }, signal),
  campaign: ({ id }, signal) => get(`/campaigns/${id}`, undefined, signal),
  accounts: (_, signal) => get("/users/me", undefined, signal),
  myBalance: (_, signal) => get("/credits/balance", undefined, signal),
  transactions: (params, signal) => get("/credits/transactions", params, signal),
  activity: (params, signal) => get("/credits/transactions", params, signal),
};

/**
 * Mutations that a regular user can perform.
 */
export const userActions = {
  updateProfile: async (body) => (await api.patch("/users/me", body)).data,
  requestCredits: async (body) => (await api.post("/credits/request", body)).data,
  // New: add credits for user (alias to requestCredits)
  addCredits: async (body) => (await api.post("/credits/request", body)).data,
  campaignStatus: async ({ id, status }) => (await api.patch(`/campaigns/${id}/status`, { status })).data,
  // New: create a campaign owned by the logged‑in user
  createCampaign: async (body) => (await api.post("/campaigns", body)).data,
  deleteCampaign: async (id) => (await api.delete(`/campaigns/${id}`)).data,
  // New: deduct credits from user wallet
  deductCredits: async (body) => (await api.post("/credits/deduct", body)).data,
};
