import api from "@/api/client";

export const numberFilteringApi = {
  list: async (params, signal) => (await api.get("/number-filtering", { params, signal })).data,
  detail: async (id, signal) => (await api.get(`/number-filtering/${id}`, { signal })).data,
  submit: async (numbers) => (await api.post("/number-filtering", { numbers })).data,
  save: async ({ id, ...body }) => (await api.put(`/number-filtering/${id}/results`, body)).data,
};
