import { normalizeAccountPhone, normalizeAccountCompany } from "../helpers/account-phone.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import config from "../config/config.js";
import userModel from "../models/user.model.js";
import sessionModel from "../models/session.model.js";
import walletModel from "../models/wallet.model.js";
import { notifyUser, notifySession } from "../services/socket.service.js";
import sharp from "sharp";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.config.js";
import { syncResellerReassignment } from "../helpers/support-reassignment.helper.js";

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
        const userIds = users.map((u) => u._id);
        const wallets = await walletModel.find({ userId: { $in: userIds } });
        const walletMap = new Map(wallets.map((w) => [String(w.userId), w]));

        const usersWithExpiry = users.map((user) => {
            const w = walletMap.get(String(user._id));
            const isWalletExpired = Boolean(w?.expiresAt && new Date(w.expiresAt) <= now);
            const isWlActive = Boolean(user.whiteLabel?.enabled && (!user.whiteLabel?.expiresAt || new Date(user.whiteLabel.expiresAt) > now));
            const isWlExpired = Boolean(user.whiteLabel?.enabled && user.whiteLabel?.expiresAt && new Date(user.whiteLabel.expiresAt) <= now);
            return {
                ...user.toObject(),
                maxVideoSizeMB: user.maxVideoSizeMB ?? 9,
                wallet: w
                    ? {
                          balance: w.balance ?? 0,
                          expiresAt: w.expiresAt || null,
                          isLocked: Boolean(w.isLocked || isWalletExpired),
                          isExpired: isWalletExpired,
                      }
                    : {
                          balance: 0,
                          expiresAt: null,
                          isLocked: false,
                          isExpired: false,
                      },
                isExpired: user.status === "expired" || Boolean(user.expiresAt && user.expiresAt <= now),
                isWhiteLabelActive: isWlActive,
                isWhiteLabelExpired: isWlExpired,
            };
        });

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

async function saveUserProfileImage(req, res, userId) {
    let savedFilePath;
    try {
        if (req.isPreview) {
            return res.status(403).json({ message: "Exit preview mode before changing your profile image.", success: false });
        }
        if (!req.file) {
            return res.status(400).json({ message: "Choose a profile image to upload.", success: false });
        }
        const targetUser = await userModel.findById(userId).select("dp_img");
        if (!targetUser) {
            return res.status(404).json({ message: "User not found.", success: false });
        }

        const imageBuffer = await sharp(req.file.buffer)
            .rotate()
            .resize({ width: 512, height: 512, fit: "cover", withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer();

        const isCloudinaryActive = isCloudinaryConfigured();
        const useCloudinary = process.env.USE_CLOUDINARY === "true" || (isCloudinaryActive && process.env.USE_CLOUDINARY !== "false");

        let dpUrl;
        let uploadedCloudinaryPublicId = null;

        if (useCloudinary) {
            if (!isCloudinaryActive) {
                return res.status(500).json({
                    message: "Cloudinary configuration is missing for profile image storage.",
                    success: false,
                });
            }

            const publicId = `dp_${userId}_${crypto.randomUUID()}`;
            dpUrl = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        folder: "profile-pictures",
                        resource_type: "image",
                        format: "webp",
                        public_id: publicId,
                        use_filename: false,
                        overwrite: false,
                    },
                    (error, result) => {
                        if (error) {
                            console.error("Cloudinary profile upload error:", error);
                            reject(error);
                        } else {
                            uploadedCloudinaryPublicId = result.public_id || publicId;
                            resolve(result.secure_url);
                        }
                    }
                );
                uploadStream.end(imageBuffer);
            });
        } else {
            const uploadDirectory = path.join(process.cwd(), "uploads", "profile-pictures");
            const filename = `dp_${userId}_${crypto.randomUUID()}.webp`;
            savedFilePath = path.join(uploadDirectory, filename);
            await mkdir(uploadDirectory, { recursive: true });
            await writeFile(savedFilePath, imageBuffer);
            dpUrl = `/uploads/profile-pictures/${filename}`;
        }

        const user = await userModel.findByIdAndUpdate(
            userId,
            { $set: { dp_img: dpUrl } },
            { new: true }
        ).select("username email role dp_img");

        if (!user) {
            if (savedFilePath) await unlink(savedFilePath).catch(() => {});
            if (uploadedCloudinaryPublicId && isCloudinaryActive) {
                cloudinary.uploader.destroy(uploadedCloudinaryPublicId, { resource_type: "image" }).catch(() => {});
            }
            return res.status(404).json({ message: "User not found.", success: false });
        }

        const uploadDirectory = path.join(process.cwd(), "uploads", "profile-pictures");
        const previousPath = targetUser.dp_img;
        if (previousPath?.startsWith("/uploads/profile-pictures/")) {
            const previousFile = path.basename(previousPath);
            if (previousFile && previousFile !== path.basename(dpUrl)) {
                await unlink(path.join(uploadDirectory, previousFile)).catch(() => {});
            }
        }

        return res.status(200).json({ success: true, message: "Profile image updated.", user });
    } catch (error) {
        if (savedFilePath) await unlink(savedFilePath).catch(() => {});
        console.error("Upload profile image error:", error);
        return res.status(500).json({ message: "Failed to upload profile image.", success: false });
    }
}

