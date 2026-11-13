import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import campaignModel from "../models/campaign.model.js";
import userModel from "../models/user.model.js";
import trackedNumberModel from "../models/trackedNumber.model.js";
import groupModel from "../models/group.model.js";
import contactModel from "../models/contact.model.js";
import { campaignTracking, trackingCampaign } from "./recipient-tracking.service.js";
import { saveContactFolder, saveCampaignContactFolder } from "./contact-folder.service.js";
import { getGroups, getGroupById, deleteGroup } from "../controllers/group.controller.js";
import { getContacts, createContact, importContactsFromFile, exportContactsToCSV } from "../controllers/contact.controller.js";
import { normalizeTrackedPhone, parseTrackedPhones } from "../helpers/recipient-tracking.js";
import { addTrackedNumbers, getTrackedNumbers, saveTrackedContacts, saveFolderContacts, updateTrackedNote } from "../controllers/recipient-tracking.controller.js";

let mongo;
const oid = () => new mongoose.Types.ObjectId();
const admin = { _id: oid(), role: "Super Admin" };
const ownerId = oid();
const otherOwnerId = oid();
const profilePhone = "919000000001";
let campaigns;
const repeated = Array.from({ length: 500 }, (_, index) => `9198${String(index).padStart(8, "0")}`);

before(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([trackedNumberModel.init(), groupModel.init(), contactModel.init()]);
    // Direct insertion avoids unrelated campaign notification/credit hooks.
    await userModel.collection.insertMany([
        { _id: admin._id, username: "Admin", email: "admin@example.test", role: "Super Admin" },
        { _id: ownerId, username: "User A", email: "user-a@example.test", phone: `+${profilePhone}`, role: "User" },
        { _id: otherOwnerId, username: "User B", email: "user-b@example.test", role: "User" },
    ]);
    campaigns = Array.from({ length: 6 }, (_, index) => ({
        _id: oid(), userId: ownerId, createdAt: new Date(Date.UTC(2026, 0, index + 1)), status: "pending",
        originalRecipients: [...repeated, ...Array.from({ length: 2500 }, (_, row) => `917${index}${String(row).padStart(8, "0")}`), repeated[0]],
        recipients: [{ phoneNumber: "919111111111" }],
        recipientEntries: [{ phoneNumber: "919222222222" }],
    }));
    campaigns[0].originalRecipients.push(profilePhone);
    await campaignModel.collection.insertMany([
        ...campaigns,
        { _id: oid(), userId: ownerId, createdAt: new Date(Date.UTC(2026, 0, 1, 1)), status: "draft", originalRecipients: campaigns[1].originalRecipients },
        { _id: oid(), userId: otherOwnerId, createdAt: new Date(Date.UTC(2025, 0, 1)), status: "completed", originalRecipients: campaigns[1].originalRecipients },
    ]);
});

after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

const invoke = async (handler, body = {}, user = admin, id = campaigns[4]._id.toString(), phoneNumber, query = {}, file) => {
    let status = 200, value;
    await handler({ user, params: { id, phoneNumber }, body, query, file }, { status(code) { status = code; return this; }, json(data) { value = data; return this; }, setHeader() { return this; }, send(data) { value = data; return this; } });
    return { status, body: value };
};

test("normalization ignores formatting without guessing country codes or accepting text", () => {
    assert.equal(normalizeTrackedPhone("+91 (9000) 000-001"), profilePhone);
    assert.notEqual(normalizeTrackedPhone("9000000001"), profilePhone);
    assert.equal(normalizeTrackedPhone("abc919000000001"), "");
    assert.equal(normalizeTrackedPhone("123"), "");
    assert.deepEqual(parseTrackedPhones(`+${profilePhone}\n${profilePhone},919000000002`), [profilePhone, "919000000002"]);
    assert.throws(() => parseTrackedPhones([null]), /7 to 15 digits/);
    assert.throws(() => parseTrackedPhones([]), /between 1/);
});

test("campaign one establishes a baseline and includes the profile phone", async () => {
    const data = await campaignTracking(campaigns[0]);
    assert.equal(data.baseline, true);
    assert.equal(data.totalCampaigns, 1);
    assert.equal(data.totalUserCampaigns, 6, "The user total includes later submitted campaigns but excludes drafts and other users");
    assert.equal(data.rows.filter((row) => row.repeated).length, 0);
    assert.deepEqual(data.rows.map((row) => [row.phoneNumber, row.userPhone, row.campaignCount, row.inCampaign]), [[profilePhone, true, 1, true]]);
});

