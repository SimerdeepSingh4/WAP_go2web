import crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "../config/config.js";
import userModel from "../models/user.model.js";
import sessionModel from "../models/session.model.js";
import walletModel from "../models/wallet.model.js";

/**
 * Get all users accessible by current user:
 * - Super Admin: gets all users in the system.
 * - Reseller: gets all users assigned to this reseller.
 */
export async function getUsers(req, res) {
    try {
        let filter = {};

        if (req.user.role === "Reseller") {
            filter = { resellerId: req.user._id };
        } else if (req.user.role === "Super Admin") {
            if (req.query.resellerId) {
                filter = { resellerId: req.query.resellerId };
            }
        }

        const users = await userModel
            .find(filter)
            .select("-password")
            .populate("resellerId", "username email")
            .sort({ createdAt: -1 });
        const now = new Date();
        const usersWithExpiry = users.map((user) => ({
            ...user.toObject(),
            isExpired: user.status === "expired" || Boolean(user.expiresAt && user.expiresAt <= now),
        }));

        return res.status(200).json({
            success: true,
            count: usersWithExpiry.length,
            users: usersWithExpiry,
        });
    } catch (error) {
        console.error("GetUsers error:", error);
        return res.status(500).json({
            message: "Failed to fetch users",
            success: false,
        });
    }
}

/**
 * Get single user profile by ID:
 * - Super Admin can access any user.
 * - Reseller can access their own assigned users.
 * - Regular User can only access their own profile.
 */
export async function getUserById(req, res) {
    try {
        const { id } = req.params;
        const targetUser = await userModel.findById(id).select("-password");

        if (!targetUser) {
            return res.status(404).json({
                message: "User not found",
                success: false,
            });
        }

        const isSuperAdmin = req.user.role === "Super Admin";
        const isOwner = req.user._id.toString() === targetUser._id.toString();
        const isAssignedReseller =
            req.user.role === "Reseller" &&
            targetUser.resellerId &&
            targetUser.resellerId.toString() === req.user._id.toString();

        if (!isSuperAdmin && !isOwner && !isAssignedReseller) {
            return res.status(403).json({
                message: "Forbidden: You do not have permission to access this user account.",
                success: false,
            });
        }

        const activeSessions = await sessionModel
            .find({ userId: targetUser._id, expiresAt: { $gt: new Date() } })
            .select("ip userAgent createdAt");

        return res.status(200).json({
            success: true,
            user: targetUser,
            activeSessions,
        });
    } catch (error) {
        console.error("GetUserById error:", error);
        return res.status(500).json({
            message: "Failed to fetch user details",
            success: false,
        });
    }
}

// New controller: Get current logged‑in user ("/api/users/me")
export async function getCurrentUser(req, res) {
    try {
        // req.user is populated by the protect middleware
        const user = await userModel.findById(req.user._id).select("-password");
        if (!user) {
            return res.status(404).json({
                message: "User not found",
                success: false,
            });
        }
        return res.status(200).json({
            success: true,
            user,
        });
    } catch (error) {
        console.error("GetCurrentUser error:", error);
        return res.status(500).json({
            message: "Failed to fetch current user",
            success: false,
        });
    }
}

/**
 * Create a new user under a Reseller.
 */
export async function createUser(req, res) {
    try {
        const { username, email, password, role } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                message: "Username, email, and password are required",
                success: false,
            });
        }

        const existing = await userModel.findOne({ email });
        if (existing) {
            return res.status(400).json({
                message: "Email already in use",
                success: false,
            });
        }

        let assignedReseller = null;
        let assignedRole = "User";

        if (req.user.role === "Reseller") {
            assignedReseller = req.user._id;
            assignedRole = "User";
        } else if (req.user.role === "Super Admin") {
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

        const newUser = await userModel.create({
            username,
            email,
            password,
            role: assignedRole,
            resellerId: assignedReseller,
            ratePerMsg: customRate,
            createdBy: req.user._id,
        });

        // Initialize user wallet
        try {
            await walletModel.create({
                userId: newUser._id,
                balance: 0,
                resellerId: assignedReseller,
            });
        } catch (walletErr) {
            console.error("Auto-wallet creation error on createUser:", walletErr);
        }

        return res.status(201).json({
            message: "User account created successfully",
            success: true,
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email,
                role: newUser.role,
                resellerId: newUser.resellerId,
                ratePerMsg: newUser.ratePerMsg,
            },
        });
    } catch (error) {
        console.error("CreateUser error:", error);
        return res.status(500).json({
            message: "Failed to create user account",
            success: false,
        });
    }
}

