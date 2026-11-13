import apiClient from "../../../api/client.js";
import { clearPushOwner } from "@/features/notifications/services/push";
import { getAccountContext, runSessionControl } from "@/api/sessionToken";

export function sessionUser(response) {
    return response.user ? { ...response.user, sessionId: response.currentSession?.id || response.user.sessionId } : null;
}

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

    const response = await runSessionControl(() => apiClient.post("/auth/login", payload, { sessionControl: true }));
    return response.data;
}

export async function logout() {
    if (!getAccountContext()) await clearPushOwner().catch(() => {});
    const response = await runSessionControl(() => apiClient.post("/auth/logout", {}, { sessionControl: true }));
    return response.data;
}

export async function getMe(signal) {
    const response = await apiClient.get("/auth/me", { signal });
    return response.data;
}

export async function getSessions() {
    const response = await apiClient.get("/auth/sessions");
    return response.data;
}

export async function logoutAll() {
    if (!getAccountContext()) await clearPushOwner().catch(() => {});
    const response = await runSessionControl(() => apiClient.post("/auth/logout-all", {}, { sessionControl: true }));
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

export async function uploadProfileImage(file, { signal, onProgress } = {}) {
    const body = new FormData();
    body.append("dp_img", file);
    const response = await apiClient.post("/users/me/dp-image", body, {
        signal,
        onUploadProgress: onProgress ? (event) => {
            if (event.total) onProgress(Math.min(99, Math.round(event.loaded * 100 / event.total)));
        } : undefined,
    });
    return response.data;
}

export async function removeProfileImage() {
    const response = await apiClient.delete("/users/me/dp-image");
    return response.data;
}