test("campaign two finds 500 repeats, ignores drafts, other users, duplicates and edited report rows", async () => {
    const data = await campaignTracking(campaigns[1]);
    assert.equal(data.totalCampaigns, 2);
    const overlaps = data.rows.filter((row) => row.repeated);
    assert.equal(overlaps.length, 500);
    assert(overlaps.every((row) => row.campaignCount === 2));
    assert(!data.rows.some((row) => ["919111111111", "919222222222"].includes(row.phoneNumber)));
    assert.equal(data.rows.find((row) => row.userPhone).inCampaign, false);
});

test("cross-account overlap never qualifies as repetition", async () => {
    const personA = oid(), personB = oid(), phone = "919300000001";
    const otherPerson = { _id: oid(), userId: personB, status: "completed", createdAt: new Date("2026-03-01T00:00:00Z"), originalRecipients: [phone] };
    const first = { _id: oid(), userId: personA, status: "pending", createdAt: new Date("2026-03-02T00:00:00Z"), originalRecipients: [phone, phone] };
    await campaignModel.collection.insertMany([otherPerson, first]);
    const initial = await campaignTracking(first);
    assert.equal(initial.totalCampaigns, 1);
    assert.equal(initial.totalUserCampaigns, 1);
    assert.equal(initial.rows.filter((row) => row.repeated).length, 0, "Another user's campaign and duplicates within one upload must not qualify");
    const second = { ...first, _id: oid(), createdAt: new Date("2026-03-03T00:00:00Z"), originalRecipients: [phone] };
    await campaignModel.collection.insertOne(second);
    const repeatedData = await campaignTracking(second);
    assert.equal(repeatedData.rows.length, 1);
    assert.equal(repeatedData.rows[0].repeated, true);
    assert.equal(repeatedData.rows[0].campaignCount, 2);
    assert.equal(repeatedData.totalUserCampaigns, 2);
    assert.equal((await campaignTracking(otherPerson)).rows.filter((row) => row.repeated).length, 0);
});

test("campaign five counts 5 of 5 while ignoring future campaigns", async () => {
    const data = await campaignTracking(campaigns[4]);
    assert.equal(data.totalCampaigns, 5);
    assert.equal(data.rows.filter((row) => row.repeated).length, 500);
    assert(data.rows.filter((row) => row.repeated).every((row) => row.campaignCount === 5));
    assert.equal(await contactModel.countDocuments(), 0, "Detection must never automatically create contacts");
});

test("legacy campaigns use recipients and timestamps with tied ObjectIds have deterministic order", async () => {
    const userId = oid();
    const first = { _id: oid(), userId, status: "failed", createdAt: new Date(Date.UTC(2026, 1, 1)), recipients: [{ phoneNumber: "+919333333333" }, { phoneNumber: "919333333333" }] };
    const second = { ...first, _id: oid(), status: "stopped", recipients: [{ phoneNumber: "919333333333" }] };
    await campaignModel.collection.insertMany([first, second]);
    const data = await campaignTracking(second);
    assert.equal(data.totalCampaigns, 2);
    assert.equal(data.rows[0].campaignCount, 2);
    assert.equal(data.rows[0].repeated, true);
});

test("manual numbers persist per user across campaigns and are not added as recipients", async () => {
    const manualPhone = "919777777777";
    const first = await invoke(addTrackedNumbers, { phoneNumbers: [manualPhone, repeated[0]], note: "Test number" });
    assert.equal(first.status, 201);
    await invoke(addTrackedNumbers, { phoneNumbers: [manualPhone], note: "Duplicate must preserve original note" });
    assert.equal(await trackedNumberModel.countDocuments({ userId: ownerId, phoneNumber: manualPhone }), 1);
    const data = await campaignTracking(campaigns[5]);
    const manual = data.rows.find((row) => row.phoneNumber === manualPhone);
    assert.equal(manual.manual, true);
    assert.equal(manual.inCampaign, false);
    assert.equal(manual.note, "Test number");
    assert.equal(data.rows.find((row) => row.phoneNumber === repeated[0]).manual, true);
    const stored = await campaignModel.findById(campaigns[4]._id).lean();
    assert(!stored.originalRecipients.includes(manualPhone));
    assert(!(await campaignTracking({ ...campaigns[5], userId: otherOwnerId })).rows.some((row) => row.phoneNumber === manualPhone));
});

