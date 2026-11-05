import * as contacts from "../shared/campaignContacts.js";
// Uses a temporary replica set. Never reads the application's MongoDB URI.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import User from "./src/models/user.model.js";
import Wallet from "./src/models/wallet.model.js";
import Transaction from "./src/models/transaction.model.js";
import Campaign from "./src/models/campaign.model.js";
import "./src/models/template.model.js";
import CreditOperation from "./src/models/credit-operation.model.js";
import { reconcileWallet, deductCredits, refundCredits } from "./src/helpers/credit.helper.js";
import * as amounts from "./src/helpers/credit-amount.js";
import * as operations from "./src/helpers/credit-operation.js";
import * as visibility from "./src/helpers/campaign-visibility.js";
import * as spreadsheet from "../shared/campaignSpreadsheet.js";
import * as storage from "./src/helpers/spreadsheet-storage.js";
import * as failure from "../shared/campaignFailure.js";

process.env.MONGOMS_DOWNLOAD_DIR ||= fileURLToPath(new URL("./.qa/mongodb-binaries", import.meta.url));
let replica, credits, campaigns, worker, sequence = 0;
const events = [];
const dependencies = {
    mongoose: { default: mongoose },
    "../models/user.model.js": { default: User },
    "../models/wallet.model.js": { default: Wallet },
    "../models/transaction.model.js": { default: Transaction },
    "../models/campaign.model.js": { default: Campaign },
    "../helpers/credit-amount.js": amounts,
    "../helpers/credit-operation.js": operations,
    "../helpers/campaign-visibility.js": visibility,
    "../helpers/credit.helper.js": { reconcileWallet },
    "../helpers/spreadsheet-storage.js": storage,
    "../../../shared/campaignSpreadsheet.js": spreadsheet,
    "../../../shared/campaignFailure.js": failure,
    "../../../shared/campaignContacts.js": contacts,
    "../services/socket.service.js": { notifyUser: (...args) => events.push(args), notifyRole() {}, notifyReseller() {} },
    "../queues/campaign.queue.js": { scheduleCampaignJob() {}, cancelCampaignJob() {} },
    "../config/redis.js": { redisConnection: {} },
    bullmq: { Worker: class {} },
};
async function load(path) {
    const context = vm.createContext({ console: { log() {}, warn() {}, error() {} }, Date, Set, Map, Buffer, process: { env: {} }, setTimeout });
    const module = new vm.SourceTextModule(await readFile(new URL(path, import.meta.url), "utf8"), { context });
    await module.link(async (name) => {
        const exports = dependencies[name] || { default: {} };
        return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
    });
    await module.evaluate();
    return module.namespace;
}
before(async () => {
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    await mongoose.connect(replica.getUri("credit_integrity_test"));
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
    credits = await load("./src/controllers/credit.controller.js");
    campaigns = await load("./src/controllers/campaign.controller.js");
    worker = await load("./src/workers/campaign.worker.js");
}, { timeout: 300000 });
after(async () => { await mongoose.disconnect(); if (replica) await replica.stop(); });

function response() {
    return { code: 200, headers: {}, status(code) { this.code = code; return this; }, set(key, value) { this.headers[key] = value; return this; }, json(body) { this.body = body; return this; } };
}
async function fixture(amount = 100) {
    const suffix = ++sequence;
    const admin = await User.create({ username: `admin${suffix}`, email: `admin${suffix}@test.invalid`, password: "TestPassword123!", role: "Super Admin" });
    const user = await User.create({ username: `user${suffix}`, email: `user${suffix}@test.invalid`, password: "TestPassword123!", role: "User", ratePerMsg: 1 });
    await Wallet.create({ userId: user._id, balance: 0 });
    const invoke = async (handler, body, token = `operation-key-${suffix}-${++sequence}`) => {
        const req = { user: admin, body, query: {}, params: {}, method: "POST", baseUrl: "/api/credits", path: `/${handler}`, get: () => token };
        const res = response();
        await operations.creditRequest(req, res, () => credits[handler](req, res));
        return res;
    };
    const allocation = await invoke("allocateCredits", { toUserId: String(user._id), amount });
    assert.equal(allocation.code, 200, allocation.body?.message);
    return { admin, user, invoke, balance: async () => (await Wallet.findOne({ userId: user._id })).balance };
}

test("integer credit arithmetic rejects sub-cent amounts and non-finite values", () => {
    assert.equal(amounts.creditsForCount(0.1, 3), 0.3);
    for (const amount of [Infinity, NaN, "Infinity", 0.001, "", null]) assert.throws(() => amounts.creditMinor(amount));
    assert.throws(() => amounts.creditsForCount(1, 0.5));
});

