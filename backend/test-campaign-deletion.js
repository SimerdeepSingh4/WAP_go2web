// Uses an isolated replica set, never the application's database or queue.
import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import Campaign from "./src/models/campaign.model.js";
import User from "./src/models/user.model.js";
import Wallet from "./src/models/wallet.model.js";
import Transaction from "./src/models/transaction.model.js";
import { reconcileWallet } from "./src/helpers/credit.helper.js";
import * as amounts from "./src/helpers/credit-amount.js";

process.env.MONGOMS_DOWNLOAD_DIR ||= fileURLToPath(new URL("./.qa/mongodb-binaries", import.meta.url));
let replica;
const admin = { _id: new mongoose.Types.ObjectId(), role: "Super Admin" };

before(async () => {
    process.env.AUDIT_SIGNING_KEY = "isolated-deletion-test-key-at-least-32-bytes";
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    await mongoose.connect(replica.getUri("campaign_deletion_test"));
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}, { timeout: 300000 });
after(async () => { await mongoose.disconnect(); if (replica) await replica.stop(); });

async function fixture({ status = "pending", published = false } = {}) {
    const owner = await User.create({ username: "Campaign owner", email: `${randomUUID()}@example.test`, password: "TestPassword123!", role: "User" });
    let campaign;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            await Wallet.create([{ userId: owner._id, balance: 100 }], { session });
            await Transaction.create([{ type: "ALLOCATE", amount: 100, toUser: owner._id, performedBy: admin._id, balanceAfterTo: 100 }], { session });
            const wallet = await Wallet.findOneAndUpdate({ userId: owner._id }, { $inc: { balance: -30 } }, { returnDocument: "after", session });
            [campaign] = await Campaign.create([{
                userId: owner._id, campaignTitle: "Report required", status, creditsDeducted: 30,
                ...(published ? { publishedSpreadsheet: { publishedAt: new Date(), publishedBy: admin._id } } : {}),
            }], { session });
            await Transaction.create([{ type: "DEDUCT", amount: 30, campaignId: campaign._id, fromUser: owner._id, toUser: owner._id, performedBy: owner._id, balanceAfterFrom: wallet.balance, balanceAfterTo: wallet.balance }], { session });
        }, amounts.creditTransactionOptions);
    } finally { await session.endSession(); }
    return { owner, campaign };
}

async function controller(onRead) {
    const source = await readFile(new URL("./src/controllers/campaign.controller.js", import.meta.url), "utf8");
    const queueCalls = [];
    const dependencies = {
        mongoose: { default: mongoose },
        "../models/campaign.model.js": { default: {
            findById: (id) => ({ session: async (session) => {
                const campaign = await Campaign.findById(id).session(session);
                await onRead?.(campaign);
                return campaign;
            } }),
            deleteOne: (...args) => Campaign.deleteOne(...args),
        } },
        "../models/user.model.js": { default: User },
        "../helpers/credit-amount.js": amounts,
        "../queues/campaign.queue.js": { scheduleCampaignJob() {}, cancelCampaignJob: async (id) => { queueCalls.push(String(id)); } },
        // Any attempt to change credits during deletion is a test failure.
        "../models/wallet.model.js": { default: new Proxy({}, { get() { throw Error("Deletion must not touch wallets"); } }) },
        "../models/transaction.model.js": { default: new Proxy({}, { get() { throw Error("Deletion must not touch the credit ledger"); } }) },
    };
    const imports = new Map([...source.matchAll(/import\s+([^;]+?)\s+from\s+["']([^"']+)["'];/g)].map(([, clause, name]) => [name, clause.trim()]));
    const module = new vm.SourceTextModule(source, { context: vm.createContext({ console: { error() {}, warn() {} }, Date, Map, Set, Buffer }) });
    await module.link(async (name) => {
        // Other controller imports are unused by deletion and stay inert.
        const clause = imports.get(name);
        const exports = dependencies[name] || (clause.startsWith("{")
            ? Object.fromEntries(clause.slice(1, -1).split(",").map((part) => [part.trim().split(/\s+as\s+/)[0], () => {}]))
            : { default: {} });
        return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context: module.context });
    });
    await module.evaluate();
    return { remove: module.namespace.deleteCampaign, queueCalls };
}

