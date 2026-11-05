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

        const user = await userModel.create({
            username,
            email,
            password,
            role: assignedRole,
            resellerId: assignedReseller,
            ratePerMsg: customRate,
            createdBy: req.user?._id || null,
        });

        // ------------------------------------------------------------
        // If the newly created account is a Reseller, automatically
        // create a placeholder client user that belongs to this reseller.
        // The client user gets the same password for convenience and a
        // generated email/username to avoid collisions.
        // ------------------------------------------------------------
        if (assignedRole === "Reseller") {
            const clientUsername = `${username}_client`;
            const emailParts = email.split("@");
            const clientEmail = `${emailParts[0]}+client@${emailParts[1]}`;
            try {
                await userModel.create({
                    username: clientUsername,
                    email: clientEmail,
                    password,
                    role: "User",
                    resellerId: user._id,
                    ratePerMsg: customRate,
                    createdBy: req.user?._id || null,
                });
                // Optional: auto‑create wallet for the client user
                await walletModel.create({
                    userId: (await userModel.findOne({ email: clientEmail }))._id,
                    balance: 0,
                    resellerId: user._id,
                });
            } catch (clientErr) {
                console.error("Auto‑client user creation error:", clientErr);
            }
        }

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
                role: user.role,
                resellerId: user.resellerId,
                ratePerMsg: user.ratePerMsg,
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

        if (user.status === "blocked") {
            return res.status(403).json({
                message: "Your account is blocked. Contact your account administrator.",
                success: false,
                isAccountBlocked: true,
            });
        }

        const { token } = await createDeviceSession(user, req, res);

        return res.status(200).json({
            message: "Login successful",
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                expiresAt: user.expiresAt || null,
                isExpired: isAccountExpired(user),
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
        return res.status(200).json({
            success: true,
            user: {
                id: req.user._id,
                username: req.user.username,
                email: req.user.email,
                role: req.user.role,
                status: req.user.status,
                expiresAt: req.user.expiresAt || null,
                isExpired: req.accountExpired,
                isPreview: req.isPreview || false,
                isImpersonation: req.isImpersonation || false,
                originalAdmin: req.originalAdmin || null,
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

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return res.status(200).json({
            success: true,
            message: "Password changed successfully.",
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