test("decimal debits maintain exact minor-unit balances and a balanced ledger", async () => {
    const f = await fixture(1);
    for (let i = 0; i < 10; i++) await deductCredits(f.user._id, 1, null, { directAmount: 0.1 });
    const wallet = await Wallet.findOne({ userId: f.user._id });
    assert.equal(wallet.balance, 0);
    assert.equal(wallet.balanceMinor, 0);
    const entries = await Transaction.find({ $or: [{ fromUser: f.user._id }, { toUser: f.user._id }] });
    assert.equal(entries.length, 11);
    for (const entry of entries) {
        assert.equal(entry.postings.reduce((sum, posting) => sum + posting.deltaMinor, 0), 0);
        for (const posting of entry.postings.filter((row) => row.userId)) assert.equal(posting.balanceBeforeMinor + posting.deltaMinor, posting.balanceAfterMinor);
    }
    assert.equal((await reconcileWallet(f.user._id)).isReconciled, true);
});

test("a ledger insert failure rolls the wallet back and emits no wallet success", async () => {
    const f = await fixture();
    const original = Transaction.create;
    const before = await Transaction.countDocuments();
    const eventCount = events.length;
    try {
        Transaction.create = async () => { throw new Error("Injected ledger failure"); };
        const result = await f.invoke("deductCredits", { userId: String(f.user._id), amount: 25 });
        assert.equal(result.code, 500);
    } finally { Transaction.create = original; }
    assert.equal(await f.balance(), 100);
    assert.equal(await Transaction.countDocuments(), before);
    assert.equal(events.length, eventCount);
    assert.equal((await reconcileWallet(f.user._id)).isReconciled, true);
});

test("simultaneous retries of one request move credits once and return a reusable receipt", async () => {
    const f = await fixture();
    const body = { userId: String(f.user._id), amount: 20 };
    const key = `duplicate-reference-${++sequence}`;
    const results = await Promise.all(Array.from({ length: 6 }, () => f.invoke("deductCredits", body, key)));
    assert(results.some((result) => result.code === 200));
    assert.equal(await f.balance(), 80);
    assert.equal(await Transaction.countDocuments({ fromUser: f.user._id, type: "DEDUCT" }), 1);
    const replay = await f.invoke("deductCredits", body, key);
    assert.equal(replay.code, 200);
    assert.equal(replay.headers["Idempotent-Replayed"], "true");
    const changed = await f.invoke("deductCredits", { ...body, amount: 30 }, key);
    assert.equal(changed.code, 409);
    assert.equal(await f.balance(), 80);
    assert.equal((await reconcileWallet(f.user._id)).isReconciled, true);
});

test("concurrent debits never overdraw a wallet or leave unlogged movements", async () => {
    const f = await fixture(50);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => deductCredits(f.user._id, 1, null, { directAmount: 20 })));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal(await f.balance(), 10);
    assert.equal((await reconcileWallet(f.user._id)).isReconciled, true);
});

test("posted transactions and non-transactional balance replacements are rejected", async () => {
    const f = await fixture();
    await assert.rejects(Transaction.updateOne({ toUser: f.user._id }, { $set: { amount: 1 } }), /cannot be changed/);
    await assert.rejects(Wallet.findOneAndUpdate({ userId: f.user._id }, { $inc: { balance: 1 } }), /active ledger transaction/);
    assert.equal(await f.balance(), 100);
});

async function campaignFixture(count = 30) {
    const f = await fixture(100000);
    const original = Array.from({ length: count }, (_, index) => String(919876540000 + (index % 22)));
    const req = { user: f.user, body: { campaignTitle: "Credit integrity campaign", messageBody: "Hello", recipients: original, schedule: "now" }, params: {}, files: {} };
    const created = response();
    await campaigns.createCampaign(req, created);
    assert.equal(created.code, 201, created.body?.message);
    const campaignId = created.body.data._id;
    const invoke = async (handler, body, actor = f.admin) => {
        const res = response();
        await campaigns[handler]({ user: actor, params: { id: String(campaignId) }, query: {}, body }, res);
        return res;
    };
    const get = () => Campaign.findById(campaignId);
    return { ...f, original, campaignId, invokeCampaign: invoke, get,
        publish: async (notes = "The campaign could not be delivered.") => {
            const saved = await get();
            return invoke("updateCampaignRecipientsManagement", { entries: [], saveMode: "publish", spreadsheetRevision: saved.spreadsheetRevision || 0, reportNotes: notes });
        },
    };
}