test("selected numbers save explicitly to an admin-owned folder, with duplicate skipping", async () => {
    const saved = await invoke(saveTrackedContacts, { phoneNumbers: [repeated[0], profilePhone], newFolderName: "User A" });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.addedCount, 2);
    const folderId = saved.body.data.folder._id;
    const folder = await groupModel.findById(folderId).lean();
    assert.equal(String(folder.userId), String(admin._id));
    assert.equal(folder.name, "User A");
    assert.equal(String(folder.sourceUserId), String(ownerId));
    const again = await invoke(saveTrackedContacts, { phoneNumbers: [repeated[0], repeated[1]], groupId: String(folderId) });
    assert.equal(again.body.data.addedCount, 1);
    assert.equal(again.body.data.skippedCount, 1);
    assert.equal(await contactModel.countDocuments({ groupId: folderId }), 3);
    assert.equal((await groupModel.findById(folderId)).totalContacts, 3);
    assert.equal(await contactModel.countDocuments({ userId: ownerId }), 0, "Admin saved contacts must not be user-owned");
    const retry = await saveContactFolder(admin._id, { phoneNumbers: [repeated[0]], newFolderName: "User A" });
    assert.equal(String(retry.folder._id), String(folderId));
    assert.equal(retry.addedCount, 0);
});

test("inline notes can be added, edited and cleared for eligible numbers only", async () => {
    const number = repeated[2];
    assert.equal((await invoke(updateTrackedNote, { note: "  Owner test number  " }, admin, undefined, number)).status, 200);
    const record = await trackedNumberModel.findOne({ userId: ownerId, phoneNumber: number }).lean();
    assert.equal(record.note, "Owner test number");
    assert.equal(String(record.addedBy), String(admin._id));
    await invoke(updateTrackedNote, { note: "Updated note" }, admin, undefined, number);
    assert.equal((await trackedNumberModel.findById(record._id)).note, "Updated note");
    await invoke(updateTrackedNote, { note: "" }, admin, undefined, number);
    assert.equal((await trackedNumberModel.findById(record._id)).note, "");
    for (const role of ["User", "Reseller"]) {
        assert.equal((await invoke(updateTrackedNote, { note: "blocked" }, { _id: ownerId, role }, undefined, number)).status, 403);
    }
    assert.equal((await invoke(updateTrackedNote, { note: "x".repeat(501) }, admin, undefined, number)).status, 400);
    assert.equal((await invoke(updateTrackedNote, {}, admin, undefined, number)).status, 400);
    assert.equal((await invoke(updateTrackedNote, { note: "invalid" }, admin, undefined, "bad")).status, 400);
    assert.equal((await invoke(updateTrackedNote, { note: "unrelated" }, admin, undefined, "919222222222")).status, 400);
    assert.equal(await trackedNumberModel.countDocuments({ phoneNumber: "919222222222" }), 0);
    assert.equal(await trackedNumberModel.countDocuments({ userId: otherOwnerId, phoneNumber: number }), 0);
});

test("Contacts page can add manual numbers to existing folders without duplicating formatted contacts", async () => {
    const folder = await groupModel.create({ userId: admin._id, name: "Manual folder", description: "Admin folder" });
    await contactModel.create({ userId: admin._id, groupId: folder._id, phoneNumber: "+91 95555 55555" });
    const saved = await invoke(saveFolderContacts, { phoneNumbers: ["919555555555", "919666666666"], groupId: String(folder._id) });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.data.addedCount, 1);
    assert.equal(saved.body.data.skippedCount, 1);
});

test("concurrent saves reuse the same folder and never duplicate numbers", async () => {
    const phoneNumbers = ["919400000001", "919400000002"];
    const results = await Promise.all(Array.from({ length: 8 }, () => saveContactFolder(admin._id, { phoneNumbers, newFolderName: "Concurrent folder" })));
    const folderIds = new Set(results.map((result) => String(result.folder._id)));
    assert.equal(folderIds.size, 1);
    assert.equal(await groupModel.countDocuments({ userId: admin._id, name: "Concurrent folder" }), 1);
    assert.equal(await contactModel.countDocuments({ groupId: [...folderIds][0] }), 2);
    assert.equal(results.reduce((count, result) => count + result.addedCount, 0), 2);
});

