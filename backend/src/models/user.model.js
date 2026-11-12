import { notificationHooks } from "../helpers/notification-hooks.js";
import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: [true, "Username is required"],
            trim:true,
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
        },
        dp_img: {
            type: String,
            default: "",
            trim: true,
        },
        phone: {
            type: String,
            trim: true,
            default: "",
            validate: { validator: value => !value || /^\+?\d{7,15}$/.test(value), message: "Enter a valid phone number with 7 to 15 digits." },
        },
        companyName: { type: String, trim: true, default: "", maxlength: 150 },
        password: {
            type: String,
            required: [true, "Password is required"],
            trim: true,
            select: false,
        },
        role: {
            type: String,
            enum: ["Super Admin", "Reseller", "User"],
            default: "User",
        },
        resellerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        status: {
            type: String,
            enum: ["active", "blocked", "expired"],
            default: "active",
        },
        expiresAt: {
            type: Date,
            default: null,
        },
        ratePerMsg: {
            type: Number,
            default: 12, // default 12 paise per message
            min: [0, "Rate per message cannot be negative"],
        },
        maxVideoSizeMB: {
            type: Number,
            default: 9,
            min: [1, "Max video size must be at least 1 MB"],
        },
        featureAccess: {
            campaignDp: { type: Boolean, default: false },
            campaignNumber: { type: Boolean, default: false },
            campaignLink: { type: Boolean, default: false },
        },
        whiteLabel: {
            enabled: {
                type: Boolean,
                default: false,
            },
            expiresAt: {
                type: Date,
                default: null,
            },
            subdomain: {
                type: String,
                trim: true,
                lowercase: true,
                default: "",
            },
            brandName: {
                type: String,
                trim: true,
                default: "",
                maxlength: 100,
            },
            logoUrl: {
                type: String,
                trim: true,
                default: "",
            },
            primaryColor: {
                type: String,
                trim: true,
                default: "",
                validate: {
                    validator: (v) => !v || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v),
                    message: "Primary color must be a valid hex color code.",
                },
            },
            secondaryColor: {
                type: String,
                trim: true,
                default: "",
                validate: {
                    validator: (v) => !v || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v),
                    message: "Secondary color must be a valid hex color code.",
                },
            },
            accentColor: {
                type: String,
                trim: true,
                default: "",
                validate: {
                    validator: (v) => !v || /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v),
                    message: "Accent color must be a valid hex color code.",
                },
            },
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

userSchema.virtual("isWhiteLabelActive").get(function () {
    if (!this.whiteLabel?.enabled) return false;
    if (!this.whiteLabel.expiresAt) return true;
    return new Date(this.whiteLabel.expiresAt) > new Date();
});

userSchema.index(
    { "whiteLabel.subdomain": 1 },
    {
        unique: true,
        sparse: true,
        partialFilterExpression: {
            "whiteLabel.subdomain": { $exists: true, $type: "string", $gt: "" },
            role: "Reseller",
        },
    }
);

userSchema.pre("save", async function () {
    if (!this.isModified("password")) {
        return;
    }
    this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

notificationHooks(userSchema, "user");

const userModel = mongoose.models.User || mongoose.model("User", userSchema);

export default userModel;
