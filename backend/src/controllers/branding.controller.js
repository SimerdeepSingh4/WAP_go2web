import crypto from "crypto";
import path from "path";
import { writeFile, unlink, mkdir } from "fs/promises";
import sharp from "sharp";
import userModel from "../models/user.model.js";
import { extractSubdomain, validateSubdomain } from "../helpers/subdomain.helper.js";
import cloudinary, { isCloudinaryConfigured } from "../config/cloudinary.config.js";
import { notifyUser } from "../services/socket.service.js";

const DEFAULT_BRANDING = {
    isWhiteLabeled: false,
    brandName: "Promotion",
    logoUrl: "https://res.cloudinary.com/dyfjy8kmv/image/upload/v1793689940/Navy_Blue_Bird_Chat_Logo_n0udpf.webp",
    primaryColor: "",
    secondaryColor: "",
    accentColor: "",
    subdomain: "",
};

/**
 * Public endpoint: Resolve branding for incoming request based on subdomain or host.
 * GET /api/branding/resolve?subdomain=xyz or Host header
 */
export async function resolveBranding(req, res) {
    try {
        const querySubdomain = req.query.subdomain;
        const hostHeader = req.query.host || req.headers.host || "";
        const candidateSubdomain = querySubdomain
            ? String(querySubdomain).trim().toLowerCase()
            : extractSubdomain(hostHeader);

        if (!candidateSubdomain) {
            return res.status(200).json({
                success: true,
                branding: DEFAULT_BRANDING,
            });
        }

        const now = new Date();
        const reseller = await userModel.findOne({
            role: "Reseller",
            status: "active",
            "whiteLabel.enabled": true,
            "whiteLabel.subdomain": candidateSubdomain,
            $or: [
                { "whiteLabel.expiresAt": null },
                { "whiteLabel.expiresAt": { $gt: now } },
            ],
        }).select("username companyName whiteLabel");

        if (!reseller) {
            return res.status(200).json({
                success: true,
                branding: {
                    ...DEFAULT_BRANDING,
                    subdomain: candidateSubdomain,
                },
            });
        }

        const wl = reseller.whiteLabel || {};
        return res.status(200).json({
            success: true,
            branding: {
                isWhiteLabeled: true,
                subdomain: wl.subdomain,
                brandName: wl.brandName || reseller.companyName || reseller.username || "Promotion",
                logoUrl: wl.logoUrl || DEFAULT_BRANDING.logoUrl,
                primaryColor: wl.primaryColor || "",
                secondaryColor: wl.secondaryColor || "",
                accentColor: wl.accentColor || "",
                resellerId: reseller._id,
            },
        });
    } catch (error) {
        console.error("resolveBranding error:", error);
        return res.status(500).json({
            message: "Failed to resolve branding.",
            success: false,
            branding: DEFAULT_BRANDING,
        });
    }
}

/**
 * Authenticated endpoint: Get branding configuration for the logged-in Reseller.
 * GET /api/reseller/branding
 */
export async function getResellerBranding(req, res) {
    try {
        const user = await userModel.findById(req.user._id).select("role username companyName whiteLabel");
        if (!user || user.role !== "Reseller") {
            return res.status(403).json({
                message: "Only Resellers can access branding settings.",
                success: false,
            });
        }

        const now = new Date();
        const wl = user.whiteLabel || {};
        const isEnabled = Boolean(wl.enabled);
        const expiresAt = wl.expiresAt || null;
        const isExpired = Boolean(isEnabled && expiresAt && new Date(expiresAt) <= now);
        const isActive = Boolean(isEnabled && (!expiresAt || new Date(expiresAt) > now));

        return res.status(200).json({
            success: true,
            branding: {
                enabled: isEnabled,
                expiresAt,
                isActive,
                isExpired,
                subdomain: wl.subdomain || "",
                brandName: wl.brandName || "",
                logoUrl: wl.logoUrl || "",
                primaryColor: wl.primaryColor || "",
                secondaryColor: wl.secondaryColor || "",
                accentColor: wl.accentColor || "",
            },
        });
    } catch (error) {
        console.error("getResellerBranding error:", error);
        return res.status(500).json({
            message: "Failed to fetch branding settings.",
            success: false,
        });
    }
}

/**
 * Authenticated endpoint: Update branding settings for the logged-in Reseller.
 * PATCH /api/reseller/branding
 */
