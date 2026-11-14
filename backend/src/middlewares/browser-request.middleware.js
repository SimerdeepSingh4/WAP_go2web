function httpOrigin(value) {
    try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
        return url.origin;
    } catch { return null; }
}

export function isTrustedOrigin(origin) {
    if (!origin) return true;
    const normalized = httpOrigin(origin);
    if (!normalized) return false;
    const configured = [process.env.CLIENT_URL, process.env.RENDER_EXTERNAL_URL]
        .filter(Boolean).flatMap(value => value.split(",")).map(value => httpOrigin(value.trim())).filter(Boolean);
    if (configured.includes(normalized)) return true;
    if (process.env.NODE_ENV !== "production") {
        try { const url = new URL(origin); return ["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname); }
        catch { return false; }
    }
    return false;
}

export function isSameAppOrigin(req, origin = req.headers.origin) {
    const normalized = httpOrigin(origin);
    if (!normalized) return false;
    const url = new URL(normalized);
    // Render terminates HTTPS at its edge and forwards HTTP to Express. Match
    // the actual request Host rather than trusting arbitrary forwarded headers.
    const host = req.headers.host || req.get?.("host");
    const requestOrigin = host ? httpOrigin(`${url.protocol}//${host}`) : null;
    return requestOrigin === normalized && (url.protocol === "https:" || process.env.NODE_ENV !== "production" || req.protocol === "http");
}

export function protectBrowserRequest(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.headers.origin;
    const sameOrigin = isSameAppOrigin(req, origin);
    if ((origin && !sameOrigin && !isTrustedOrigin(origin)) || req.headers["x-app-request"] !== "1") {
        return res.status(403).json({ success: false, message: "This browser request could not be verified. Refresh the page and try again.", code: "BROWSER_REQUEST_REJECTED" });
    }
    return next();
}

export function isTrustedSocketOrigin(req) {
    const origin = req.headers.origin;
    return isTrustedOrigin(origin) || isSameAppOrigin(req, origin);
}
