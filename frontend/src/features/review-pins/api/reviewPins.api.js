import apiClient from "@/api/client";

export const reviewPinsApi = {
  list: (page, signal) =>
    apiClient
      .get("/review-pins", { params: { page }, signal })
      .then((r) => r.data.pins),
  listAll: (signal) =>
    apiClient
      .get("/review-pins/all", { signal })
      .then((r) => r.data.pins),
  create: (body) =>
    apiClient.post("/review-pins", body).then((r) => r.data.pin),
  delete: (id) =>
    apiClient.delete(`/review-pins/${id}`).then((r) => r.data),
  resolve: ({ id, resolvedByName }) =>
    apiClient.patch(`/review-pins/${id}/resolve`, { resolvedByName }).then((r) => r.data.pin),
};
