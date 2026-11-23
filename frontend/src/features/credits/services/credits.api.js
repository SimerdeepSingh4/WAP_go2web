import api from "@/api/client";

const get = async (path, params, signal) => (await api.get(path, { params, signal })).data;

export const creditsApi = {
  // Rates
  getRates: (params, signal) => get("/credits/rates", params, signal),
  setRate: async (body) => (await api.post("/credits/rates", body)).data,

  // Payment Instructions
  getPaymentInstructions: (_, signal) => get("/credits/payment-instructions", undefined, signal),
  updatePaymentInstructions: async (body) => (await api.put("/credits/payment-instructions", body)).data,
  getSellerPaymentInstructions: (params, signal) => get("/credits/payment-instructions/seller", params, signal),

  // Purchases & Quotes
  createQuote: async (body) => (await api.post("/credits/purchases/quote", body)).data,
  submitProof: async ({ purchaseId, formData }) => {
    return (await api.post(`/credits/purchases/${purchaseId}/proof`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    })).data;
  },
  listPurchases: (params, signal) => get("/credits/purchases", params, signal),
  getPurchaseById: ({ id }, signal) => get(`/credits/purchases/${id}`, undefined, signal),
  approvePurchase: async ({ id, confirmManualReview }) => (await api.post('/credits/purchases/' + id + '/approve', { confirmManualReview })).data,
  flagPurchase: async ({ id, reason }) => (await api.post(`/credits/purchases/${id}/flag`, { reason })).data,
  fixPurchaseProof: async ({ id, formData }) => (await api.patch(`/credits/purchases/${id}/fix`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  })).data,
  rejectPurchase: async ({ id, reason }) => (await api.post(`/credits/purchases/${id}/reject`, { reason })).data,

  // Direct proof stream url
  getProof: async (id, signal) => (await api.get("/credits/purchases/" + id + "/proof", { responseType: "blob", signal })).data,
};
