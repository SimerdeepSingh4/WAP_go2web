import apiClient from "../../../api/client.js";
import { leaveAccountContext } from "@/api/sessionToken";

export async function fetchUsers(resellerId) {
    const url = resellerId ? `/users?resellerId=${resellerId}` : "/users";
    const response = await apiClient.get(url);
    return response.data;
}

export async function fetchUserById(id) {
    const response = await apiClient.get(`/users/${id}`);
    return response.data;
}

export async function createClientUser(userData) {
    const response = await apiClient.post("/users", userData);
    return response.data;
}

export async function accessUserAccount(userId) {
    const response = await apiClient.post(`/users/${userId}/access`);
    return response.data;
}

export async function startFullAccessImpersonation(userId) {
    const response = await apiClient.post(`/users/${userId}/impersonate`);
    return response.data;
}

export async function exitPreview() {
    const response = await apiClient.post("/users/exit-preview");
    leaveAccountContext();
    return response.data;
}

export async function exitFullAccessImpersonation(token) {
    const config = token ? { headers: { Authorization: `Bearer ${token}` }, accountContextOverride: "impersonation" } : undefined;
    const response = await apiClient.post("/users/exit-impersonation", {}, config);
    if (!token) leaveAccountContext();
    return response.data;
}
