import apiClient from "@/api/client";

/**
 * Public: Resolve branding by subdomain or host.
 */
export async function resolveBranding({ subdomain, host } = {}) {
    const params = {};
    if (subdomain) params.subdomain = subdomain;
    if (host) params.host = host;
    const response = await apiClient.get("/branding/resolve", { params });
    return response.data?.branding;
}

/**
 * Reseller: Get current branding configuration and status.
 */
export async function getResellerBranding() {
    const response = await apiClient.get("/branding/reseller");
    return response.data?.branding;
}

/**
 * Reseller: Update branding settings (subdomain, brandName, colors).
 */
export async function updateResellerBranding(data) {
    const response = await apiClient.patch("/branding/reseller", data);
    return response.data;
}

/**
 * Reseller: Upload custom logo.
 */
export async function uploadResellerLogo(file) {
    const formData = new FormData();
    formData.append("image", file);
    const response = await apiClient.post("/branding/reseller/logo", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
}

/**
 * Reseller: Remove custom logo and revert to default.
 */
export async function removeResellerLogo() {
    const response = await apiClient.delete("/branding/reseller/logo");
    return response.data;
}

/**
 * Super Admin: Grant, revoke, or update expiry for white-label access on a Reseller.
 */
export async function updateWhiteLabelAccess(resellerId, { enabled, expiresAt }) {
    const response = await apiClient.patch(`/users/${resellerId}/white-label-access`, {
        enabled,
        expiresAt,
    });
    return response.data;
}