export async function uploadCurrentUserProfileImage(req, res) {
    return saveUserProfileImage(req, res, req.user._id);
}

export async function removeCurrentUserProfileImage(req, res) {
    if (req.isPreview) {
        return res.status(403).json({ message: "Exit preview mode before removing your profile photo.", success: false });
    }
    try {
        // Return the previous photo atomically, so cleanup cannot target a
        // replacement uploaded by another session after this update.
        const previous = await userModel.findByIdAndUpdate(
            req.user._id,
            { $set: { dp_img: "" } },
            { new: false }
        ).select("username email role dp_img");
        if (!previous) return res.status(404).json({ message: "User not found.", success: false });

        const previousPath = previous.dp_img || "";
        try {
            const filename = path.basename(previousPath);
            const ownedPhoto = new RegExp(`^dp_${req.user._id}_[a-f0-9-]+\\.webp$`, "i");
            if (previousPath === `/uploads/profile-pictures/${filename}` && ownedPhoto.test(filename)) {
                await unlink(path.join(process.cwd(), "uploads", "profile-pictures", filename));
            } else if (isCloudinaryConfigured() && previousPath.startsWith(`https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`)) {
                const imagePath = new URL(previousPath).pathname;
                const cloudFilename = imagePath.split("/profile-pictures/")[1];
                if (cloudFilename && ownedPhoto.test(cloudFilename)) {
                    await cloudinary.uploader.destroy(`profile-pictures/${cloudFilename.slice(0, -5)}`, { resource_type: "image", invalidate: true });
                }
            }
        } catch (cleanupError) {
            // Removing the account photo succeeds even if old-file cleanup
            // is temporarily unavailable.
            if (cleanupError.code !== "ENOENT") console.warn("Profile photo cleanup failed:", cleanupError.message);
        }

        return res.status(200).json({ success: true, message: "Profile photo removed.", user: { ...previous.toObject(), dp_img: "" } });
    } catch (error) {
        console.error("Remove profile photo error:", error);
        return res.status(500).json({ message: "Failed to remove profile photo. Please try again.", success: false });
    }
}

export async function uploadManagedUserProfileImage(req, res) {
    if (req.user.role !== "Super Admin") {
        return res.status(403).json({ message: "Only Super Admin can change another user's profile image.", success: false });
    }
    return saveUserProfileImage(req, res, req.params.id);
}

/**
 * Create a new user under a Reseller.
 */