test("campaign folders use stable user IDs, including concurrent saves and duplicate usernames", async () => {
    const personA = oid(), personB = oid(), resellerId = oid();
    await userModel.collection.insertMany([
        { _id: resellerId, username: "Reseller Partner", email: "partner@example.test", role: "Reseller" },
        { _id: personA, username: "Same name", email: "same-a@example.test", role: "User", resellerId },
        { _id: personB, username: "Same name", email: "same-b@example.test", role: "User" },
    ]);
    const numbers = ["919500000001"];
    const results = await Promise.all(Array.from({ length: 6 }, () => saveCampaignContactFolder(admin._id, personA, "Same name", numbers)));
    assert.equal(new Set(results.map((result) => String(result.folder._id))).size, 1);
    assert.equal(results.reduce((count, result) => count + result.addedCount, 0), 1);
    const second = await saveCampaignContactFolder(admin._id, personB, "Same name", numbers);
    assert.notEqual(String(second.folder._id), String(results[0].folder._id));
    assert.equal(second.folder.name, "Same name");
    const groups = await invoke(getGroups, {}, admin, undefined, undefined, { owned: "true" });
    const sourceFolders = groups.body.data.filter((folder) => [String(personA), String(personB)].includes(String(folder.sourceUserId?._id)));
    assert.equal(sourceFolders.length, 2);
    assert(sourceFolders.every((folder) => folder.sourceUserId.username === "Same name" && folder.totalContacts === 1));
    assert.equal(new Set(sourceFolders.map((folder) => folder.sourceUserId.email)).size, 2);
    assert.equal(sourceFolders.find((folder) => String(folder.sourceUserId._id) === String(personA)).sourceUserId.resellerId.username, "Reseller Partner");
    assert(!sourceFolders.find((folder) => String(folder.sourceUserId._id) === String(personB)).sourceUserId.resellerId);
});

test("drafts are not counted and an empty immutable upload never falls back to edited recipients", async () => {
    const draft = { ...campaigns[4], status: "draft" };
    const draftData = await campaignTracking(draft);
    assert.equal(draftData.totalCampaigns, 4);
    assert(!draftData.rows.some((row) => row.repeated));
    const empty = await campaignTracking({ ...campaigns[4], originalRecipients: [] });
    assert(!empty.rows.some((row) => row.inCampaign));
});

test("tracking and saving reject non-admins, malformed inputs and folders belonging to users", async () => {
    for (const role of ["User", "Reseller"]) {
        for (const handler of [getTrackedNumbers, addTrackedNumbers, saveTrackedContacts, saveFolderContacts]) {
            const response = await invoke(handler, {}, { _id: ownerId, role });
            assert.equal(response.status, 403);
        }
    }
    const folder = await groupModel.create({ userId: ownerId, name: "User folder", description: "User visible" });
    const foreign = await invoke(saveFolderContacts, { phoneNumbers: [repeated[0]], groupId: String(folder._id) });
    assert.equal(foreign.status, 404);
    const campaignSave = await invoke(saveTrackedContacts, { phoneNumbers: [repeated[0]], groupId: String(folder._id), newFolderName: "Wrong folder", sourceUserId: String(otherOwnerId) });
    assert.equal(campaignSave.status, 200);
    assert.equal(campaignSave.body.data.folder.name, "User A");
    assert.equal(campaignSave.body.data.folder.sourceUserId, String(ownerId));
    assert.equal(await contactModel.countDocuments({ groupId: folder._id }), 0);
    await contactModel.create({ userId: ownerId, groupId: folder._id, phoneNumber: "919123451234" });
    const ownContacts = await invoke(getContacts, {}, admin, undefined, undefined, { owned: "true" });
    assert(ownContacts.body.data.every((contact) => String(contact.userId._id) === String(admin._id)));
    const ownFolders = await invoke(getGroups, {}, admin, undefined, undefined, { owned: "true" });
    assert(ownFolders.body.data.every((group) => String(group.userId._id) === String(admin._id)));
    const unrelated = await invoke(saveTrackedContacts, { phoneNumbers: ["919888888888"], newFolderName: "Invalid selection" });
    assert.equal(unrelated.status, 400);
    assert.equal(await groupModel.countDocuments({ name: "Invalid selection" }), 0);
    assert.equal((await invoke(addTrackedNumbers, { phoneNumbers: ["bad"] })).status, 400);
    assert.equal((await invoke(addTrackedNumbers, { phoneNumbers: [profilePhone], note: "x".repeat(501) })).status, 400);
    assert.equal((await invoke(getTrackedNumbers, {}, admin, "bad-id")).status, 400);
    assert.equal((await invoke(getTrackedNumbers, {}, admin, oid().toString())).status, 404);
    await assert.rejects(trackingCampaign("invalid"), /Invalid campaign/);
});

