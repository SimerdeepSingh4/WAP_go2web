import { normalizeAccountPhone, normalizeAccountCompany } from "../helpers/account-phone.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import config from "../config/config.js";
import userModel from "../models/user.model.js";
import sessionModel from "../models/session.model.js";
import walletModel from "../models/wallet.model.js";
import { notifySession, notifyUser, notifyRole } from "../services/socket.service.js";

const MAX_CONCURRENT_DEVICES = 3;

function isAccountExpired(user) {
    return user.status === "expired" || Boolean(user.expiresAt && new Date(user.expiresAt) <= new Date());
}

export async function resolveUserWhiteLabel(user) {
    if (!user) return null;
    const now = new Date();
    if (user.role === "Reseller") {
        const isWlActive = Boolean(user.whiteLabel?.enabled && (!user.whiteLabel?.expiresAt || new Date(user.whiteLabel.expiresAt) > now));
        const isWlExpired = Boolean(user.whiteLabel?.enabled && user.whiteLabel?.expiresAt && new Date(user.whiteLabel.expiresAt) <= now);
        return {
            ...user.whiteLabel?.toObject?.() || user.whiteLabel || {},
            isActive: isWlActive,
            isExpired: isWlExpired,
        };
    }
    if (user.role === "User" && user.resellerId) {
        const reseller = await userModel.findById(user.resellerId).select("username companyName whiteLabel");
        if (reseller?.whiteLabel?.enabled) {
            const isWlActive = !reseller.whiteLabel.expiresAt || new Date(reseller.whiteLabel.expiresAt) > now;
            if (isWlActive) {
                return {
                    ...reseller.whiteLabel.toObject?.() || reseller.whiteLabel,
                    brandName: reseller.whiteLabel.brandName || reseller.companyName || reseller.username,
                    isActive: true,
                    isExpired: false,
                };
            }
        }
    }
    return null;
}

/**
 * Creates a new session for a user and enforces the max concurrent device limit.
 * If 3 devices are already logged in, the oldest device session is removed (logged out).
 */
async function createDeviceSession(user, req, res) {
    // 1. Remove any already expired sessions for cleanliness
    await sessionModel.deleteMany({
        userId: user._id,
        expiresAt: { $lte: new Date() },
    });

    // 2. Fetch existing active sessions sorted by creation time (oldest first)
    const activeSessions = await sessionModel
        .find({
            userId: user._id,
            expiresAt: { $gt: new Date() },
        })
        .sort({ createdAt: 1 });

    // 3. If user has reached the maximum allowed devices (3), remove the oldest session(s)
    if (activeSessions.length >= MAX_CONCURRENT_DEVICES) {
        const excessCount = activeSessions.length - MAX_CONCURRENT_DEVICES + 1;
        const sessionsToEvict = activeSessions.slice(0, excessCount);
        const sessionIdsToEvict = sessionsToEvict.map((s) => s._id);

        await sessionModel.deleteMany({ _id: { $in: sessionIdsToEvict } });

        // Instantly notify evicted devices to log them out
        for (const s of sessionsToEvict) {
            notifySession(s._id.toString(), "SESSION_EXPIRED", {
                reason: `Logged out: Device limit of ${MAX_CONCURRENT_DEVICES} reached by a new login.`,
                forceLogout: true,
            });
        }
    }

    // 4. Generate new unique session token
    const token = jwt.sign(
        {
            userId: user._id.toString(),
            nonce: crypto.randomBytes(16).toString("hex"),
        },
        config.JWT_SECRET,
        { expiresIn: "1d" }
    );

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 1 day

    const clientIp = req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null;
    const clientUserAgent = req.headers["user-agent"] || "unknown";

    const session = await sessionModel.create({
        userId: user._id,
        tokenHash,
        ip: clientIp,
        userAgent: clientUserAgent,
        expiresAt,
    });

    // 5. Set session cookie
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 24 * 60 * 60 * 1000,
    });

    // 6. Realtime notification: inform active sessions query that devices changed
    notifyUser(user._id.toString(), "SESSIONS_CHANGED", {
        action: "login",
        sessionId: session._id.toString(),
    });
    notifyRole("Super Admin", "SESSIONS_CHANGED", {
        action: "login",
        userId: user._id.toString(),
        sessionId: session._id.toString(),
    });

    return { token, session };
}

