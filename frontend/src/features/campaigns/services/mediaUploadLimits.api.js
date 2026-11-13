import api from "@/api/client";
import { normalizeMediaUploadLimits } from "../../../../../shared/mediaUploadLimits.js";

export async function getMediaUploadLimits(signal) {
    return (await api.get("/settings/media-limits", { signal })).data;
}

export async function saveMediaUploadLimits(values, accountId) {
    const payload = { mediaUploadLimits: normalizeMediaUploadLimits(values, { overrides: Boolean(accountId) }) };
    return accountId
        ? (await api.patch(`/users/${accountId}/media-limits`, payload)).data
        : (await api.put("/settings/media-limits", payload)).data;
}
