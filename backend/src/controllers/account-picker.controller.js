import mongoose from "mongoose";
import User from "../models/user.model.js";

export async function searchAccountOptions(req, res) {
    try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (q.length > 120) return res.status(400).json({ message: "Search must be 120 characters or fewer." });
        const filter = { role: { $in: ["User", "Reseller"] } };
        if (req.user.role === "Reseller") {
            filter.role = "User";
            filter.resellerId = req.user._id;
            if (req.query.purpose === "credits") filter.createdBy = req.user._id;
        } else if (req.query.role === "Reseller" || req.query.role === "User") filter.role = req.query.role;
        if (req.query.active === "true") filter.status = "active";
        if (q) {
            const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
            filter.$or = ["username", "email", "phone", "companyName"].map(field => ({ [field]: regex }));
            const digits = q.replace(/[\s().+-]/g, "");
            if (/^\d{3,15}$/.test(digits)) filter.$or.push({ phone: new RegExp(digits) });
            if (/^[a-f\d]{24}$/i.test(q)) filter.$or.push({ _id: new mongoose.Types.ObjectId(q) });
        }
        const users = await User.find(filter).select("username email phone companyName role status").sort({ username: 1, _id: 1 }).limit(21).lean();
        return res.json({ users: users.slice(0, 20), hasMore: users.length > 20 });
    } catch (error) {
        console.error("Account picker error:", error);
        return res.status(500).json({ message: "Could not search accounts. Try again." });
    }
}
