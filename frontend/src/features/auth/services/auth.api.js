import apiClient from "../../../api/client.js";
import { clearPushOwner } from "@/features/notifications/push";

export async function register(username, email, password) {
    const payload = typeof username === "object"
        ? username
        : { username, email, password };

    const response = await apiClient.post("/auth/register", payload);
    return response.data;
}

export async function login(credentials, password) {
    let payload;
    if (typeof credentials === "string") {
        payload = {
            email: credentials,
            username: credentials,
            password,
        };
    } else {
        const identifier = credentials.email || credentials.username || credentials.identifier;
        payload = {
            email: identifier,
            username: identifier,
            password: credentials.password,
        };
    }

    const response = await apiClient.post("/auth/login", payload);
    return response.data;
}

export async function logout() {
    await clearPushOwner().catch(() => {});
    const response = await apiClient.post("/auth/logout");
    return response.data;
}

export async function getMe() {
    const response = await apiClient.get("/auth/me");
    return response.data;
}

export async function getSessions() {
    const response = await apiClient.get("/auth/sessions");
    return response.data;
}

export async function logoutAll() {
    await clearPushOwner().catch(() => {});
    const response = await apiClient.post("/auth/logout-all");
    return response.data;
}

// Logout a single session by its ID
export async function logoutSession(sessionId) {
    const response = await apiClient.delete(`/auth/logout/${sessionId}`);
    return response.data;
}

export async function changePassword({ currentPassword, newPassword }) {
    const response = await apiClient.post("/auth/change-password", { currentPassword, newPassword });
    return response.data;
}

export async function uploadProfileImage(file) {
    const body = new FormData();
    body.append("dp_img", file);
    const response = await apiClient.post("/users/me/dp-image", body);
    return response.data;
}

