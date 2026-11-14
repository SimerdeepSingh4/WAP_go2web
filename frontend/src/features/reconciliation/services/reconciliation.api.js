import api from "@/api/client";
const get = async (path, params, signal) => (await api.get(`/credit-reconciliation${path}`, { params, signal, timeout: 60000 })).data;
const savedResult = async (id, planId) => (await api.get(`/credit-reconciliation/accounts/${id}/plans/${planId}/result`, { timeout: 10000 })).data;
export const reconciliationApi = {
  summary: signal => get("/summary", undefined, signal),
  cases: (params, signal) => get("/cases", params, signal),
  recoveryAccounts: (q, signal) => get("/accounts/search", { q }, signal),
  evidence: (id, params, signal) => get(`/accounts/${id}/evidence`, params, signal),
  history: (id, page, signal) => get(`/accounts/${id}/history`, { page }, signal),
  walletAudit: (id, page, signal) => get(`/accounts/${id}/wallet-audit`, { page }, signal),
  scan: async () => (await api.post("/credit-reconciliation/scan", {}, { timeout: 60000 })).data,
  check: async id => (await api.post(`/credit-reconciliation/accounts/${id}/check`, {}, { timeout: 60000 })).data,
  preview: async (id, body) => (await api.post(`/credit-reconciliation/accounts/${id}/preview`, body, { timeout: 60000 })).data,
  result: savedResult,
  confirm: async (id, planId) => {
    try { return (await api.post(`/credit-reconciliation/accounts/${id}/plans/${planId}/confirm`, {}, { timeout: 60000 })).data; }
    catch (error) {
      if (!error.response && ["ECONNABORTED", "ETIMEDOUT", "ERR_NETWORK", "ECONNRESET"].includes(error.code) || error.response?.status >= 500) {
        try { const receipt = await savedResult(id, planId); if (receipt.state === "completed") return receipt; }
        catch { /* Preserve this review for an explicit receipt check or safe retry. */ }
        throw Object.assign(new Error("The saved result could not be confirmed. Check the saved result or retry this same review; it cannot apply the correction twice."), { code: "CREDIT_RESULT_UNCONFIRMED" });
      }
      throw error;
    }
  },
  ownResult: async signal => (await api.get("/credits/balance-result", { signal })).data,
};