function response() { return { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }

for (const status of ["pending", "ongoing", "failed", "completed"]) {
    test(`deletion of ${status} without a published report is blocked without financial or queue changes`, async () => {
        const { campaign, owner } = await fixture({ status });
        const { remove, queueCalls } = await controller();
        const res = response();
        await remove({ user: admin, params: { id: campaign._id } }, res);
        assert.equal(res.code, 409);
        assert.equal(res.body.code, "CAMPAIGN_REPORT_REQUIRED");
        assert(await Campaign.exists({ _id: campaign._id }));
        assert.equal((await Wallet.findOne({ userId: owner._id })).balance, 70);
        assert.equal(queueCalls.length, 0);
    });
}

test("published report allows deletion while preserving settled credits and the ledger", async () => {
    const { campaign, owner } = await fixture({ status: "completed", published: true });
    const before = await Transaction.find({ toUser: owner._id }).lean();
    const { remove, queueCalls } = await controller();
    const res = response();
    await remove({ user: admin, params: { id: campaign._id } }, res);
    assert.equal(res.code, 200);
    assert.equal(await Campaign.exists({ _id: campaign._id }), null);
    assert.deepEqual(await Transaction.find({ toUser: owner._id }).lean(), before);
    assert.equal((await Wallet.findOne({ userId: owner._id })).balance, 70);
    assert.equal((await reconcileWallet(owner._id)).isReconciled, true);
    assert.deepEqual(queueCalls, [String(campaign._id)]);
});

test("a concurrent report change triggers a retry and rechecks report eligibility", async () => {
    const { campaign } = await fixture({ status: "completed", published: true });
    let reads = 0;
    const { remove, queueCalls } = await controller(async (current) => {
        if (++reads === 1) await Campaign.updateOne({ _id: current._id }, { $unset: { "publishedSpreadsheet.publishedAt": 1 } });
    });
    const res = response();
    await remove({ user: admin, params: { id: campaign._id } }, res);
    assert.equal(res.code, 409);
    assert(reads >= 2);
    assert(await Campaign.exists({ _id: campaign._id }));
    assert.equal(queueCalls.length, 0);
});

test("a draft or summary timestamp alone cannot unlock deletion", async () => {
    const { campaign } = await fixture({ status: "failed" });
    campaign.campaignSummary = { reportedAt: new Date(), creditsRefunded: 30 };
    await campaign.save();
    const { remove } = await controller();
    const res = response();
    await remove({ user: admin, params: { id: campaign._id } }, res);
    assert.equal(res.code, 409);
    assert(await Campaign.exists({ _id: campaign._id }));
});

test("deletion keeps both refunds and refund reversals without returning credits again", async () => {
    const { campaign, owner } = await fixture({ status: "ongoing", published: true });
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            for (const delta of [12, -6]) {
                const wallet = await Wallet.findOneAndUpdate({ userId: owner._id }, { $inc: { balance: delta } }, { returnDocument: "after", session });
                await Transaction.create([{
                    type: delta > 0 ? "REFUND" : "DEDUCT", amount: Math.abs(delta),
                    campaignId: campaign._id, refundOperationId: new mongoose.Types.ObjectId(),
                    fromUser: delta < 0 ? owner._id : null, toUser: owner._id, performedBy: admin._id,
                    balanceAfterFrom: delta < 0 ? wallet.balance : null, balanceAfterTo: wallet.balance,
                }], { session });
            }
        }, amounts.creditTransactionOptions);
    } finally { await session.endSession(); }
    const before = await Transaction.find({ toUser: owner._id }).lean();
    const { remove } = await controller();
    const res = response();
    await remove({ user: admin, params: { id: campaign._id } }, res);
    assert.equal(res.code, 200);
    assert.equal((await Wallet.findOne({ userId: owner._id })).balance, 76);
    assert.deepEqual(await Transaction.find({ toUser: owner._id }).lean(), before);
    assert.equal((await reconcileWallet(owner._id)).isReconciled, true);
});

test("unrelated users cannot delete a reported campaign", async () => {
    const { campaign } = await fixture({ published: true });
    const { remove } = await controller();
    const res = response();
    await remove({ user: { _id: new mongoose.Types.ObjectId(), role: "User" }, params: { id: campaign._id } }, res);
    assert.equal(res.code, 403);
    assert(await Campaign.exists({ _id: campaign._id }));
});