export async function updateResellerBranding(req, res) {
    try {
        const user = await userModel.findById(req.user._id);
        if (!user || user.role !== "Reseller") {
            return res.status(403).json({
                message: "Only Resellers can update branding settings.",
                success: false,
            });
        }

        const now = new Date();
        const isEnabled = Boolean(user.whiteLabel?.enabled);
        const isExpired = Boolean(isEnabled && user.whiteLabel?.expiresAt && new Date(user.whiteLabel.expiresAt) <= now);

        if (!isEnabled) {
            return res.status(403).json({
                message: "White-label access has not been granted by Super Admin.",
                success: false,
            });
        }

        if (isExpired) {
            return res.status(403).json({
                message: "Your white-label access has expired. Please contact Super Admin to renew.",
                success: false,
            });
        }

        user.whiteLabel = user.whiteLabel || {};
        const { subdomain, brandName, primaryColor, secondaryColor, accentColor } = req.body;

        // Subdomain validation
        if (Object.hasOwn(req.body, "subdomain")) {
            if (subdomain === "" || subdomain === null) {
                user.whiteLabel.subdomain = "";
            } else {
                const subValidation = validateSubdomain(subdomain);
                if (!subValidation.valid) {
                    return res.status(400).json({
                        message: subValidation.error,
                        success: false,
                    });
                }

                // Check if another reseller already owns this subdomain
                const existing = await userModel.findOne({
                    _id: { $ne: user._id },
                    role: "Reseller",
                    "whiteLabel.subdomain": subValidation.normalized,
                });

                if (existing) {
                    return res.status(409).json({
                        message: `The subdomain "${subValidation.normalized}" is already taken by another reseller.`,
                        success: false,
                    });
                }

                user.whiteLabel.subdomain = subValidation.normalized;
            }
        }

        // Brand Name validation
        if (Object.hasOwn(req.body, "brandName")) {
            user.whiteLabel.brandName = String(brandName || "").trim().slice(0, 100);
        }

        // Color validation (hex format e.g. #245e59)
        const hexRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
        if (Object.hasOwn(req.body, "primaryColor")) {
            const color = String(primaryColor || "").trim();
            if (color && !hexRegex.test(color)) {
                return res.status(400).json({
                    message: "Primary color must be a valid hex color code (e.g. #245e59).",
                    success: false,
                });
            }
            user.whiteLabel.primaryColor = color;
        }

        if (Object.hasOwn(req.body, "secondaryColor")) {
            const color = String(secondaryColor || "").trim();
            if (color && !hexRegex.test(color)) {
                return res.status(400).json({
                    message: "Secondary color must be a valid hex color code.",
                    success: false,
                });
            }
            user.whiteLabel.secondaryColor = color;
        }

        if (Object.hasOwn(req.body, "accentColor")) {
            const color = String(accentColor || "").trim();
            if (color && !hexRegex.test(color)) {
                return res.status(400).json({
                    message: "Accent color must be a valid hex color code.",
                    success: false,
                });
            }
            user.whiteLabel.accentColor = color;
        }

        await user.save();

        notifyUser(user._id, "WHITE_LABEL_BRANDING_UPDATED", {
            whiteLabel: user.whiteLabel,
        });

        return res.status(200).json({
            success: true,
            message: "Branding settings saved successfully.",
            branding: {
                enabled: user.whiteLabel.enabled,
                expiresAt: user.whiteLabel.expiresAt,
                isActive: true,
                isExpired: false,
                subdomain: user.whiteLabel.subdomain || "",
                brandName: user.whiteLabel.brandName || "",
                logoUrl: user.whiteLabel.logoUrl || "",
                primaryColor: user.whiteLabel.primaryColor || "",
                secondaryColor: user.whiteLabel.secondaryColor || "",
                accentColor: user.whiteLabel.accentColor || "",
            },
        });
    } catch (error) {
        console.error("updateResellerBranding error:", error);
        return res.status(500).json({
            message: "Failed to update branding settings.",
            success: false,
        });
    }
}

/**
 * Authenticated endpoint: Upload custom logo for the logged-in Reseller.
 * POST /api/reseller/branding/logo
 */