export async function updateUserAccess(req, res) {
    try {
        const { id } = req.params;
        const { status, expiresAt } = req.body;
        const targetUser = await userModel.findById(id);

        if (!targetUser) {
            return res.status(404).json({ message: "User not found", success: false });
        }

        const isSuperAdmin = req.user.role === "Super Admin";
        const ownsUser = req.user.role === "Reseller" &&
            targetUser.role === "User" &&
            String(targetUser.resellerId) === String(req.user._id);

        if (!isSuperAdmin && !ownsUser) {
            return res.status(403).json({
                message: "You can only manage your own users.",
                success: false,
            });
        }
        if (targetUser.role === "Super Admin") {
            return res.status(403).json({
                message: "Super Admin accounts cannot be changed here.",
                success: false,
            });
        }

        const updates = {};
        if (status !== undefined) {
            if (!["active", "blocked", "expired"].includes(status)) {
                return res.status(400).json({
                    message: "Status must be active, blocked, or expired.",
                    success: false,
                });
            }
            updates.status = status;
        }

        if (Object.hasOwn(req.body, "expiresAt")) {
            if (expiresAt === null || expiresAt === "") {
                updates.expiresAt = null;
            } else {
                const parsedExpiry = new Date(expiresAt);
                if (Number.isNaN(parsedExpiry.getTime())) {
                    return res.status(400).json({
                        message: "Enter a valid account expiry date.",
                        success: false,
                    });
                }
                if (/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
                    parsedExpiry.setUTCHours(23, 59, 59, 999);
                }
                updates.expiresAt = parsedExpiry;
            }
        }

        if (status === "expired") {
            updates.expiresAt = new Date(Date.now() - 1000);
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({
                message: "Provide a status or expiry date to update.",
                success: false,
            });
        }

        Object.assign(targetUser, updates);
        await targetUser.save();
        if (updates.status === "blocked") {
            await sessionModel.deleteMany({ userId: targetUser._id });
        }

        return res.status(200).json({
            success: true,
            message: "Account access updated successfully.",
            user: {
                id: targetUser._id,
                status: targetUser.status,
                expiresAt: targetUser.expiresAt,
            },
        });
    } catch (error) {
        console.error("UpdateUserAccess error:", error);
        return res.status(500).json({ message: "Failed to update account access", success: false });
    }
}

/**
 * Access user account in PREVIEW MODE:
 * Allows a Super Admin or the assigned Reseller to view the user's account safely
 * without changing sensitive settings or taking destructive actions.
 */
export async function impersonateUser(req, res) {
    try {
        const { id } = req.params;
        const targetUser = await userModel.findById(id);

        if (!targetUser) {
            return res.status(404).json({
                message: "User account not found",
                success: false,
            });
        }

        const isSuperAdmin = req.user.role === "Super Admin";
        const isAssignedReseller =
            req.user.role === "Reseller" &&
            targetUser.resellerId &&
            targetUser.resellerId.toString() === req.user._id.toString();

        if (!isSuperAdmin && !isAssignedReseller) {
            return res.status(403).json({
                message: "Forbidden: You cannot access or preview this user account.",
                success: false,
            });
        }

        const originalAdminToken = req.token;

        // Generate temporary preview session token
        const token = jwt.sign(
            {
                userId: targetUser._id.toString(),
                nonce: crypto.randomBytes(16).toString("hex"),
                isPreview: true,
                originalAdmin: {
                    id: req.user._id.toString(),
                    username: req.user.username,
                    role: req.user.role,
                    token: originalAdminToken,
                },
            },
            config.JWT_SECRET,
            { expiresIn: "4h" }
        );

        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);

        await sessionModel.create({
            userId: targetUser._id,
            tokenHash,
            ip: req.ip || req.headers["x-forwarded-for"] || "preview-session",
            userAgent: `Preview Mode by ${req.user.role} (${req.user.username})`,
            expiresAt,
        });

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 4 * 60 * 60 * 1000,
        });

        return res.status(200).json({
            success: true,
            message: `Entered preview mode for ${targetUser.username}`,
            token,
            isPreview: true,
            user: {
                id: targetUser._id,
                username: targetUser.username,
                email: targetUser.email,
                role: targetUser.role,
                resellerId: targetUser.resellerId,
                isPreview: true,
                originalAdmin: {
                    id: req.user._id.toString(),
                    username: req.user.username,
                    role: req.user.role,
                },
            },
        });
    } catch (error) {
        console.error("ImpersonateUser error:", error);
        return res.status(500).json({
            message: "Failed to access user account",
            success: false,
        });
    }
}

/**
 * Exit Preview Mode:
 * Restores the original Super Admin or Reseller session immediately.
 */
export async function exitPreviewMode(req, res) {
    try {
        if (!req.isPreview || !req.originalAdmin?.token) {
            return res.status(400).json({
                message: "Not currently in preview mode.",
                success: false,
            });
        }

        const originalToken = req.originalAdmin.token;

        // Clean up temporary preview session
        const currentTokenHash = crypto.createHash("sha256").update(req.token).digest("hex");
        await sessionModel.deleteOne({ tokenHash: currentTokenHash });

        res.cookie("token", originalToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 24 * 60 * 60 * 1000,
        });

        const adminUser = await userModel.findById(req.originalAdmin.id).select("-password");

        return res.status(200).json({
            success: true,
            message: "Exited preview mode. Restored your manager account.",
            token: originalToken,
            user: adminUser,
        });
    } catch (error) {
        console.error("ExitPreviewMode error:", error);
        return res.status(500).json({
            message: "Failed to exit preview mode",
            success: false,
        });
    }
}