test("completion stays private until a report is published, and status toggles do not change credits", async () => {
    const f = await campaignFixture(3);
    for (const status of ["ongoing", "completed", "ongoing", "completed", "ongoing"]) {
        const result = await f.invokeCampaign("updateCampaignStatus", { status });
        assert.equal(result.code, 200, result.body?.message);
        assert.equal(await f.balance(), 99997);
        assert.equal(await Transaction.countDocuments({ campaignId: f.campaignId }), 1);
        if (status === "completed") {
            const ownerView = await f.invokeCampaign("getCampaignById", {}, f.user);
            assert.equal(ownerView.body.data.status, "ongoing");
        }
    }
    const entries = f.original.map((phoneNumber, index) => ({ rowNumber: index + 1, phoneNumber, status: "delivered", billingAction: "keep", tabKey: "delivered", category: "Delivered" }));
    const published = await f.invokeCampaign("updateCampaignRecipientsManagement", { entries, saveMode: "publish", spreadsheetRevision: 0, spreadsheetColumns: spreadsheet.BASE_COLUMNS, status: "completed" });
    assert.equal(published.code, 200, published.body?.message);
    assert.equal((await f.invokeCampaign("getCampaignById", {}, f.user)).body.data.status, "completed");
    assert.equal((await reconcileWallet(f.user._id)).isReconciled, true);
});

test("failure draft is private; publication refunds 28 after 2 already refunded on a 30-credit charge", async () => {
    const f = await campaignFixture();
    await refundCredits(f.user._id, 1, null, { directAmount: 2, campaignId: f.campaignId });
    for (let i = 0; i < 3; i++) assert.equal((await f.invokeCampaign("updateCampaignStatus", { status: "failed" })).code, 200);
    assert.equal(await f.balance(), 99972);
    assert.equal((await f.invokeCampaign("getCampaignById", {}, f.user)).body.data.status, "pending");
    const invalid = await f.publish("");
    assert.equal(invalid.code, 400);
    assert.equal(await f.balance(), 99972);
    const draft = await f.invokeCampaign("updateCampaignRecipientsManagement", { entries: [{ phoneNumber: "attacker-added-contact" }], saveMode: "draft", spreadsheetRevision: 0, reportNotes: "Provider outage prevented delivery." });
    assert.equal(draft.code, 200, draft.body?.message);
    assert.equal(await f.balance(), 99972);
    const draftView = await f.invokeCampaign("getCampaignById", {}, f.user);
    assert.equal(draftView.body.data.status, "pending");
    assert.equal(draftView.body.data.draftReportNotes, undefined);
    const published = await f.publish("Provider outage prevented delivery.");
    assert.equal(published.code, 200, published.body?.message);
    assert.equal(published.body.refundInfo.amount, 28);
    assert.equal(await f.balance(), 100000);
    const ownerView = await f.invokeCampaign("getCampaignById", {}, f.user);
    assert.equal(ownerView.body.data.status, "failed");
    assert.equal(ownerView.body.data.publishedSpreadsheet.notes, "Provider outage prevented delivery.");
    assert.deepEqual(ownerView.body.data.publishedSpreadsheet.rows.map((row) => row.phoneNumber), f.original);
    assert.equal(ownerView.body.data.publishedSpreadsheet.columns.length, 1);
    const repeated = await f.publish("Provider outage prevented delivery.");
    assert.equal(repeated.code, 200, repeated.body?.message);
    assert.equal(repeated.body.refundInfo, null);
    assert.equal(await f.balance(), 100000);
    assert.equal((await reconcileWallet(f.user._id)).isReconciled, true);
    for (const status of ["ongoing", "completed", "pending", "paused"]) assert.equal((await f.invokeCampaign("updateCampaignStatus", { status })).code, 409);
});

test("failure publication rolls back refund, report, and visible status if ledger insertion fails", async () => {
    const f = await campaignFixture();
    await f.invokeCampaign("updateCampaignStatus", { status: "failed" });
    const original = Transaction.create;
    const eventCount = events.length;
    try {
        Transaction.create = async () => { throw new Error("Injected refund ledger failure"); };
        assert.equal((await f.publish()).code, 500);
    } finally { Transaction.create = original; }
    assert.equal(await f.balance(), 99970);
    assert.equal((await f.get()).publishedSpreadsheet, null);
    assert.equal((await f.get()).publicStatus, "pending");
    assert.equal(events.length, eventCount);
    assert.equal(await Transaction.countDocuments({ campaignId: f.campaignId, type: "REFUND" }), 0);
    assert.equal((await reconcileWallet(f.user._id)).isReconciled, true);
});

