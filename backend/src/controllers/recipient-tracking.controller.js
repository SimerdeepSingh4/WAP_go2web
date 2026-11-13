import trackedNumberModel from "../models/trackedNumber.model.js";
import { parseTrackedPhones } from "../helpers/recipient-tracking.js";
import { campaignTracking, trackingCampaign } from "../services/recipient-tracking.service.js";
import { saveContactFolder, saveCampaignContactFolder } from "../services/contact-folder.service.js";

const adminOnly = (req) => {
    if (req.user?.role !== "Super Admin") throw Object.assign(new Error("Only super admins can access tracked numbers."), { statusCode: 403 });
};
const failure = (res, error) => {
    if (!error.statusCode) console.error("Recipient tracking error:", error);
    return res.status(error.statusCode || 500).json({ success: false, message: error.statusCode ? error.message : "Unable to update tracked numbers. Please try again." });
};

export async function getTrackedNumbers(req, res) {
    try {
        adminOnly(req);
        const campaign = await trackingCampaign(req.params.id);
        return res.json({ success: true, data: await campaignTracking(campaign) });
    } catch (error) { return failure(res, error); }
}

export async function addTrackedNumbers(req, res) {
    try {
        adminOnly(req);
        const campaign = await trackingCampaign(req.params.id);
        const numbers = parseTrackedPhones(req.body?.phoneNumbers);
        const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
        if (note.length > 500) throw Object.assign(new Error("Notes can contain up to 500 characters."), { statusCode: 400 });
        await trackedNumberModel.bulkWrite(numbers.map((phoneNumber) => ({ updateOne: {
            filter: { userId: campaign.userId, phoneNumber },
            update: { $setOnInsert: { userId: campaign.userId, phoneNumber, note, addedBy: req.user._id } },
            upsert: true,
        } })));
        return res.status(201).json({ success: true, message: "Numbers added to this user's tracked list." });
    } catch (error) { return failure(res, error); }
}

export async function saveTrackedContacts(req, res) {
    try {
        adminOnly(req);
        const campaign = await trackingCampaign(req.params.id);
        const numbers = parseTrackedPhones(req.body?.phoneNumbers);
        const tracking = await campaignTracking(campaign);
        const allowed = new Set(tracking.rows.map((row) => row.phoneNumber));
        if (numbers.some((number) => !allowed.has(number))) throw Object.assign(new Error("Select numbers from this campaign's tracked list."), { statusCode: 400 });
        const data = await saveCampaignContactFolder(req.user._id, campaign.userId, tracking.username, numbers);
        return res.json({ success: true, data });
    } catch (error) { return failure(res, error); }
}

export async function saveFolderContacts(req, res) {
    try {
        adminOnly(req);
        const data = await saveContactFolder(req.user._id, req.body);
        return res.json({ success: true, data });
    } catch (error) { return failure(res, error); }
}

export async function updateTrackedNote(req, res) {
    try {
        adminOnly(req);
        const campaign = await trackingCampaign(req.params.id);
        const [phoneNumber] = parseTrackedPhones([req.params.phoneNumber]);
        if (typeof req.body?.note !== "string" || req.body.note.trim().length > 500) {
            throw Object.assign(new Error("Enter a note of up to 500 characters."), { statusCode: 400 });
        }
        const tracking = await campaignTracking(campaign);
        if (!tracking.rows.some((row) => row.phoneNumber === phoneNumber)) {
            throw Object.assign(new Error("Choose a number from this user's tracked list."), { statusCode: 400 });
        }
        await trackedNumberModel.updateOne(
            { userId: campaign.userId, phoneNumber },
            {
                $set: { note: req.body.note.trim() },
                $setOnInsert: { userId: campaign.userId, phoneNumber, addedBy: req.user._id },
            },
            { upsert: true, runValidators: true },
        );
        return res.json({ success: true, message: "Note saved." });
    } catch (error) { return failure(res, error); }
}
