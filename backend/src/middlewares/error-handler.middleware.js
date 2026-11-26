import multer from "multer";

export const DEFAULT_JSON_LIMIT = "2mb";
export const BULK_JSON_LIMIT = "25mb";

const SIZE_ERROR_CODES = new Set(["LIMIT_FILE_SIZE", "LIMIT_TOTAL_UPLOAD_SIZE", "LIMIT_FIELD_VALUE"]);

/**
 * Returns a consistent JSON 404 response for unmatched API routes.
 */
export function apiNotFoundHandler(_req, res) {
    return res.status(404).json({
        success: false,
        message: "API route not found.",
    });
}

/**
 * Global Express error-handling middleware that formats parser, upload,
 * explicit HTTP, and unexpected errors as JSON instead of HTML.
 */
export function errorHandler(err, _req, res, next) {
    if (res.headersSent) return next(err);

    if (err?.type === "entity.too.large" || err?.status === 413 || err?.statusCode === 413) {
        return res.status(413).json({
            success: false,
            message: "Request payload is too large.",
            code: "PAYLOAD_TOO_LARGE",
        });
    }

    if (err instanceof SyntaxError && (err?.status === 400 || err?.type === "entity.parse.failed")) {
        return res.status(400).json({
            success: false,
            message: "Invalid JSON request body.",
            code: "INVALID_JSON",
        });
    }

    if (err instanceof multer.MulterError) {
        const status = SIZE_ERROR_CODES.has(err.code) ? 413 : 400;
        return res.status(status).json({
            success: false,
            message: err.message || "File upload failed.",
            code: err.code,
        });
    }

    const explicitStatus = Number.isInteger(err?.statusCode)
        ? err.statusCode
        : Number.isInteger(err?.status)
            ? err.status
            : null;

    if (explicitStatus && explicitStatus >= 400 && explicitStatus < 600) {
        if (explicitStatus >= 500) {
            console.error("API error:", err);
        }
        return res.status(explicitStatus).json({
            success: false,
            message: explicitStatus >= 500 ? "Internal server error." : (err.message || "Request failed."),
            ...(err.code ? { code: err.code } : {}),
        });
    }

    console.error("Unhandled API error:", err);
    return res.status(500).json({
        success: false,
        message: "Internal server error.",
    });
}
