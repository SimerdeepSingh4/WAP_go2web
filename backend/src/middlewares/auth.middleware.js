import jwt from "jsonwebtoken";
import crypto from "crypto";
import config from "../config/config.js";
import sessionModel from "../models/session.model.js";
import userModel from "../models/user.model.js";

/**
 * Role hierarchy levels:
 * Super Admin (Level 3) -> can access Super Admin, Reseller, and User resources.
 * Reseller (Level 2)    -> can access Reseller and User resources.
 * User (Level 1)        -> can access User resources only.
 */
export const ROLE_HIERARCHY = {
    "Super Admin": 3,
    "Reseller": 2,
    "User": 1,
};

export function hasRolePermission(userRole, allowedRoles) {
    if (!userRole) return false;
    if (allowedRoles.includes(userRole)) return true;
    // Super Admin has universal access
    if (userRole === "Super Admin") return true;
    // Reseller inherits access to User resources
    if (userRole === "Reseller" && allowedRoles.includes("User")) return true;
    return false;
}

/**
 * Middleware to protect routes and verify the session token.
 * If the session was evicted because the user logged in on a 4th device,
 * this middleware will reject the request (auto logout for the evicted device).
 */
export async function protect(req, res, next) {
    try {
        let token;
        if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (!token) {
            return res.status(401).json({
                message: "Authentication required. No session token provided.",
                success: false,
            });
        }

        // Verify JWT format and signature
        let decoded;
        try {
            decoded = jwt.verify(token, config.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({
                message: "Invalid or expired session token.",
                success: false,
            });
        }

        // Hash token to verify session existence in DB
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        const session = await sessionModel.findOne({
            tokenHash,
            expiresAt: { $gt: new Date() },
        });

        if (!session) {
            return res.status(401).json({
                message: "Session is invalid or logged out (e.g. limit of 3 devices exceeded). Please log in again.",
                success: false,
                isLoggedOut: true,
            });
        }

        const user = await userModel.findById(session.userId).select("-password");
        if (!user) {
            return res.status(401).json({
                message: "User account no longer exists.",
                success: false,
            });
        }

        if (user.status === "blocked") {
            return res.status(403).json({
                message: "User account is blocked.",
                success: false,
                isAccountBlocked: true,
            });
        }

        const accountExpired = user.status === "expired" || Boolean(
            user.expiresAt && new Date(user.expiresAt) <= new Date()
        );
        const isAuthRefresh = req.method === "GET" &&
            req.baseUrl === "/api/auth" && req.path === "/me";
        const isPreviewExit = req.method === "POST" && decoded.isPreview &&
            req.baseUrl === "/api/users" && req.path === "/exit-preview";

        if (accountExpired && !decoded.isPreview && !isAuthRefresh && !isPreviewExit) {
            return res.status(403).json({
                message: "Your account has expired. Contact your account manager.",
                success: false,
                isAccountExpired: true,
                expiresAt: user.expiresAt,
            });
        }

        req.user = user;
        req.session = session;
        req.token = token;
        req.accountExpired = accountExpired;
        req.isPreview = !!decoded.isPreview;
        req.originalAdmin = decoded.originalAdmin || null;

        next();
    } catch (error) {
        return res.status(500).json({
            message: "Authentication error",
            success: false,
        });
    }
}

/**
 * Role-Based Access Control (RBAC) middleware with inheritance.
 */
export function authorizeRoles(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                message: "Authentication required before verifying role permissions.",
                success: false,
            });
        }

        if (!hasRolePermission(req.user.role, allowedRoles)) {
            return res.status(403).json({
                message: `Forbidden: You do not have permission to access this resource. Allowed: [${allowedRoles.join(", ")}]. Your role: ${req.user.role}.`,
                success: false,
            });
        }

        next();
    };
}

/**
 * Blocks sensitive or destructive actions when an account is being accessed in Preview Mode.
 * Examples: changing account password, deleting user, sensitive credential edits.
 */
export function blockInPreviewMode(actionName = "This action") {
    return (req, res, next) => {
        if (req.isPreview) {
            return res.status(403).json({
                message: `Forbidden: ${actionName} is blocked in Preview Mode. You can view data and perform approved management tasks only.`,
                success: false,
                isPreviewBlocked: true,
            });
        }
        next();
    };
}