test("deleting folders preserves shared numbers without unique-index conflicts", async () => {
    const phoneNumber = "919699999991";
    const first = await saveContactFolder(admin._id, { newFolderName: "Delete folder A", phoneNumbers: [phoneNumber] });
    const second = await saveContactFolder(admin._id, { newFolderName: "Delete folder B", phoneNumbers: [phoneNumber] });
    assert.equal((await invoke(deleteGroup, {}, { _id: ownerId, role: "User" }, String(first.folder._id))).status, 403);
    for (const result of [first, second]) {
        assert.equal((await invoke(deleteGroup, {}, admin, String(result.folder._id))).status, 200);
        assert.equal((await groupModel.findById(result.folder._id)).isDeleted, true);
    }
    const contacts = await contactModel.find({ userId: admin._id, phoneNumber }).lean();
    assert.equal(contacts.length, 2);
    assert(contacts.every((contact) => contact.groupId === null && contact.adminSaved === false));
    const saved = await invoke(getContacts, {}, admin, undefined, undefined, { saved: "true" });
    assert.equal(saved.body.data.filter((contact) => contact.phoneNumber === phoneNumber).length, 2);
});

test("saved contact list and CSV exclude unrelated report records but retain explicit saves, manual additions and imports", async () => {
    const viewer = { _id: oid(), role: "Super Admin" };
    await userModel.collection.insertOne({ _id: viewer._id, username: "Contact viewer", email: "contact-viewer@example.test", role: "Super Admin" });
    const reportNumber = "917458963214", promotedNumber = "918563217978";
    await contactModel.create([
        { userId: viewer._id, phoneNumber: reportNumber, tags: ["Delivered / Valid Numbers"] },
        { userId: viewer._id, phoneNumber: promotedNumber, tags: ["Not on WhatsApp Numbers"] },
        { userId: admin._id, phoneNumber: "919810000001", savedToContacts: true },
        { userId: viewer._id, phoneNumber: "919810000002", adminSaved: true },
    ]);
    const folder = await saveContactFolder(viewer._id, { newFolderName: "Saved contacts", phoneNumbers: ["919810000003"] });
    assert.equal((await invoke(createContact, { phoneNumber: "919810000004" }, viewer)).status, 201);
    const imported = await invoke(importContactsFromFile, {}, viewer, undefined, undefined, {}, {
        buffer: Buffer.from(`Phone,Name\n919810000005,Imported\n${promotedNumber},Explicitly imported again\n`), originalname: "contacts.csv",
    });
    assert.equal(imported.status, 200);
    assert.equal(imported.body.summary.importedCount, 1);
    const query = { owned: "true", saved: "true" };
    const saved = await invoke(getContacts, {}, viewer, undefined, undefined, query);
    const expected = [promotedNumber, "919810000002", "919810000003", "919810000004", "919810000005"].sort();
    assert.deepEqual(saved.body.data.map((contact) => contact.phoneNumber).sort(), expected);
    const csv = await invoke(exportContactsToCSV, {}, viewer, undefined, undefined, query);
    assert.equal(csv.status, 200);
    assert(!csv.body.includes(reportNumber));
    assert(!csv.body.includes("919810000001"));
    for (const phone of expected) assert(csv.body.includes(phone));
    const legacy = await invoke(getContacts, {}, viewer, undefined, undefined, { owned: "true" });
    assert(legacy.body.data.some((contact) => contact.phoneNumber === reportNumber), "Filtering must not delete historical contacts");
    await invoke(deleteGroup, {}, viewer, String(folder.folder._id));
    const afterDelete = await invoke(getContacts, {}, viewer, undefined, undefined, query);
    assert(afterDelete.body.data.some((contact) => contact.phoneNumber === "919810000003"));
});