export async function createUser(req, res) {
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

        let customMaxVideoSizeMB = 9;
        if (req.user.role === "Super Admin" && req.body.maxVideoSizeMB !== undefined && req.body.maxVideoSizeMB !== null && req.body.maxVideoSizeMB !== "") {
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

        const newUser = await userModel.create({
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
                maxVideoSizeMB: newUser.maxVideoSizeMB ?? 9,
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

        if (Object.hasOwn(req.body, "featureAccess")) {
            if (!isSuperAdmin || !["User", "Reseller"].includes(targetUser.role)) {
                return res.status(403).json({ message: "Only Super Admin can manage feature access for user and reseller accounts.", success: false });
            }
            const featureAccess = req.body.featureAccess;
            const allowedFeatures = ["campaignDp", "campaignNumber", "campaignLink"];
            if (!featureAccess || typeof featureAccess !== "object" || Array.isArray(featureAccess) || Object.keys(featureAccess).some((key) => !allowedFeatures.includes(key)) || Object.values(featureAccess).some((enabled) => typeof enabled !== "boolean")) {
                return res.status(400).json({ message: "Feature access must contain boolean DP, phone, or campaign link settings.", success: false });
            }
            updates.featureAccess = {
                campaignDp: targetUser.featureAccess?.campaignDp === true,
                campaignNumber: targetUser.featureAccess?.campaignNumber === true,
                campaignLink: targetUser.featureAccess?.campaignLink === true,
                ...featureAccess,
            };
        }

        if (Object.hasOwn(req.body, "maxVideoSizeMB")) {
            if (!isSuperAdmin) {
                return res.status(403).json({ message: "Only Super Admin can manage video upload limits.", success: false });
            }
            const parsedVideoSize = Number(req.body.maxVideoSizeMB);
            if (!Number.isFinite(parsedVideoSize) || parsedVideoSize < 1) {
                return res.status(400).json({ message: "Max video size must be at least 1 MB.", success: false });
            }
            updates.maxVideoSizeMB = parsedVideoSize;
        }

        if (status === "expired") {
            updates.expiresAt = new Date(Date.now() - 1000);
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({
                message: "Provide a status, expiry date, or limit to update.",
                success: false,
            });
        }

        Object.assign(targetUser, updates);
        await targetUser.save();
        if (targetUser.status !== "active" || (targetUser.expiresAt && new Date(targetUser.expiresAt) <= new Date())) {
            await sessionModel.deleteMany({ userId: targetUser._id });
            notifyUser(targetUser._id, "SESSION_EXPIRED", { reason: "Your account access has ended." });
        } else {
            // Re-check connected sessions and reschedule timers for a future expiry change.
            await notifyUser(targetUser._id, "ACCOUNT_ACCESS_CHANGED", {});
        }

        return res.status(200).json({
            success: true,
            message: "Account access updated successfully.",
            user: {
                id: targetUser._id,
                status: targetUser.status,
                expiresAt: targetUser.expiresAt,
                maxVideoSizeMB: targetUser.maxVideoSizeMB ?? 9,
                featureAccess: targetUser.featureAccess,
            },
        });
    } catch (error) {
        console.error("UpdateUserAccess error:", error);
        return res.status(500).json({ message: "Failed to update account access", success: false });
    }
}

/**
 * PATCH /api/users/:id/white-label-access
 * Only Super Admin can grant, revoke, or change expiry for white-label access on Resellers.
 */
export async function updateWhiteLabelAccess(req, res) {
    try {
        const { id } = req.params;
        const { enabled, expiresAt } = req.body;

        const targetUser = await userModel.findById(id);
        if (!targetUser) {
            return res.status(404).json({ message: "Reseller account not found", success: false });
        }

        if (targetUser.role !== "Reseller") {
            return res.status(400).json({
                message: "White-label access can only be granted to Reseller accounts.",
                success: false,
            });
        }

        if (typeof enabled !== "boolean") {
            return res.status(400).json({
                message: "Enabled field must be a boolean (true or false).",
                success: false,
            });
        }

        targetUser.whiteLabel = targetUser.whiteLabel || {};
        targetUser.whiteLabel.enabled = enabled;

        if (Object.hasOwn(req.body, "expiresAt")) {
            if (expiresAt === null || expiresAt === "") {
                targetUser.whiteLabel.expiresAt = null;
            } else {
                const parsedExpiry = new Date(expiresAt);
                if (Number.isNaN(parsedExpiry.getTime())) {
                    return res.status(400).json({
                        message: "Enter a valid white-label expiry date.",
                        success: false,
                    });
                }
                if (/^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
                    parsedExpiry.setUTCHours(23, 59, 59, 999);
                }
                targetUser.whiteLabel.expiresAt = parsedExpiry;
            }
        }

        await targetUser.save();

        notifyUser(targetUser._id, "WHITE_LABEL_ACCESS_UPDATED", {
            whiteLabel: targetUser.whiteLabel,
            isWhiteLabelActive: targetUser.isWhiteLabelActive,
        });

        return res.status(200).json({
            success: true,
            message: `White-label access ${enabled ? "granted" : "revoked"} successfully for ${targetUser.username}.`,
            user: {
                id: targetUser._id,
                username: targetUser.username,
                role: targetUser.role,
                whiteLabel: targetUser.whiteLabel,
                isWhiteLabelActive: targetUser.isWhiteLabelActive,
            },
        });
    } catch (error) {
        console.error("updateWhiteLabelAccess error:", error);
        return res.status(500).json({
            message: "Failed to update white-label access.",
            success: false,
        });
    }
}

export async function updateManagedUserProfile(req, res) {
    try {
        const { id } = req.params;
        const targetUser = await userModel.findById(id);

        if (!targetUser) {
            return res.status(404).json({ message: "User not found", success: false });
        }

        const isSuperAdmin = req.user.role === "Super Admin";
        const ownsUser = req.user.role === "Reseller" &&
            targetUser.role === "User" &&
            String(targetUser.resellerId) === String(req.user._id);

        if (!isSuperAdmin && !ownsUser) {
            return res.status(403).json({ message: "You can only manage your own users.", success: false });
        }
        if (targetUser.role === "Super Admin") {
            return res.status(403).json({ message: "Super Admin accounts cannot be changed here.", success: false });
        }

        const { username, email, password, ratePerMsg, expiresAt } = req.body;
        const updates = {};
        try {
            if (req.body.phone !== undefined) updates.phone = normalizeAccountPhone(req.body.phone);
            if (req.body.companyName !== undefined) updates.companyName = normalizeAccountCompany(req.body.companyName);
        } catch (error) { return res.status(400).json({ success: false, message: error.message }); }

        if (username !== undefined) {
            const normalizedUsername = String(username).trim();
            if (!normalizedUsername || normalizedUsername.length > 100) {
                return res.status(400).json({ message: "Name must be between 1 and 100 characters.", success: false });
            }
            updates.username = normalizedUsername;
        }

        if (email !== undefined) {
            const normalizedEmail = String(email).trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
                return res.status(400).json({ message: "Enter a valid email address.", success: false });
            }
            const existing = await userModel.findOne({ email: normalizedEmail, _id: { $ne: targetUser._id } });
            if (existing) {
                return res.status(400).json({ message: "Email already in use.", success: false });
            }
            updates.email = normalizedEmail;
        }

        if (password !== undefined && password !== "") {
            if (typeof password !== "string" || password.trim().length < 8) {
                return res.status(400).json({ message: "Password must contain at least 8 characters.", success: false });
            }
            updates.password = password;
        }

        if (ratePerMsg !== undefined) {
            const parsedRate = Number(ratePerMsg);
            if (!Number.isFinite(parsedRate) || parsedRate < 0.01) {
                return res.status(400).json({ message: "Rate must be at least 0.01.", success: false });
            }
            updates.ratePerMsg = parsedRate;
        }

        if (Object.hasOwn(req.body, "expiresAt")) {
            if (expiresAt === null || expiresAt === "") {
                updates.expiresAt = null;
            } else {
                const parsedExpiry = new Date(expiresAt);
                if (Number.isNaN(parsedExpiry.getTime())) {
                    return res.status(400).json({ message: "Enter a valid account expiry date.", success: false });
                }
                if (typeof expiresAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(expiresAt)) {
                    parsedExpiry.setUTCHours(23, 59, 59, 999);
                }
                updates.expiresAt = parsedExpiry;
            }
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({ message: "Provide at least one account field to update.", success: false });
        }

        Object.assign(targetUser, updates);
        await targetUser.save();

        if (targetUser.status !== "active" || (targetUser.expiresAt && new Date(targetUser.expiresAt) <= new Date())) {
            await sessionModel.deleteMany({ userId: targetUser._id });
            notifyUser(targetUser._id, "SESSION_EXPIRED", { reason: "Your account access has ended." });
        } else {
            await notifyUser(targetUser._id, "ACCOUNT_ACCESS_CHANGED", {});
        }

        return res.status(200).json({
            success: true,
            message: "User account updated successfully.",
            user: {
                id: targetUser._id,
                username: targetUser.username,
                email: targetUser.email,
                ratePerMsg: targetUser.ratePerMsg,
                expiresAt: targetUser.expiresAt,
            },
        });
    } catch (error) {
        console.error("UpdateManagedUserProfile error:", error);
        return res.status(500).json({ message: "Failed to update user account", success: false });
    }
}

/**
 * PATCH /api/users/:id/role
 * Change role of an account.
 * Strict rules:
 * 1. Only Super Admin can change roles.
 * 2. Only Reseller and User accounts can be changed (Super Admin cannot be changed).
 * 3. New role must strictly be "Reseller" or "User".
 */
export async function updateUserRole(req, res) {
    try {
        const { id } = req.params;
        const { role: newRole } = req.body;

        if (req.user.role !== "Super Admin") {
            return res.status(403).json({
                message: "Forbidden: Only Super Admin can change account roles.",
                success: false,
            });
        }

        if (!newRole || !["Reseller", "User"].includes(newRole)) {
            return res.status(400).json({
                message: "Invalid role. Role can only be changed to 'Reseller' or 'User'.",
                success: false,
            });
        }

        const targetUser = await userModel.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                message: "User not found.",
                success: false,
            });
        }

        if (targetUser.role === "Super Admin") {
            return res.status(403).json({
                message: "Super Admin accounts cannot have their role changed.",
                success: false,
            });
        }

        if (targetUser.role === newRole) {
            return res.status(400).json({
                message: `This account is already a ${newRole}.`,
                success: false,
            });
        }

        const previousRole = targetUser.role;
        targetUser.role = newRole;

        // If converting Reseller -> User:
        // Client users previously under this reseller are unlinked (resellerId: null - direct admin accounts)
        if (previousRole === "Reseller" && newRole === "User") {
            await userModel.updateMany(
                { resellerId: targetUser._id },
                { $set: { resellerId: null } }
            );
            await walletModel.updateMany(
                { resellerId: targetUser._id },
                { $set: { resellerId: null } }
            );
            targetUser.resellerId = null;
        }

        // If converting User -> Reseller:
        // A reseller is directly under Super Admin, not under another reseller
        if (newRole === "Reseller") {
            targetUser.resellerId = null;
            await walletModel.updateOne(
                { userId: targetUser._id },
                { $set: { resellerId: null } }
            );
        }

        await targetUser.save();

        // Evict active sessions so the target user is forced to re-login into the proper dashboard
        await sessionModel.deleteMany({ userId: targetUser._id });

        // Realtime notification
        notifyUser(targetUser._id.toString(), "ROLE_CHANGED", {
            previousRole,
            newRole,
            message: `Your account role has been updated to ${newRole}. Please log in again.`,
        });

        return res.status(200).json({
            success: true,
            message: `Account role successfully changed from ${previousRole} to ${newRole}.`,
            user: {
                id: targetUser._id,
                username: targetUser.username,
                email: targetUser.email,
                role: targetUser.role,
                resellerId: targetUser.resellerId,
            },
        });
    } catch (error) {
        console.error("UpdateUserRole error:", error);
        return res.status(500).json({
            message: "Failed to update account role.",
            success: false,
        });
    }
}

