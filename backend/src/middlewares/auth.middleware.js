import { authenticateBrowserSession, requestSessionCredentials } from "../helpers/browser-session.js";
import userModel from "../models/user.model.js";
import { auditAuthenticatedRequest, auditContext } from "../services/audit.service.js";
import { randomUUID } from "node:crypto";
import { accountRestriction, allowsRestrictedRequest } from "../../../shared/accountAccess.js";

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
        const { token, decoded, session, parentSession } = await authenticateBrowserSession(requestSessionCredentials(req));

        const user = await userModel.findById(session.userId).select("-password");
        if (!user) {
            return res.status(401).json({
                message: "User account no longer exists.",
                success: false,
            });
        }

        const accountExpired = user.status === "expired" || Boolean(
            user.expiresAt && new Date(user.expiresAt) <= new Date()
        );
        const restriction = decoded.isPreview ? null : accountRestriction(user);
        if (restriction && !allowsRestrictedRequest(req)) {
            return res.status(403).json({
                message: `Your account is ${restriction}. Your dashboard is read-only. Contact your administrator to restore access.`,
                success: false,
                isAccountReadOnly: true,
                isAccountBlocked: restriction === "blocked",
                isAccountExpired: restriction === "expired",
                status: user.status,
                accessReason: user.accessReason || "",
                expiresAt: user.expiresAt,
            });
        }

        req.user = user;
        req.session = session;
        req.parentSession = parentSession;
        req.token = token;
        req.accountExpired = accountExpired;
        req.accountReadOnly = Boolean(restriction);
        req.isPreview = !!decoded.isPreview;
        req.isImpersonation = !!decoded.isImpersonation;
        req.originalAdmin = decoded.originalAdmin || null;

        req.auditRequestId ||= randomUUID();
        return auditContext.run({ req }, () => auditAuthenticatedRequest(req, res, next));
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : "Authentication error",
            success: false,
            code: error.code,
            isLoggedOut: error.statusCode === 401,
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
