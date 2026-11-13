import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import config from "../config/config.js";
import sessionModel from "../models/session.model.js";
import userModel from "../models/user.model.js";

export const sessionCookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" });
export const tokenHash = token => crypto.createHash("sha256").update(token).digest("hex");

function rejection(message, statusCode = 401, code = "SESSION_INVALID") {
    return Object.assign(new Error(message), { statusCode, code });
}

export function cookieTokenFromHeaders(headers = {}) {
    const cookie = String(headers.cookie || "").split(";").find(part => part.trim().startsWith("token="));
    try { return cookie ? decodeURIComponent(cookie.trim().slice(6)) : undefined; }
    catch { return undefined; }
}

export function requestSessionCredentials(req) {
    return {
        cookieToken: req.cookies?.token || cookieTokenFromHeaders(req.headers),
        bearerToken: /^Bearer /i.test(req.headers?.authorization || "") ? req.headers.authorization.slice(7) : undefined,
        context: req.headers?.["x-account-context"],
        expectedAccountId: req.headers?.["x-expected-account"],
        expectedSessionId: req.headers?.["x-expected-session"],
    };
}

export async function authenticateBrowserSession({ cookieToken, bearerToken, context, expectedAccountId, expectedSessionId }) {
    const delegated = context === "preview" || context === "impersonation";
    if (context && !delegated) throw rejection("Unknown account context.");
    // Ordinary Bearer tokens never override the browser's shared cookie.
    const token = delegated ? bearerToken : cookieToken;
    if (!token) throw rejection(delegated ? "This account access session has ended." : "Authentication required. Please sign in.");
    let decoded;
    try { decoded = jwt.verify(token, config.JWT_SECRET); }
    catch { throw rejection("Invalid or expired session token."); }
    const isDelegated = Boolean(decoded.isPreview || decoded.isImpersonation);
    if (isDelegated !== delegated || (context === "preview" && !decoded.isPreview) || (context === "impersonation" && !decoded.isImpersonation)) {
        throw rejection("The session does not match this account context. Please sign in again.");
    }
    const session = await sessionModel.findOne({ tokenHash: tokenHash(token), expiresAt: { $gt: new Date() } });
    if (!session || String(session.userId) !== String(decoded.userId || decoded.id)) throw rejection("Session is invalid or logged out. Please sign in again.");
    let parentSession;
    if (delegated) {
        let parentDecoded;
        try { parentDecoded = jwt.verify(cookieToken || "", config.JWT_SECRET); }
        catch { throw rejection("Your manager session has ended. Close this account tab."); }
        if (parentDecoded.isPreview || parentDecoded.isImpersonation || !decoded.parentSessionId || String(session.parentSessionId) !== decoded.parentSessionId) {
            throw rejection("This account access session must be reopened by its manager.");
        }
        parentSession = await sessionModel.findOne({ _id: decoded.parentSessionId, tokenHash: tokenHash(cookieToken), expiresAt: { $gt: new Date() } });
        if (!parentSession || String(parentSession.userId) !== String(decoded.originalAdmin?.id)) throw rejection("The signed-in manager has changed. Reopen account access.");
        const parent = await userModel.findById(parentSession.userId).select("role status expiresAt");
        const allowedRoles = context === "impersonation" ? ["Super Admin"] : ["Super Admin", "Reseller"];
        if (!parent || !allowedRoles.includes(parent.role) || parent.role !== decoded.originalAdmin.role || parent.status !== "active" || (parent.expiresAt && parent.expiresAt <= new Date())) {
            throw rejection("Your manager account can no longer access this session.");
        }
    }
    if ((expectedAccountId && String(session.userId) !== expectedAccountId) || (expectedSessionId && String(session._id) !== expectedSessionId)) {
        throw rejection("Your browser account changed. Refresh this tab before continuing.", 409, "BROWSER_SESSION_CHANGED");
    }
    return { token, decoded, session, parentSession };
}

export async function revokeBrowserSessions(sessionIds) {
    const sessions = await sessionModel.find({ $or: [{ _id: { $in: sessionIds } }, { parentSessionId: { $in: sessionIds } }] });
    if (sessions.length) await sessionModel.deleteMany({ _id: { $in: sessions.map(session => session._id) } });
    return sessions;
}
