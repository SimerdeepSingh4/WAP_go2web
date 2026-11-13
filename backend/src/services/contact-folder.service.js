import mongoose from "mongoose";
import groupModel from "../models/group.model.js";
import contactModel from "../models/contact.model.js";
import { normalizeTrackedPhone, parseTrackedPhones } from "../helpers/recipient-tracking.js";

export async function saveCampaignContactFolder(adminId, sourceUserId, username, phoneNumbers) {
    const numbers = parseTrackedPhones(phoneNumbers);
    const name = String(username || "Campaign user").trim().slice(0, 100) || "Campaign user";
    const source = { userId: adminId, sourceUserId, isDeleted: false };
    let folder = await groupModel.findOne(source);
    if (!folder) {
        // Attach an existing, manually named folder without moving its contacts.
        folder = await groupModel.findOneAndUpdate(
            { userId: adminId, name, isDeleted: false, sourceUserId: { $exists: false } },
            { $set: { sourceUserId } }, { returnDocument: "after" },
        );
    }
    if (!folder) {
        // The ID keeps different people with the same name in separate folders.
        // The UI uses the populated user's name as the card title.
        for (const folderName of [name, `${name.slice(0, 72)} (${String(sourceUserId)})`]) {
            try {
                folder = await groupModel.findOneAndUpdate(source, {
                    $setOnInsert: { ...source, name: folderName, adminFolder: true, description: "Numbers saved from this user's campaigns" },
                }, { upsert: true, returnDocument: "after", runValidators: true });
                break;
            } catch (error) {
                if (error.code !== 11000) throw error;
                folder = await groupModel.findOne(source);
                if (folder) break;
            }
        }
    }
    if (!folder) throw Object.assign(new Error("Unable to create this user's contact folder. Please try again."), { statusCode: 409 });
    const result = await saveContactFolder(adminId, { phoneNumbers: numbers, groupId: String(folder._id) });
    return { ...result, folder: { ...result.folder, name, sourceUserId: String(sourceUserId) } };
}

export async function saveContactFolder(adminId, body = {}) {
    const numbers = parseTrackedPhones(body.phoneNumbers);
    let folder;
    if (body.groupId) {
        if (!mongoose.isObjectIdOrHexString(body.groupId)) throw Object.assign(new Error("Invalid folder ID."), { statusCode: 400 });
        // Admin monitoring contacts must never land in a user's visible folder.
        folder = await groupModel.findOne({ _id: body.groupId, userId: adminId, isDeleted: false });
        if (!folder) throw Object.assign(new Error("Choose one of your contact folders."), { statusCode: 404 });
    } else {
        const name = typeof body.newFolderName === "string" ? body.newFolderName.trim() : "";
        if (!name || name.length > 100) throw Object.assign(new Error("Enter a folder name of up to 100 characters."), { statusCode: 400 });
        // Reuse an identically named folder on retries.
        folder = await groupModel.findOne({ userId: adminId, name, isDeleted: false });
        if (!folder) folder = await groupModel.findOneAndUpdate(
            { userId: adminId, name, isDeleted: false, adminFolder: true },
            { $setOnInsert: { userId: adminId, name, description: "Numbers saved by a super admin", adminFolder: true, isDeleted: false } },
            { upsert: true, returnDocument: "after", runValidators: true },
        );
    }
    const existing = await contactModel.find({ groupId: folder._id }).select("phoneNumber").lean();
    const seen = new Set(existing.map((contact) => normalizeTrackedPhone(contact.phoneNumber)));
    const pending = numbers.filter((number) => !seen.has(number));
    let addedCount = 0;
    if (pending.length) {
        try {
            const result = await contactModel.bulkWrite(pending.map((phoneNumber) => ({ updateOne: {
                filter: { groupId: folder._id, phoneNumber },
                update: { $setOnInsert: { userId: adminId, groupId: folder._id, phoneNumber, adminSaved: true } },
                upsert: true,
            } })), { ordered: false });
            addedCount = result.upsertedCount;
        } catch (error) {
            if (!error.writeErrors?.length || error.writeErrors.some((entry) => entry.code !== 11000)) throw error;
            addedCount = error.result?.upsertedCount || 0;
        }
    }
    const totalContacts = await contactModel.countDocuments({ groupId: folder._id });
    await groupModel.updateOne({ _id: folder._id }, { $set: { totalContacts } });
    return { folder: { _id: folder._id, name: folder.name }, addedCount, skippedCount: numbers.length - addedCount };
}
