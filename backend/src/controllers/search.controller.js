import mongoose from "mongoose";
import User from "../models/user.model.js";
import Campaign from "../models/campaign.model.js";
import Transaction from "../models/transaction.model.js";
import { transactionObjectId, transactionReference } from "../helpers/transaction-reference.js";
import { campaignObjectId, campaignReference } from "../helpers/campaign-reference.js";
import { publicAccountIdentity } from "../helpers/account-identity.js";

const lookup = (from, localField, as) => ({ $lookup: { from, localField, foreignField: "_id", as, pipeline: [{ $project: { username: 1, email: 1, role: 1, campaignTitle: 1 } }] } });
const matches = (fields, regex) => fields.map((field) => ({ [field]: regex }));

export async function searchRecords(req, res) {
    try {
        const role = req.user.role;
        if (!["Super Admin", "Reseller", "User"].includes(role)) return res.status(403).json({ message: "Search is unavailable for this account." });
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (q.length > 120) return res.status(400).json({ message: "Search must be 120 characters or fewer." });
        if (q.length < 2) return res.json({ groups: [] });
        const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const ownId = new mongoose.Types.ObjectId(String(req.user._id));
        const base = role === "Super Admin" ? "/admin" : role === "Reseller" ? "/reseller" : "/user";
        const assigned = role === "Reseller" ? await User.find({ role: "User", resellerId: ownId }).select("_id createdBy").lean() : [];
        const campaignScope = role === "Super Admin" ? {} : { userId: { $in: [ownId, ...assigned.map((u) => u._id)] } };
        const creditIds = [ownId, ...assigned.filter((u) => String(u.createdBy) === String(ownId)).map((u) => u._id)];
        const transactionScope = role === "Super Admin" ? {} : { $or: [{ fromUser: { $in: creditIds } }, { toUser: { $in: creditIds } }] };
        const campaignId = campaignObjectId(q);
        const ref = campaignId ? [{ _id: new mongoose.Types.ObjectId(campaignId) }] : [];
        const creditReference = transactionObjectId(q);
        const transactionRef = creditReference ? [{ _id: new mongoose.Types.ObjectId(creditReference) }] : [];
        const [campaigns, accounts, transactions] = await Promise.all([
            Campaign.aggregate([
                { $match: campaignScope }, lookup(User.collection.name, "userId", "creator"),
                { $match: { $or: [...matches(["campaignTitle", "creator.username", "creator.email"], regex), ...ref] } },
                { $sort: { createdAt: -1, _id: -1 } }, { $limit: 5 },
                { $project: { campaignTitle: 1, "creator.username": 1, "creator.role": 1 } },
            ]),
            role === "User" ? [] : User.find({ role: role === "Super Admin" ? { $in: ["User", "Reseller"] } : "User", ...(role === "Reseller" ? { resellerId: ownId } : {}), $or: matches(["username", "email"], regex) }).select("username email role").sort({ username: 1, _id: 1 }).limit(5).lean(),
            Transaction.aggregate([
                { $match: transactionScope }, lookup(User.collection.name, "fromUser", "sender"), lookup(User.collection.name, "toUser", "recipient"), lookup(Campaign.collection.name, "campaignId", "campaign"),
                { $match: { $or: [...matches(["notes", "campaign.campaignTitle", "sender.username", "sender.email", "recipient.username", "recipient.email"], regex), ...transactionRef] } },
                { $sort: { createdAt: -1, _id: -1 } }, { $limit: 5 },
                { $project: { type: 1, amount: 1, createdAt: 1, "campaign.campaignTitle": 1, "recipient.username": 1, "recipient.role": 1, "sender.username": 1 } },
            ]),
        ]);
        const labels = { DEDUCT: "Campaign charge", ALLOCATE: "Allocation", REFUND: "Refund", RECLAIM: "Reclaim", REQUEST: "Credit request" };
        return res.json({ groups: [
            { label: "Campaigns", items: campaigns.map((c) => ({ id: String(c._id), reference: campaignReference(c._id), title: c.campaignTitle, subtitle: publicAccountIdentity(c.creator[0], role)?.username || "Campaign", href: `${base}/campaigns/${c._id}` })) },
            { label: "Accounts", items: accounts.map((a) => ({ id: String(a._id), title: a.username, subtitle: `${a.role} · ${a.email}`, href: `${base}/${a.role === "Reseller" ? "resellers" : "users"}?account=${a._id}` })) },
            { label: "Credit transactions", items: transactions.map((t) => ({ id: String(t._id), reference: transactionReference(t._id), title: `${labels[t.type] || t.type} · ${t.amount} credits`, subtitle: [t.campaign[0]?.campaignTitle, publicAccountIdentity(t.recipient[0], role)?.username, new Date(t.createdAt).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" })].filter(Boolean).join(" · "), href: `${base}/${role === "Super Admin" ? "activity" : "credits"}?transaction=${transactionReference(t._id)}` })) },
        ].filter((g) => g.items.length) });
    } catch (error) {
        console.error("Search error:", error);
        return res.status(500).json({ message: "Could not search records. Try again." });
    }
}