test("simultaneous failure publications and repeated status clicks produce exactly one full refund", async () => {
    const f = await campaignFixture();
    await f.invokeCampaign("updateCampaignStatus", { status: "failed" });
    const results = await Promise.all(Array.from({ length: 6 }, () => f.publish()));
    assert(results.some((result) => result.code === 200));
    assert.equal(await f.balance(), 100000);
    assert.equal(await Transaction.countDocuments({ campaignId: f.campaignId, type: "REFUND" }), 1);
    for (let i = 0; i < 5; i++) await f.invokeCampaign("updateCampaignStatus", { status: "failed" });
    assert.equal(await f.balance(), 100000);
    assert.equal((await reconcileWallet(f.user._id)).isReconciled, true);
});

test("queued delivery jobs cannot invent results or move campaign credits", async () => {
    const f = await campaignFixture();
    await f.invokeCampaign("updateCampaignStatus", { status: "ongoing" });
    const result = await worker.finalizeCampaignDelivery(f.campaignId);
    assert.equal(result.skipped, true);
    assert.equal((await f.get()).status, "ongoing");
    assert.equal(await f.balance(), 99970);
    assert.equal(await Transaction.countDocuments({ campaignId: f.campaignId }), 1);
});

test("Failed and Completed draft decisions can be changed repeatedly without moving credits", async () => {
    const f = await campaignFixture();
    for (const status of ["failed", "ongoing", "completed", "pending", "failed", "paused", "scheduled", "completed", "ongoing"]) {
        const result = await f.invokeCampaign("updateCampaignStatus", { status });
        assert.equal(result.code, 200, result.body?.message);
        assert.equal((await f.get()).status, status);
        const ownerView = await f.invokeCampaign("getCampaignById", {}, f.user);
        assert.equal(ownerView.code, 200, ownerView.body?.message);
        assert(!["failed", "completed"].includes(ownerView.body.data.status));
        assert.equal(await f.balance(), 99970);
    }
    assert.equal(await Transaction.countDocuments({ campaignId: f.campaignId }), 1);
    assert.equal((await reconcileWallet(f.user._id)).isReconciled, true);
});

test("a published refund cannot be reversed if the creator has spent those credits", async () => {
    const f = await campaignFixture(3);
    const entries = f.original.map((phoneNumber, index) => ({ rowNumber: index + 1, phoneNumber, status: "failed", billingAction: "refund", tabKey: "wrong", category: "Wrong number" }));
    const published = await f.invokeCampaign("updateCampaignRecipientsManagement", { entries, saveMode: "publish", spreadsheetRevision: 0, spreadsheetColumns: spreadsheet.BASE_COLUMNS, status: "completed" });
    assert.equal(published.code, 200, published.body?.message);
    await deductCredits(f.user._id, 1, null, { directAmount: 100000 });
    const before = await Transaction.countDocuments({ campaignId: f.campaignId });
    const reversed = await f.invokeCampaign("updateCampaignRecipientsManagement", { entries: entries.map((row) => ({ ...row, billingAction: "keep", status: "delivered", tabKey: "delivered" })), saveMode: "publish", spreadsheetRevision: 1, spreadsheetColumns: spreadsheet.BASE_COLUMNS, status: "completed" });
    assert.equal(reversed.code, 409, reversed.body?.message);
    assert.equal(await f.balance(), 0);
    assert.equal(await Transaction.countDocuments({ campaignId: f.campaignId }), before);
    assert.equal((await f.get()).publishedSpreadsheet.summary.creditsRefunded, 3);
    assert.equal((await reconcileWallet(f.user._id)).isReconciled, true);
});

test("a missing or altered original charge blocks publication instead of inventing a refund", async () => {
    const f = await campaignFixture();
    await f.invokeCampaign("updateCampaignStatus", { status: "failed" });
    // Inject a corrupt cached campaign amount without modifying the real ledger.
    await Campaign.collection.updateOne({ _id: f.campaignId }, { $set: { creditsDeducted: 31 } });
    const result = await f.publish();
    assert.equal(result.code, 409);
    assert.equal(await f.balance(), 99970);
    assert.equal(await Transaction.countDocuments({ campaignId: f.campaignId, type: "REFUND" }), 0);
});
