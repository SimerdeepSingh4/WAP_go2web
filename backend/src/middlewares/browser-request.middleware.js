export function isTrustedOrigin(origin) {
    if (!origin) return true;
    const configured = (process.env.CLIENT_URL || "").split(",").map(value => value.trim()).filter(Boolean);
    if (configured.includes(origin)) return true;
    if (process.env.NODE_ENV !== "production") {
        try { const url = new URL(origin); return ["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname); }
        catch { return false; }
    }
    return false;
}

export function protectBrowserRequest(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.headers.origin;
    const sameOrigin = origin === `${req.protocol}://${req.get("host")}`;
    if ((origin && !sameOrigin && !isTrustedOrigin(origin)) || req.headers["x-app-request"] !== "1") {
        return res.status(403).json({ success: false, message: "This browser request could not be verified. Refresh the page and try again.", code: "BROWSER_REQUEST_REJECTED" });
    }
    return next();
}

export function isTrustedSocketOrigin(req) {
    const origin = req.headers.origin;
    if (isTrustedOrigin(origin)) return true;
    try { const url = new URL(origin); return url.protocol === "https:" && url.host === req.headers.host; }
    catch { return false; }
}