test("explicitly saving an existing formatted number marks only the selected contact for All numbers", async () => {
    const folder = await groupModel.create({ userId: admin._id, name: "Legacy selections", description: "Legacy report contacts" });
    await contactModel.create([
        { userId: admin._id, groupId: folder._id, phoneNumber: "+91 98100 00006" },
        { userId: admin._id, groupId: folder._id, phoneNumber: "919810000007" },
    ]);
    const saved = await saveContactFolder(admin._id, { groupId: String(folder._id), phoneNumbers: ["919810000006"] });
    assert.equal(saved.addedCount, 0);
    assert.equal(saved.skippedCount, 1);
    const list = await invoke(getContacts, {}, admin, undefined, undefined, { saved: "true", groupId: String(folder._id) });
    assert.deepEqual(list.body.data.map((contact) => contact.phoneNumber), ["+91 98100 00006"]);
});

test("folder pagination covers all folders and searches names, resellers and numbers across pages", async () => {
    const pageAdmin = { _id: oid(), role: "Super Admin" };
    await userModel.collection.insertOne({ _id: pageAdmin._id, username: "Page Admin", email: "page-admin@example.test", role: "Super Admin" });
    const projects = await Promise.all(Array.from({ length: 25 }, (_, index) => saveContactFolder(pageAdmin._id, {
        newFolderName: `Project ${String(index + 1).padStart(2, "0")}`,
        phoneNumbers: [`91971${String(index).padStart(7, "0")}`, "919720000001", "919720000002"],
    })));
    const source = await userModel.findOne({ email: "same-a@example.test" }).lean();
    await groupModel.updateOne({ _id: projects[0].folder._id }, { $set: { sourceUserId: source._id } });
    const page = (number, search = "") => invoke(getGroups, {}, pageAdmin, undefined, undefined, { owned: "true", page: String(number), limit: "12", search });
    const results = await Promise.all([page(1), page(2), page(3)]);
    assert.deepEqual(results.map((result) => result.body.data.length), [12, 12, 1]);
    assert.equal(new Set(results.flatMap((result) => result.body.data.map((folder) => String(folder._id)))).size, 25);
    assert(results.every((result) => result.body.pagination.total === 25 && result.body.pagination.totalPages === 3));
    assert(results.flatMap((result) => result.body.data).every((folder) => folder.totalContacts === 3 && folder.previewNumbers.length === 2));
    for (const search of ["Project 01", "Reseller Partner", "same-a@example.test", "919710000000"]) {
        const found = await page(1, search);
        assert.equal(found.body.pagination.total, 1);
        assert.equal(String(found.body.data[0]._id), String(projects[0].folder._id));
    }
    const clamped = await page(999);
    assert.equal(clamped.body.pagination.page, 3);
    const lastFolderId = String(clamped.body.data[0]._id);
    const deletedId = lastFolderId === String(projects[0].folder._id) ? String(projects[1].folder._id) : lastFolderId;
    await invoke(deleteGroup, {}, pageAdmin, deletedId);
    const afterDelete = await page(999);
    assert.equal(afterDelete.body.pagination.page, 2);
    assert.equal(afterDelete.body.pagination.total, 24);
    assert.equal(afterDelete.body.data.length, 12);
    const detail = await invoke(getGroupById, {}, pageAdmin, String(projects[0].folder._id));
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.sourceUserId.resellerId.username, "Reseller Partner");
    assert.equal((await invoke(getGroupById, {}, admin, String(projects[0].folder._id))).status, 404);
    assert.equal((await invoke(getGroupById, {}, { _id: ownerId, role: "User" }, String(projects[0].folder._id))).status, 403);
    assert.equal((await invoke(getGroups, {}, pageAdmin, undefined, undefined, { page: "0", limit: "12" })).status, 400);
    assert.equal((await invoke(getGroups, {}, pageAdmin, undefined, undefined, { page: "1", limit: "101" })).status, 400);
    await saveContactFolder(pageAdmin._id, { newFolderName: "Literal [folder]", phoneNumbers: ["919730000001"] });
    assert.equal((await page(1, "[folder]")).body.pagination.total, 1);
});
