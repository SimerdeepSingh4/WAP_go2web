import * as contacts from "../shared/campaignContacts.js";
import * as visibility from "./src/helpers/campaign-visibility.js";
import * as failure from "../shared/campaignFailure.js";
import * as creditAmounts from "./src/helpers/credit-amount.js";
import * as spreadsheet from "../shared/campaignSpreadsheet.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import mongoose from "mongoose";

async function loadModule(path, dependencies) {
    const context = vm.createContext({
        console: { log() {}, warn() {}, error() {} }, process: { env: {} },
        Date, Set, Map, Buffer, setTimeout,
    });
    const module = new vm.SourceTextModule(await readFile(new URL(path, import.meta.url), "utf8"), { context });
    await module.link(async (name) => {
        const exports = (name === "../../../shared/campaignContacts.js" ? contacts : null) || (name === "../helpers/campaign-visibility.js" ? visibility : name === "../../../shared/campaignFailure.js" ? failure : null) || (name === "../helpers/credit-amount.js" ? creditAmounts : name === "../helpers/credit-operation.js" ? { startCreditSession: () => dependencies.mongoose.default.startSession(), saveCreditReceipt: async () => {} } : dependencies[name]) || (name === "mongoose" ? { default: { startSession: async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} }) } } : null) || (name === "../../../shared/campaignSpreadsheet.js" ? spreadsheet : name === "../helpers/spreadsheet-storage.js" ? { loadSpreadsheetRows: async () => [], saveSpreadsheetRows: async () => {} } : { default: {} });
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        }, { context });
    });
    await module.evaluate();
    return module.namespace;
}

