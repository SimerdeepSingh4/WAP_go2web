import api from "@/api/client";

export async function getAccountOptions(params, signal) {
  return (await api.get("/users/picker", { params, signal })).data;
}
