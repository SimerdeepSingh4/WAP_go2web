import mongoose from "mongoose";
import campaignModel from "../models/campaign.model.js";
import userModel from "../models/user.model.js";
import trackedNumberModel from "../models/trackedNumber.model.js";
import { buildTrackedNumberRows, normalizeTrackedPhone, submittedCampaignPhones } from "../helpers/recipient-tracking.js";

export async function trackingCampaign(id) {
    if (!mongoose.isObjectIdOrHexString(id)) throw Object.assign(new Error("Invalid campaign ID."), { statusCode: 400 });
    const campaign = await campaignModel.findById(id).select("userId createdAt status originalRecipients recipients.phoneNumber").lean();
    if (!campaign) throw Object.assign(new Error("Campaign not found."), { statusCode: 404 });
    return campaign;
}

export async function campaignTracking(campaign) {
    const [owner, manual, totalUserCampaigns] = await Promise.all([
        userModel.findById(campaign.userId).select("username phone").lean(),
        trackedNumberModel.find({ userId: campaign.userId }).lean(),
        campaignModel.countDocuments({ userId: campaign.userId, status: { $ne: "draft" } }),
    ]);
    const current = submittedCampaignPhones(campaign);
    const submitted = campaign.status !== "draft";
    const counts = new Map(submitted ? [...current].map((number) => [number, 1]) : []);
    const candidates = new Set([...current, ...manual.map((entry) => entry.phoneNumber), normalizeTrackedPhone(owner?.phone)]);
    let priorCount = 0;
    // A cursor bounds memory even for users with many large campaigns. The
    // compound userId/createdAt index limits the history scan to this user.
    const cursor = campaignModel.find({
        userId: campaign.userId, status: { $ne: "draft" },
        $or: [{ createdAt: { $lt: campaign.createdAt } }, { createdAt: campaign.createdAt, _id: { $lt: campaign._id } }],
    }).select("originalRecipients recipients.phoneNumber").lean().cursor();
    for await (const previous of cursor) {
        priorCount++;
        for (const number of submittedCampaignPhones(previous)) {
            if (candidates.has(number)) counts.set(number, (counts.get(number) || 0) + 1);
        }
    }
    const totalCampaigns = priorCount + Number(submitted);
    return {
        userId: String(campaign.userId), username: owner?.username || "Campaign user",
        totalCampaigns, totalUserCampaigns, baseline: submitted && priorCount === 0, submitted,
        rows: buildTrackedNumberRows(current, counts, manual, owner?.phone, totalCampaigns, submitted),
    };
}
