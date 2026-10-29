import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import config from "../config/config.js";
import userModel from "../models/user.model.js";
import sessionModel from "../models/session.model.js";

const MAX_CONCURRENT_DEVICES = 3;

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

        const user = await userModel.create({
            username,
            email,
            password,
            role: assignedRole,
            resellerId: assignedReseller,
            createdBy: req.user?._id || null,
        });

        return res.status(201).json({
            message: "User registered successfully",
            success: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                resellerId: user.resellerId,
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

        if (user.status === "blocked") {
            return res.status(403).json({
                message: "Account is blocked",
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

        return res.status(200).json({
            message: "Login successful",
            success: true,
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
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
        if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
            token = req.headers.authorization.split(" ")[1];
        }

        if (token) {
            const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
            await sessionModel.deleteOne({ tokenHash });
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
        await sessionModel.deleteMany({ userId: req.user._id });
        res.clearCookie("token");

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
                isPreview: req.isPreview || false,
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

export default {
    register,
    login,
    logout,
    logoutAll,
    getMe,
    getActiveSessions,
};
