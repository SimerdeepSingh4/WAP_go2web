import mongoose from "mongoose";
import campaignModel from "../models/campaign.model.js";
import userModel from "../models/user.model.js";
import trackedNumberModel from "../models/trackedNumber.model.js";
import { buildTrackedNumberRows, normalizeTrackedPhone, submittedCampaignPhones } from "../helpers/recipient-tracking.js";

function toCampaignSummary(campaign) {
    return {
        id: String(campaign._id),
        title: campaign.campaignTitle || "Untitled campaign",
        createdAt: campaign.createdAt || null,
        status: campaign.status || "",
    };
}

export async function trackingCampaign(id) {
    if (!mongoose.isObjectIdOrHexString(id)) throw Object.assign(new Error("Invalid campaign ID."), { statusCode: 400 });
    const campaign = await campaignModel.findById(id).select("userId campaignTitle createdAt status originalRecipients recipients.phoneNumber").lean();
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
    const currentId = String(campaign._id);
    const counts = new Map(submitted ? [...current].map((number) => [number, 1]) : []);
    const hits = new Map(submitted ? [...current].map((number) => [number, [currentId]]) : []);
    const allCampaignSummaries = new Map();
    if (submitted) allCampaignSummaries.set(currentId, toCampaignSummary(campaign));

    const candidates = new Set([...current, ...manual.map((entry) => entry.phoneNumber), normalizeTrackedPhone(owner?.phone)]);
    let priorCount = 0;
    // A cursor bounds memory even for users with many large campaigns. The
    // compound userId/createdAt index limits the history scan to this user.
    const cursor = campaignModel.find({
        userId: campaign.userId, status: { $ne: "draft" },
        $or: [{ createdAt: { $lt: campaign.createdAt } }, { createdAt: campaign.createdAt, _id: { $lt: campaign._id } }],
    })
        .select("campaignTitle createdAt status originalRecipients recipients.phoneNumber")
        .sort({ createdAt: -1, _id: -1 })
        .lean()
        .cursor();
    for await (const previous of cursor) {
        priorCount++;
        const prevId = String(previous._id);
        let matchedPrev = false;
        for (const number of submittedCampaignPhones(previous)) {
            if (!candidates.has(number)) continue;
            matchedPrev = true;
            counts.set(number, (counts.get(number) || 0) + 1);
            const list = hits.get(number);
            if (list) list.push(prevId);
            else hits.set(number, [prevId]);
        }
        if (matchedPrev) allCampaignSummaries.set(prevId, toCampaignSummary(previous));
    }
    const totalCampaigns = priorCount + Number(submitted);
    const rows = buildTrackedNumberRows(current, counts, manual, owner?.phone, totalCampaigns, submitted, hits);
    const campaigns = {};
    for (const row of rows) {
        for (const cid of row.campaignIds) {
            if (!campaigns[cid] && allCampaignSummaries.has(cid)) {
                campaigns[cid] = allCampaignSummaries.get(cid);
            }
        }
    }
    return {
        userId: String(campaign.userId), username: owner?.username || "Campaign user",
        totalCampaigns, totalUserCampaigns, baseline: submitted && priorCount === 0, submitted,
        campaigns,
        rows,
    };
}