async function fixture({ failSave = false } = {}) {
    const calls = [];
    let balance = 100;
    let settledRefund = 0;
    const ledger = [];
    const campaign = {
        _id: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
        status: "pending", creditsDeducted: 0, campaignSummary: {},
        save: async () => { calls.push("save"); if (failSave) throw new Error("Save failed"); },
    };
    const session = {
        startTransaction() {}, async commitTransaction() {}, async abortTransaction() {}, endSession() {},
        async withTransaction(callback) {
            const previous = { status: campaign.status, summary: { ...campaign.campaignSummary }, balance, length: ledger.length };
            try { return await callback(); }
            catch (error) {
                campaign.status = previous.status; campaign.campaignSummary = previous.summary;
                balance = previous.balance; ledger.length = previous.length;
                throw error;
            }
        },
    };
    const query = (value) => ({ session: async () => value, then: (resolve) => Promise.resolve(value).then(resolve) });
    const controller = await loadModule("./src/controllers/campaign.controller.js", {
        mongoose: { default: { Types: mongoose.Types, startSession: async () => session } },
        "../models/campaign.model.js": { default: {
            create: async ([record]) => [{ ...record, _id: campaign._id }],
            findById: () => query(campaign),
        } },
        "../models/user.model.js": { default: { findById: () => query({ ratePerMsg: 12 }) } },
        "../models/wallet.model.js": { default: {
            findOne: () => query({ balance: 100 }),
            findOneAndUpdate: async (_, update, options) => { assert.equal(options.session, session); balance += update.$inc.balance; return { balance }; },
        } },
        "../models/transaction.model.js": { default: {
            aggregate: () => {
                const result = () => [{ charged: campaign.creditsDeducted, total: settledRefund + ledger.reduce((sum, row) => sum + (row.type === "REFUND" ? row.amount : row.type === "DEDUCT" && row.refundOperationId ? -row.amount : 0), 0) }];
                return { session: async () => result(), then: (resolve) => Promise.resolve(result()).then(resolve) };
            },
            create: async ([record], options) => {
            assert.equal(options.session, session);
            const tx = { ...record, _id: new mongoose.Types.ObjectId() }; ledger.push(tx); return [tx];
        } } },
        "../services/socket.service.js": { notifyUser() {}, notifyRole() {}, notifyReseller() {} },
        "../queues/campaign.queue.js": {
            scheduleCampaignJob: async () => calls.push("enqueue"),
            cancelCampaignJob: async () => calls.push("cancel"),
        },
    });
    return {
        campaign, calls, ledger, getBalance: () => balance, setSettledRefund: (amount) => { settledRefund = amount; },
        invoke: async (handler, role, body) => {
            const response = { status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
            await controller[handler]({ user: { role, _id: campaign.userId }, params: { id: String(campaign._id) }, body }, response);
            return response;
        },
    };
}

test("selecting Failed is a private draft decision and does not move credits", async () => {
    const f = await fixture();
    f.campaign.creditsDeducted = 80;
    for (let repeat = 0; repeat < 4; repeat++) {
        const response = await f.invoke("updateCampaignStatus", "Super Admin", { status: "failed" });
        assert.equal(response.code, 200, response.body.message);
        assert.equal(f.campaign.status, "failed");
        assert.equal(f.campaign.publicStatus, "pending");
        assert.equal(f.getBalance(), 100);
        assert.equal(f.ledger.length, 0);
    }
    const restart = await f.invoke("updateCampaignStatus", "Super Admin", { status: "ongoing" });
    assert.equal(restart.code, 200);
    assert.equal(f.campaign.status, "ongoing");
    assert.equal(f.ledger.length, 0);
});

test("failed status draft rolls back when saving fails", async () => {
    const f = await fixture({ failSave: true });
    const response = await f.invoke("updateCampaignStatus", "Super Admin", { status: "failed" });
    assert.equal(response.code, 500);
    assert.equal(f.campaign.status, "pending");
    assert.equal(f.getBalance(), 100);
    assert.equal(f.ledger.length, 0);
});

for (const role of ["User", "Reseller"]) {
    test(`${role} submission charges all 23 entered numbers rather than 11 distinct numbers`, async () => {
        const f = await fixture();
        const phones = Array.from({ length: 11 }, (_, index) => String(919876543200 + index));
        const response = await f.invoke("createCampaign", role, {
            campaignTitle: "All entries billed", campaignDescription: "Charge submitted occurrences",
            messageBody: "Hello", recipients: [...phones, ...phones, "12345"], schedule: "now",
        });
        assert.equal(response.code, 201, response.body.message);
        assert.equal(response.body.creditDeduction.amount, 23 * 12);
        assert.equal(response.body.data.totalRecipients, 23);
        assert.equal(response.body.data.recipientStats.uniqueCount, 11);
        assert.equal(response.body.data.recipientStats.duplicateCount, 11);
        assert.equal(response.body.data.recipientStats.invalidList[0], "12345");
        assert.equal(response.body.data.recipients.length, 11);
        assert.equal(f.ledger[0].amount, 23 * 12);
    });
    for (const schedule of ["now", "later"]) {
        test(`${role} ${schedule} submission stays pending and does not enqueue, even with a supplied ongoing status`, async () => {
            const f = await fixture();
            const response = await f.invoke("createCampaign", role, {
                campaignTitle: "Approval test", campaignDescription: "Pending until approved",
                messageBody: "Hello", recipients: ["919876543210"], schedule,
                scheduledTime: new Date(Date.now() + 86_400_000).toISOString(), status: "ongoing",
            });
            assert.equal(response.code, 201, response.body.message);
            assert.equal(response.body.data.status, "pending");
            assert.equal(response.body.data.campaignStartDate, null);
            assert.ok(response.body.data.scheduledTime);
            assert.ok(!f.calls.includes("enqueue"));
        });
    }
    test(`${role} cannot approve their own campaign`, async () => {
        const f = await fixture();
        const response = await f.invoke("updateCampaignStatus", role, { status: "ongoing" });
        assert.equal(response.code, 403);
        assert.equal(f.campaign.status, "pending");
        assert.equal(f.calls.length, 0);
    });
}

test("admin approval persists ongoing status before dispatch is enqueued", async () => {
    const f = await fixture();
    const response = await f.invoke("updateCampaignStatus", "Super Admin", { status: "ongoing" });
    assert.equal(response.code, 200, response.body.message);
    assert.equal(f.campaign.status, "ongoing");
    assert.deepEqual(f.calls, ["save", "enqueue"]);
});

for (const previousStatus of ["completed", "sent"]) {
    test(`reopening ${previousStatus} keeps ongoing without dispatching again, including after a pause`, async () => {
        const f = await fixture();
        f.campaign.status = previousStatus;
        f.campaign.campaignEndDate = new Date();
        f.campaign.campaignSummary = { sent: 5, delivered: 4, failed: 1, creditsRefunded: 12 };
        const originalSummary = { ...f.campaign.campaignSummary };
        for (const status of ["ongoing", "paused", "ongoing"]) {
            const response = await f.invoke("updateCampaignStatus", "Super Admin", { status });
            assert.equal(response.code, 200, response.body.message);
            assert.equal(f.campaign.status, status);
            assert.equal(f.campaign.manualStatusOverride, true);
        }
        assert.equal(f.campaign.campaignEndDate, null);
        assert.ok(!f.calls.includes("enqueue"));
        assert.deepEqual(f.campaign.campaignSummary, originalSummary);
        assert.equal(f.ledger.length, 0);
    });
}

test("stale queued jobs cannot redispatch a manually reopened campaign", async () => {
    let processJob;
    const worker = await loadModule("./src/workers/campaign.worker.js", {
        bullmq: { Worker: class {
            constructor(_, handler) { processJob = handler; }
            on() {}
        } },
        "../config/redis.js": { redisConnection: {} },
        "../models/campaign.model.js": { default: { findById: () => ({ session: async () => ({
            status: "ongoing", manualStatusOverride: true,
            save: async () => assert.fail("reopened campaign was modified"),
        }) }) } },
        "../services/socket.service.js": { notifyUser() {}, notifyRole() {}, notifyReseller() {} },
    });
    worker.initCampaignWorker();
    const result = await processJob({ data: { campaignId: "test", campaignTitle: "Reopened" } });
    assert.equal(result.skipped, true);
    assert.equal(result.status, "ongoing");
});

test("stale queued jobs cannot start campaigns awaiting admin action", async () => {
    let processJob;
    let status = "pending";
    const worker = await loadModule("./src/workers/campaign.worker.js", {
        bullmq: { Worker: class {
            constructor(_, handler) { processJob = handler; }
            on() {}
        } },
        "../config/redis.js": { redisConnection: {} },
        "../models/campaign.model.js": { default: { findById: () => ({ session: async () => ({
            status, save: async () => assert.fail("unapproved campaign was modified"),
        }) }) } },
        "../services/socket.service.js": { notifyUser() {}, notifyRole() {}, notifyReseller() {} },
    });
    worker.initCampaignWorker();
    for (status of ["pending", "scheduled", "paused", "stopped", "completed", "failed"]) {
        const result = await processJob({ data: { campaignId: "test", campaignTitle: "Approval test" } });
        assert.equal(result.skipped, true);
        assert.equal(result.status, status);
    }
});

test("queue requires ongoing status and replaces a retained stale job on approval", async () => {
    const calls = [];
    const queue = await loadModule("./src/queues/campaign.queue.js", {
        bullmq: { Queue: class {
            async getJob() { return { getState: async () => "completed", remove: async () => calls.push("remove") }; }
            async add(_, data, options) {
                calls.push("add");
                assert.equal(options.jobId, "campaign_test");
                assert.equal(data.campaignId, "test");
                return { id: options.jobId };
            }
        } },
        "../config/redis.js": { redisConnection: {} },
    });
    await queue.scheduleCampaignJob({ _id: "test", status: "pending" });
    await queue.scheduleCampaignJob({ _id: "test", status: "ongoing", manualStatusOverride: true });
    assert.deepEqual(calls, []);
    await queue.scheduleCampaignJob({ _id: "test", status: "ongoing", campaignTitle: "Approved" });
    assert.deepEqual(calls, ["remove", "add"]);
});