export async function deleteUser(req, res) {
    try {
        const { id } = req.params;
        const targetUser = await userModel.findById(id);

        if (!targetUser) {
            return res.status(404).json({ message: "Account not found", success: false });
        }
        const isSuperAdmin = req.user.role === "Super Admin";
        const ownsUser = req.user.role === "Reseller" &&
            targetUser.role === "User" &&
            String(targetUser.resellerId) === String(req.user._id);
        if (!isSuperAdmin && !ownsUser) {
            return res.status(403).json({
                message: "You can only remove user accounts assigned to your reseller account.",
                success: false,
            });
        }
        if (targetUser.role === "Super Admin") {
            return res.status(403).json({ message: "Super Admin accounts cannot be deleted.", success: false });
        }

        if (targetUser.role === "Reseller") {
            await userModel.updateMany(
                { resellerId: targetUser._id },
                { $set: { resellerId: null } }
            );
            await walletModel.updateMany(
                { resellerId: targetUser._id },
                { $set: { resellerId: null } }
            );
        }

        await sessionModel.deleteMany({ userId: targetUser._id });
        notifyUser(targetUser._id, "SESSION_EXPIRED", { reason: "Your account has been deleted." });
        await walletModel.deleteOne({ userId: targetUser._id });
        await targetUser.deleteOne();

        return res.status(200).json({
            success: true,
            message: `${targetUser.role} account was permanently deleted. Campaign and credit history was retained.`,
        });
    } catch (error) {
        console.error("DeleteUser error:", error);
        return res.status(500).json({ message: "Failed to remove account", success: false });
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

export async function startFullAccessImpersonation(req, res) {
    try {
        const { id } = req.params;
        const targetUser = await userModel.findById(id).select("-password");

        if (!targetUser || !["User", "Reseller"].includes(targetUser.role)) {
            return res.status(404).json({ message: "Account not found", success: false });
        }

        const expired = targetUser.status !== "active" || Boolean(
            targetUser.expiresAt && new Date(targetUser.expiresAt) <= new Date()
        );
        if (expired) {
            return res.status(403).json({
                message: "Blocked or expired accounts cannot be opened for full access.",
                success: false,
            });
        }

        const token = jwt.sign(
            {
                userId: targetUser._id.toString(),
                nonce: crypto.randomBytes(16).toString("hex"),
                isImpersonation: true,
                originalAdmin: {
                    id: req.user._id.toString(),
                    username: req.user.username,
                    role: req.user.role,
                },
            },
            config.JWT_SECRET,
            { expiresIn: "4h" }
        );
        const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        await sessionModel.create({
            userId: targetUser._id,
            tokenHash,
            ip: req.ip || req.headers["x-forwarded-for"] || null,
            userAgent: `Full access as ${targetUser.role}; started by Super Admin ${req.user.username}`,
            expiresAt,
        });

        return res.status(200).json({
            success: true,
            token,
            expiresAt,
            user: {
                id: targetUser._id,
                username: targetUser.username,
                email: targetUser.email,
                role: targetUser.role,
                resellerId: targetUser.resellerId,
                isImpersonation: true,
                originalAdmin: {
                    id: req.user._id.toString(),
                    username: req.user.username,
                    role: req.user.role,
                },
            },
        });
    } catch (error) {
        console.error("Start full access impersonation error:", error);
        return res.status(500).json({ message: "Failed to open account", success: false });
    }
}

export async function exitFullAccessImpersonation(req, res) {
    try {
        if (!req.isImpersonation || req.originalAdmin?.role !== "Super Admin") {
            return res.status(400).json({ message: "Not in a full access session.", success: false });
        }

        const tokenHash = crypto.createHash("sha256").update(req.token).digest("hex");
        await sessionModel.deleteOne({ tokenHash, userId: req.user._id });
        notifySession(req.session._id, "SESSION_CLOSED");

        return res.status(200).json({ success: true, message: "Full access session ended." });
    } catch (error) {
        console.error("Exit full access impersonation error:", error);
        return res.status(500).json({ message: "Failed to end full access session", success: false });
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
        notifySession(req.session._id, "SESSION_CLOSED");

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

/**
 * PATCH /api/users/:id
 * Edit account details (username, email, password, ratePerMsg, status, expiresAt, resellerId)
 */
export async function updateUser(req, res) {
    try {
        const { id } = req.params;
        const { username, email, password, ratePerMsg, expiresAt, status, resellerId } = req.body;

        const targetUser = await userModel.findById(id);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found", success: false });
        }

        const isSuperAdmin = req.user.role === "Super Admin";
        const ownsUser = req.user.role === "Reseller" &&
            targetUser.role === "User" &&
            String(targetUser.resellerId) === String(req.user._id);

        if (!isSuperAdmin && !ownsUser) {
            return res.status(403).json({ message: "You can only edit your own assigned users.", success: false });
        }

        if (targetUser.role === "Super Admin" && !isSuperAdmin) {
            return res.status(403).json({ message: "Super Admin accounts cannot be edited here.", success: false });
        }

        try {
            if (req.body.phone !== undefined) targetUser.phone = normalizeAccountPhone(req.body.phone);
            if (req.body.companyName !== undefined) targetUser.companyName = normalizeAccountCompany(req.body.companyName);
        } catch (error) { return res.status(400).json({ success: false, message: error.message }); }

        // 1. Update username
        if (username !== undefined && username !== null) {
            const trimmed = String(username).trim();
            if (!trimmed) {
                return res.status(400).json({ message: "Username cannot be empty", success: false });
            }
            targetUser.username = trimmed;
        }

        // 2. Update email
        if (email !== undefined && email !== null) {
            const trimmedEmail = String(email).trim().toLowerCase();
            if (!trimmedEmail) {
                return res.status(400).json({ message: "Email cannot be empty", success: false });
            }
            if (trimmedEmail !== targetUser.email) {
                const existing = await userModel.findOne({ email: trimmedEmail, _id: { $ne: targetUser._id } });
                if (existing) {
                    return res.status(400).json({ message: "Email is already taken by another account", success: false });
                }
                targetUser.email = trimmedEmail;
            }
        }

        // 3. Update password (optional)
        if (password && String(password).trim().length > 0) {
            if (String(password).trim().length < 8) {
                return res.status(400).json({ message: "Password must be at least 8 characters", success: false });
            }
            targetUser.password = String(password).trim();
        }

        // 4. Update ratePerMsg
        if (ratePerMsg !== undefined && ratePerMsg !== null && ratePerMsg !== "") {
            const parsedRate = Number(ratePerMsg);
            if (isNaN(parsedRate) || parsedRate < 0) {
                return res.status(400).json({ message: "Rate per message must be a non-negative number", success: false });
            }
            targetUser.ratePerMsg = parsedRate;
        }

        // 5. Update status
        if (status !== undefined && status !== null) {
            if (!["active", "blocked", "expired"].includes(status)) {
                return res.status(400).json({ message: "Status must be active, blocked, or expired", success: false });
            }
            targetUser.status = status;
            if (status === "blocked") {
                await sessionModel.deleteMany({ userId: targetUser._id });
            }
            if (status === "expired") {
                targetUser.expiresAt = new Date(Date.now() - 1000);
            }
        }

        // 6. Update expiresAt
        if (Object.hasOwn(req.body, "expiresAt")) {
            if (!expiresAt) {
                targetUser.expiresAt = null;
            } else {
                const parsedExpiry = new Date(expiresAt);
                if (Number.isNaN(parsedExpiry.getTime())) {
                    return res.status(400).json({ message: "Enter a valid account expiry date.", success: false });
                }
                if (/^\d{4}-\d{2}-\d{2}$/.test(String(expiresAt))) {
                    parsedExpiry.setUTCHours(23, 59, 59, 999);
                }
                targetUser.expiresAt = parsedExpiry;
            }
        }

        // 7. Update resellerId (Super Admin only for User role)
        let didChangeReseller = false;
        let oldResellerId = targetUser.resellerId;
        let newResellerId = oldResellerId;
        if (isSuperAdmin && targetUser.role === "User" && Object.hasOwn(req.body, "resellerId")) {
            newResellerId = req.body.resellerId || null;
            if (newResellerId) {
                const reseller = await userModel.findOne({ _id: newResellerId, role: "Reseller" });
                if (!reseller) {
                    return res.status(400).json({ message: "Selected reseller not found", success: false });
                }
            }
            if (String(oldResellerId || "") !== String(newResellerId || "")) {
                didChangeReseller = true;
            }
            targetUser.resellerId = newResellerId;
            await walletModel.updateOne({ userId: targetUser._id }, { $set: { resellerId: newResellerId } });
        }

        // 8. Update maxVideoSizeMB (Super Admin only)
        if (Object.hasOwn(req.body, "maxVideoSizeMB")) {
            if (!isSuperAdmin) {
                return res.status(403).json({ message: "Only Super Admin can manage video upload limits.", success: false });
            }
            const parsedVideoSize = Number(req.body.maxVideoSizeMB);
            if (!Number.isFinite(parsedVideoSize) || parsedVideoSize < 1) {
                return res.status(400).json({ message: "Max video size must be at least 1 MB.", success: false });
            }
            targetUser.maxVideoSizeMB = parsedVideoSize;
        }

        await targetUser.save();

        if (didChangeReseller) {
            await syncResellerReassignment(targetUser._id, oldResellerId, newResellerId, req.user._id);
        }
        if (targetUser.status !== "active" || (targetUser.expiresAt && new Date(targetUser.expiresAt) <= new Date())) {
            await sessionModel.deleteMany({ userId: targetUser._id });
            notifyUser(targetUser._id, "SESSION_EXPIRED", { reason: "Your account access has ended." });
        } else {
            await notifyUser(targetUser._id, "ACCOUNT_ACCESS_CHANGED", {});
        }

        return res.status(200).json({
            success: true,
            message: "Account updated successfully",
            user: {
                id: targetUser._id,
                username: targetUser.username,
                email: targetUser.email,
                role: targetUser.role,
                ratePerMsg: targetUser.ratePerMsg,
                status: targetUser.status,
                expiresAt: targetUser.expiresAt,
                maxVideoSizeMB: targetUser.maxVideoSizeMB ?? 9,
                resellerId: targetUser.resellerId,
            },
        });
    } catch (error) {
        console.error("UpdateUser error:", error);
        return res.status(500).json({ message: "Failed to update account", success: false });
    }
}
