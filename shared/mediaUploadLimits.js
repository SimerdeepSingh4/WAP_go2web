export const DEFAULT_MEDIA_UPLOAD_LIMITS = Object.freeze({ imageMB: 3, videoMB: 3, pdfMB: 3 });
export const MEDIA_UPLOAD_LABELS = Object.freeze({ imageMB: "Image", videoMB: "Video", pdfMB: "PDF" });
export const MAX_MEDIA_UPLOAD_MB = 100;

export function normalizeMediaUploadLimits(value, { overrides = false } = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(DEFAULT_MEDIA_UPLOAD_LIMITS, key))) {
        throw new Error("Provide image, video and PDF upload limits.");
    }
    return Object.fromEntries(Object.keys(DEFAULT_MEDIA_UPLOAD_LIMITS).map(key => {
        const raw = value[key];
        if (overrides && (raw === null || raw === undefined || raw === "")) return [key, null];
        const limit = typeof raw === "number" || typeof raw === "string" ? Number(raw) : NaN;
        if (raw === "" || !Number.isFinite(limit) || limit < 1 || limit > MAX_MEDIA_UPLOAD_MB || Math.abs(limit * 100 - Math.round(limit * 100)) > 1e-8) {
            throw new Error(`${MEDIA_UPLOAD_LABELS[key]} limit must be between 1 and ${MAX_MEDIA_UPLOAD_MB} MB, with at most two decimal places.`);
        }
        return [key, limit];
    }));
}

export function resolveMediaUploadLimits(overrides, defaults = DEFAULT_MEDIA_UPLOAD_LIMITS) {
    return Object.fromEntries(Object.keys(DEFAULT_MEDIA_UPLOAD_LIMITS).map(key => [key,
        overrides?.[key] ?? defaults?.[key] ?? DEFAULT_MEDIA_UPLOAD_LIMITS[key],
    ]));
}

export function campaignMediaLimitBytes(field, limits) {
    const key = { images: "imageMB", image: "imageMB", video: "videoMB", documents: "pdfMB", document: "pdfMB", pdf: "pdfMB" }[field];
    return key ? limits[key] * 1024 * 1024 : null;
}