export async function register(req, res) {
    try {
        const { username, email, password, role } = req.body;
        let phone, companyName;
        try { phone = normalizeAccountPhone(req.body.phone); companyName = normalizeAccountCompany(req.body.companyName); }
        catch (error) { return res.status(400).json({ success: false, message: error.message }); }

        if (!username || !email || !password) {
            return res.status(400).json({
                message: "Username, email, and password are required",
                success: false,
            });
        }

        const existingUser = await userModel.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                message: "Email already exists",
                success: false,
            });
        }

        let assignedReseller = null;
        let assignedRole = "User";

        if (req.user?.role === "Reseller") {
            assignedReseller = req.user._id;
            assignedRole = "User";
        } else if (req.user?.role === "Super Admin") {
            assignedReseller = req.body.resellerId || null;
            assignedRole = role || "User";
        }

        let customRate = 12; // default ratePerMsg
        if (req.body.ratePerMsg !== undefined && req.body.ratePerMsg !== null && req.body.ratePerMsg !== "") {
            const parsed = Number(req.body.ratePerMsg);
            if (!isNaN(parsed) && parsed >= 0) {
                customRate = parsed;
            }
        }

        let customMaxVideoSizeMB = 9;
        if (req.user?.role === "Super Admin" && req.body.maxVideoSizeMB !== undefined && req.body.maxVideoSizeMB !== null && req.body.maxVideoSizeMB !== "") {
            const parsedVideoSize = Number(req.body.maxVideoSizeMB);
            if (!isNaN(parsedVideoSize) && parsedVideoSize >= 1) {
                customMaxVideoSizeMB = parsedVideoSize;
            }
        }

        let accountExpiry = null;
        if (req.body.expiresAt) {
            const parsedExpiry = new Date(req.body.expiresAt);
            if (!Number.isNaN(parsedExpiry.getTime())) {
                if (/^\d{4}-\d{2}-\d{2}$/.test(String(req.body.expiresAt))) {
                    parsedExpiry.setUTCHours(23, 59, 59, 999);
                }
                accountExpiry = parsedExpiry;
            }
        }

        const user = await userModel.create({
            username,
            email,
            phone,
            companyName,
            password,
            role: assignedRole,
            resellerId: assignedReseller,
            ratePerMsg: customRate,
            maxVideoSizeMB: customMaxVideoSizeMB,
            expiresAt: accountExpiry,
            createdBy: req.user?._id || null,
        });

        // Initialize user wallet
        try {
            await walletModel.create({
                userId: user._id,
                balance: 0,
                resellerId: assignedReseller,
            });
        } catch (walletErr) {
            console.error("Auto-wallet creation error on register:", walletErr);
        }

        return res.status(201).json({
            message: "User registered successfully",
            success: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                phone: user.phone || "",
                dp_img: user.dp_img || "",
                role: user.role,
                resellerId: user.resellerId,
                ratePerMsg: user.ratePerMsg,
                maxVideoSizeMB: user.maxVideoSizeMB ?? 9,
                featureAccess: user.featureAccess,
            },
        });
    } catch (error) {
        console.error("Register error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}

export async function login(req, res) {
    try {
        const { email, username, password } = req.body;
        const identifier = (email || username || "").trim();

        if (!identifier || !password) {
            return res.status(400).json({
                message: "Email/username and password are required",
                success: false,
            });
        }

        const user = await userModel.findOne({
            $or: [{ email: identifier }, { username: identifier }]
        }).select("+password");
        if (!user) {
            return res.status(400).json({
                message: "Invalid credentials",
                success: false,
            });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(400).json({
                message: "Invalid credentials",
                success: false,
            });
        }

        const { token } = await createDeviceSession(user, req, res);
        const whiteLabel = await resolveUserWhiteLabel(user);

        return res.status(200).json({
            message: "Login successful",
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                phone: user.phone || "",
                role: user.role,
                expiresAt: user.expiresAt || null,
                status: user.status,
                isBlocked: user.status === "blocked",
                accessReason: user.accessReason || "",
                isExpired: isAccountExpired(user),
                maxVideoSizeMB: user.maxVideoSizeMB ?? 9,
                featureAccess: user.featureAccess,
                whiteLabel,
            },
        });
    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}

export async function logout(req, res) {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
            token = req.headers.authorization.split(" ")[1];
        } else if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }

        if (token) {
            const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
            const session = await sessionModel.findOne({ tokenHash });
            if (session) {
                await sessionModel.deleteOne({ _id: session._id });
                notifySession(session._id.toString(), "SESSION_EXPIRED", { reason: "You have signed out." });
                notifyUser(session.userId.toString(), "SESSIONS_CHANGED", { action: "logout", sessionId: session._id.toString() });
                notifyRole("Super Admin", "SESSIONS_CHANGED", { action: "logout", sessionId: session._id.toString() });
            }
        }

        res.clearCookie("token");

        return res.status(200).json({
            message: "Logged out successfully",
            success: true,
        });
    } catch (error) {
        console.error("Logout error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}

export async function logoutAll(req, res) {
    try {
        const sessions = await sessionModel.find({ userId: req.user._id });
        const sessionIds = sessions.map((s) => s._id.toString());

        await sessionModel.deleteMany({ userId: req.user._id });
        res.clearCookie("token");

        // Realtime: notify each evicted device session
        for (const sId of sessionIds) {
            notifySession(sId, "SESSION_EXPIRED", {
                reason: "All devices have been logged out.",
                forceLogout: true,
            });
        }

        notifyUser(req.user._id.toString(), "SESSIONS_CHANGED", { action: "logout_all" });
        notifyRole("Super Admin", "SESSIONS_CHANGED", { action: "logout_all" });

        return res.status(200).json({
            message: "Logged out from all devices successfully",
            success: true,
        });
    } catch (error) {
        console.error("Logout all error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}

// Logout a single session (device) by its session ID without affecting other sessions
export async function logoutSession(req, res) {
    try {
        const { sessionId } = req.params; // session ID to logout
        if (!sessionId) {
            return res.status(400).json({
                message: "Session ID is required",
                success: false,
            });
        }
        // Super Admin can disconnect any session; other users can disconnect only their own
        const query = req.user.role === "Super Admin" ? { _id: sessionId } : { _id: sessionId, userId: req.user._id };
        const session = await sessionModel.findOne(query);
        if (!session) {
            return res.status(404).json({
                message: "Session not found or does not belong to the user",
                success: false,
            });
        }

        await sessionModel.deleteOne({ _id: sessionId });

        // Instantly notify the disconnected device via its dedicated socket room
        notifySession(sessionId.toString(), "SESSION_EXPIRED", {
            reason: "This device was disconnected from another browser or administrator.",
            forceLogout: true,
        });

        // Notify user & Super Admin that active sessions changed
        notifyUser(session.userId.toString(), "SESSIONS_CHANGED", {
            action: "logout",
            sessionId,
        });
        notifyRole("Super Admin", "SESSIONS_CHANGED", {
            action: "logout",
            sessionId,
        });

        // If the session being deleted is the current one, also clear cookie
        if (req.session && req.session._id && req.session._id.toString() === sessionId) {
            res.clearCookie("token");
        }

        return res.status(200).json({
            message: "Session logged out successfully",
            success: true,
        });
    } catch (error) {
        console.error("Logout session error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}

export async function getMe(req, res) {
    try {
        const whiteLabel = await resolveUserWhiteLabel(req.user);
        return res.status(200).json({
            success: true,
            user: {
                id: req.user._id,
                username: req.user.username,
                email: req.user.email,
                phone: req.user.phone || "",
                dp_img: req.user.dp_img || "",
                role: req.user.role,
                status: req.user.status,
                isBlocked: req.user.status === "blocked",
                accessReason: req.user.accessReason || "",
                expiresAt: req.user.expiresAt || null,
                isExpired: req.accountExpired,
                isPreview: req.isPreview || false,
                isImpersonation: req.isImpersonation || false,
                originalAdmin: req.originalAdmin || null,
                maxVideoSizeMB: req.user.maxVideoSizeMB ?? 9,
                featureAccess: req.user.featureAccess,
                whiteLabel,
            },
            currentSession: {
                id: req.session._id,
                ip: req.session.ip,
                userAgent: req.session.userAgent,
                createdAt: req.session.createdAt,
            },
        });
    } catch (error) {
        console.error("GetMe error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}

export async function getActiveSessions(req, res) {
    try {
        const sessions = await sessionModel
            .find({
                userId: req.user._id,
                expiresAt: { $gt: new Date() },
            })
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            activeCount: sessions.length,
            maxAllowedDevices: MAX_CONCURRENT_DEVICES,
            sessions: sessions.map((s) => ({
                id: s._id,
                ip: s.ip,
                userAgent: s.userAgent,
                createdAt: s.createdAt,
                isCurrentDevice: s._id.toString() === req.session?._id?.toString(),
            })),
        });
    } catch (error) {
        console.error("GetActiveSessions error:", error);
        return res.status(500).json({
            message: "Internal server error",
            success: false,
        });
    }
}

export async function changePassword(req, res) {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                message: "Current password and new password are required.",
                success: false,
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                message: "New password must be at least 6 characters long.",
                success: false,
            });
        }

        const user = await userModel.findById(req.user._id).select("+password");
        if (!user) {
            return res.status(404).json({ message: "User not found.", success: false });
        }

        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({
                message: "Current password is incorrect.",
                success: false,
            });
        }

        // 1. Assign raw new password — userSchema.pre("save") hook will hash it ONCE with bcrypt
        user.password = newPassword;
        await user.save();

        // 2. Security: Revoke all other active sessions to prevent compromised/stolen sessions from staying valid
        const currentSessionId = req.session?._id ? req.session._id.toString() : null;
        const otherSessions = await sessionModel.find({
            userId: user._id,
            ...(currentSessionId ? { _id: { $ne: req.session._id } } : {}),
        });

        if (otherSessions.length > 0) {
            const otherIds = otherSessions.map((s) => s._id);
            await sessionModel.deleteMany({ _id: { $in: otherIds } });

            // Instantly notify evicted devices via their dedicated socket room
            for (const s of otherSessions) {
                notifySession(s._id.toString(), "SESSION_EXPIRED", {
                    reason: "Password was changed. Please log in with your new password.",
                    forceLogout: true,
                });
            }

            notifyUser(user._id.toString(), "SESSIONS_CHANGED", { action: "password_change_revocation" });
            notifyRole("Super Admin", "SESSIONS_CHANGED", {
                action: "password_change_revocation",
                userId: user._id.toString(),
            });
        }

        return res.status(200).json({
            success: true,
            message: "Password changed successfully. All other active sessions have been signed out.",
            revokedSessionsCount: otherSessions.length,
        });
    } catch (error) {
        console.error("Change password error:", error);
        return res.status(500).json({
            message: "Failed to change password.",
            success: false,
        });
    }
}

export default {
    register,
    login,
    logout,
    logoutAll,
    logoutSession,
    getMe,
    getActiveSessions,
    changePassword,
};