export async function uploadResellerLogo(req, res) {
    let savedFilePath = null;
    let uploadedCloudinaryPublicId = null;

    try {
        const user = await userModel.findById(req.user._id);
        if (!user || user.role !== "Reseller") {
            return res.status(403).json({
                message: "Only Resellers can upload branding logos.",
                success: false,
            });
        }

        const now = new Date();
        const isEnabled = Boolean(user.whiteLabel?.enabled);
        const isExpired = Boolean(isEnabled && user.whiteLabel?.expiresAt && new Date(user.whiteLabel.expiresAt) <= now);

        if (!isEnabled || isExpired) {
            return res.status(403).json({
                message: isExpired
                    ? "White-label access has expired. Please renew with Super Admin."
                    : "White-label access has not been granted by Super Admin.",
                success: false,
            });
        }

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ message: "No logo file uploaded.", success: false });
        }

        // Convert & optimize using sharp to WebP
        const imageBuffer = await sharp(req.file.buffer)
            .rotate()
            .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 85 })
            .toBuffer();

        const isCloudinaryActive = isCloudinaryConfigured();
        const useCloudinary = process.env.USE_CLOUDINARY === "true" || (isCloudinaryActive && process.env.USE_CLOUDINARY !== "false");

        let logoUrl;

        if (useCloudinary) {
            if (!isCloudinaryActive) {
                return res.status(500).json({
                    message: "Cloudinary configuration is missing for logo storage.",
                    success: false,
                });
            }

            const publicId = `logo_${user._id}_${crypto.randomUUID()}`;
            logoUrl = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        folder: "white-label-logos",
                        resource_type: "image",
                        format: "webp",
                        public_id: publicId,
                        use_filename: false,
                        overwrite: false,
                    },
                    (error, result) => {
                        if (error) {
                            console.error("Cloudinary logo upload error:", error);
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
            const uploadDirectory = path.join(process.cwd(), "uploads", "white-label-logos");
            const filename = `logo_${user._id}_${crypto.randomUUID()}.webp`;
            savedFilePath = path.join(uploadDirectory, filename);
            await mkdir(uploadDirectory, { recursive: true });
            await writeFile(savedFilePath, imageBuffer);
            logoUrl = `/uploads/white-label-logos/${filename}`;
        }

        // Clean up old logo if Cloudinary
        const oldLogoUrl = user.whiteLabel?.logoUrl || "";
        if (oldLogoUrl && isCloudinaryActive && oldLogoUrl.includes("res.cloudinary.com")) {
            try {
                const match = oldLogoUrl.match(/white-label-logos\/([^./]+)/);
                if (match && match[1]) {
                    await cloudinary.uploader.destroy(`white-label-logos/${match[1]}`, { resource_type: "image" });
                }
            } catch (cleanupErr) {
                console.warn("Failed to delete previous logo from Cloudinary:", cleanupErr.message);
            }
        }

        user.whiteLabel = user.whiteLabel || {};
        user.whiteLabel.logoUrl = logoUrl;
        await user.save();

        notifyUser(user._id, "WHITE_LABEL_BRANDING_UPDATED", {
            whiteLabel: user.whiteLabel,
        });

        return res.status(200).json({
            success: true,
            message: "Brand logo uploaded successfully.",
            logoUrl,
        });
    } catch (error) {
        console.error("uploadResellerLogo error:", error);
        if (uploadedCloudinaryPublicId) {
            cloudinary.uploader.destroy(uploadedCloudinaryPublicId, { resource_type: "image" }).catch(() => {});
        }
        if (savedFilePath) {
            await unlink(savedFilePath).catch(() => {});
        }
        return res.status(500).json({
            message: error.message || "Failed to upload brand logo.",
            success: false,
        });
    }
}

/**
 * Authenticated endpoint: Remove custom logo for the logged-in Reseller.
 * DELETE /api/reseller/branding/logo
 */
export async function removeResellerLogo(req, res) {
    try {
        const user = await userModel.findById(req.user._id);
        if (!user || user.role !== "Reseller") {
            return res.status(403).json({
                message: "Only Resellers can modify branding.",
                success: false,
            });
        }

        const oldLogoUrl = user.whiteLabel?.logoUrl || "";
        if (oldLogoUrl && isCloudinaryConfigured() && oldLogoUrl.includes("res.cloudinary.com")) {
            try {
                const match = oldLogoUrl.match(/white-label-logos\/([^./]+)/);
                if (match && match[1]) {
                    await cloudinary.uploader.destroy(`white-label-logos/${match[1]}`, { resource_type: "image" });
                }
            } catch (cleanupErr) {
                console.warn("Failed to delete logo from Cloudinary:", cleanupErr.message);
            }
        }

        user.whiteLabel = user.whiteLabel || {};
        user.whiteLabel.logoUrl = "";
        await user.save();

        notifyUser(user._id, "WHITE_LABEL_BRANDING_UPDATED", {
            whiteLabel: user.whiteLabel,
        });

        return res.status(200).json({
            success: true,
            message: "Brand logo removed successfully.",
        });
    } catch (error) {
        console.error("removeResellerLogo error:", error);
        return res.status(500).json({
            message: "Failed to remove brand logo.",
            success: false,
        });
    }
}

