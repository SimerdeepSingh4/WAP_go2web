import * as spreadsheet from "../shared/campaignSpreadsheet.js";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import vm from "node:vm";
import mongoose from "mongoose";
import transactionModel from "./src/models/transaction.model.js";
import { ensureTransactionRefundIndex } from "./src/config/transaction-indexes.js";
import { assignNumbersToCategory, normalizeSavedRecipientEntry } from "../frontend/src/features/campaigns/lib/recipientEntries.js";

test("pasted lists move existing rows and add unique numbers with the category billing rule", () => {
    const entries = [{ rowNumber: 8, phoneNumber: "919876543210", status: "failed", tabKey: "wrong" }];
    const tab = { key: "review", label: "Review", defaultBilling: "keep" };
    const result = assignNumbersToCategory(entries, "+919876543210\n919876543211,919876543211;919876543212", tab);
    assert.equal(result.moved, 1);
    assert.equal(result.added, 2);
    assert.deepEqual(result.entries.map((entry) => entry.rowNumber), [8, 9, 10]);
    assert.ok(result.entries.every((entry) => entry.tabKey === "review" && entry.billingAction === "keep"));
    assert.equal(entries[0].tabKey, "wrong");
    const repeated = assignNumbersToCategory(result.entries, "919876543211", { ...tab, defaultBilling: "refund" });
    assert.equal(repeated.added, 0);
    assert.equal(repeated.entries[1].billingAction, "refund");
    assert.equal(assignNumbersToCategory(entries, " , ; ", tab).added, 0);
});

test("refund index retains automatic refund protection and scopes manual adjustments", () => {
    const [keys, options] = transactionModel.schema.indexes().find(
        ([, opts]) => opts.name === "campaign_refund_operation_unique"
    );
    assert.deepEqual(keys, { campaignId: 1, type: 1, refundOperationId: 1 });
    assert.equal(options.unique, true);
    assert.deepEqual(options.partialFilterExpression, { type: "REFUND" });
    assert.equal(transactionModel.schema.path("refundOperationId").defaultValue, undefined);
});

test("migration installs replacement before removing only the legacy refund index", async () => {
    const calls = [];
    const collection = {
        createIndex: async (keys, options) => calls.push(["create", keys, options]),
        listIndexes: () => ({ toArray: async () => [
            { name: "campaignId_1_type_1", unique: true, key: { campaignId: 1, type: 1 } },
            { name: "campaignId_1", key: { campaignId: 1 } },
            { name: "campaign_refund_operation_unique", unique: true,
                key: { campaignId: 1, type: 1, refundOperationId: 1 } },
        ] }),
        dropIndex: async (name) => calls.push(["drop", name]),
    };
    await ensureTransactionRefundIndex(collection);
    assert.equal(calls[0][0], "create");
    assert.deepEqual(calls[1], ["drop", "campaignId_1_type_1"]);
    assert.equal(calls.length, 2);
});

test("migration never drops protection if replacement index cannot be created", async () => {
    await assert.rejects(ensureTransactionRefundIndex({
        createIndex: async () => { throw new Error("index build failed"); },
        dropIndex: async () => assert.fail("must preserve existing protection"),
    }), /index build failed/);
});

// Load the actual controllers with in-memory persistence, avoiding Redis and any
// connection to the configured application database. Sessions model rollback.
async function controllerFixture() {
    const campaign = {
        _id: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(),
        campaignTitle: "Refund regression", rateSnapshot: 12, creditsDeducted: 120,
        totalRecipients: 10, status: "completed", campaignSummary: { creditsRefunded: 12 },
        save: async () => {},
    };
    const storedRows = { draft: [], published: [] };
    let balance = 100;
    const ledger = [{ type: "REFUND", amount: 12, campaignId: campaign._id }];
    let snapshot;
    let failSave = false;
    const session = {
        startTransaction: () => {
            snapshot = { balance, size: ledger.length, summary: { ...campaign.campaignSummary }, storedRows: { ...storedRows }, revision: campaign.spreadsheetRevision, published: campaign.publishedSpreadsheet };
        },
        commitTransaction: async () => {},
        abortTransaction: async () => {
            balance = snapshot.balance;
            ledger.length = snapshot.size;
            campaign.campaignSummary = snapshot.summary;
            Object.assign(storedRows, snapshot.storedRows);
            campaign.spreadsheetRevision = snapshot.revision;
            campaign.publishedSpreadsheet = snapshot.published;
        },
        endSession: () => {},
    };
    campaign.save = async () => { if (failSave) throw new Error("save failed"); };
    const dependencies = {
        "../helpers/spreadsheet-storage.js": {
            loadSpreadsheetRows: async (_, kind) => storedRows[kind],
            saveSpreadsheetRows: async (_, kind, rows) => { storedRows[kind] = rows; },
        },
        mongoose: { default: { Types: mongoose.Types, startSession: async () => session } },
        "../models/campaign.model.js": { default: {
            findById: () => {
                const query = {
                    session: async () => campaign,
                    populate: () => query,
                    then: (resolve) => Promise.resolve(campaign).then(resolve),
                };
                return query;
            },
        } },
        "../models/user.model.js": { default: {
            findById: () => ({ session: async () => ({ role: "User", ratePerMsg: 12 }) }),
        } },
        "../models/wallet.model.js": { default: {
            findOneAndUpdate: async (_, update, options) => {
                assert.equal(options.session, session);
                balance += update.$inc.balance;
                return { balance };
            },
        } },
        "../models/transaction.model.js": { default: {
            create: async ([record], options) => {
                assert.equal(options.session, session);
                if (record.type === "REFUND" && ledger.some((entry) =>
                    entry.type === "REFUND" &&
                    String(entry.refundOperationId) === String(record.refundOperationId))) {
                    throw new Error("duplicate refund operation");
                }
                const entry = { ...record, _id: new mongoose.Types.ObjectId() };
                ledger.push(entry);
                return [entry];
            },
        } },
        "../services/socket.service.js": { notifyUser() {}, notifyRole() {}, notifyReseller() {} },
        "../queues/campaign.queue.js": { scheduleCampaignJob() {}, cancelCampaignJob() {} },
    };
    const source = await readFile(new URL("./src/controllers/campaign.controller.js", import.meta.url), "utf8");
    const context = vm.createContext({ console: { error() {} }, Date, Set, Map, Buffer });
    const module = new vm.SourceTextModule(source, { context });
    await module.link(async (specifier) => {
        const exports = dependencies[specifier] || (specifier === "../../../shared/campaignSpreadsheet.js" ? spreadsheet : specifier === "../helpers/spreadsheet-storage.js" ? { loadSpreadsheetRows: async () => [], saveSpreadsheetRows: async () => {} } : { default: {} });
        return new vm.SyntheticModule(Object.keys(exports), function () {
            for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
        }, { context });
    });
    await module.evaluate();
    return {
        campaign, ledger, storedRows, getBalance: () => balance,
        failSave: () => { failSave = true; },
        invoke: async (handler, count, body, role = "Super Admin") => {
            const req = {
                user: { role, _id: campaign.userId },
                params: { id: String(campaign._id) },
                body: handler === "saveCampaignReport"
                    ? { categories: [{ name: "Wrong numbers", billingAction: "refund",
                        numbers: Array.from({ length: count }, (_, i) => `9198765432${i}`) }] }
                    : { entries: Array.from({ length: count }, (_, i) => ({
                        rowNumber: i + 1, phoneNumber: `9198765432${i}`, tabKey: "wrong",
                        category: "Wrong numbers", status: "failed", billingAction: "refund",
                    })) },
            };
            if (body) req.body = body;
            const response = { status(code) { this.code = code; return this; },
                json(body) { this.body = body; return this; } };
            await module.namespace[handler](req, response);
            return response;
        },
    };
}

for (const [tabKey, billingAction, category] of [
    ["all", "keep", "All"],
    ["delivered", "keep", "Delivered"],
    ["custom_review", "keep", "Review"],
    ["custom_refund", "refund", "Refund review"],
]) {
    test(`saved failed recipient stays in ${tabKey} through save, reload, and frontend initialization`, async () => {
        const fixture = await controllerFixture();
        const entry = {
            rowNumber: 1, phoneNumber: "919876543210", status: "failed",
            classification: "pending", category, tabKey, billingAction,
        };
        const saved = await fixture.invoke("updateCampaignRecipientsManagement", 0, { entries: [entry] });
        assert.equal(saved.code, 200);
        for (let reload = 0; reload < 2; reload++) {
            const response = await fixture.invoke("getCampaignById", 0);
            assert.equal(response.code, 200, response.body.message);
            const [loaded] = response.body.data.recipientEntries;
            assert.deepEqual(loaded, entry);
            assert.deepEqual(normalizeSavedRecipientEntry(loaded), entry);
        }
    });
}

test("frontend supplies defaults only for missing recipient assignment fields", () => {
    const entry = normalizeSavedRecipientEntry({ rowNumber: "1", phoneNumber: "+91 9876543210", status: "failed" });
    assert.equal(entry.tabKey, "wrong");
    assert.equal(entry.billingAction, "refund");
    assert.equal(entry.phoneNumber, "919876543210");
    assert.equal(entry.rowNumber, 1);
});

test("spreadsheet drafts stay private, publish evaluates columns, and republishing is financially idempotent", async () => {
    const fixture = await controllerFixture();
    const columns = spreadsheet.normalizeColumns([...spreadsheet.BASE_COLUMNS, {
        id: "result", label: "Length", letter: "F", formula: "=LEN(A{row})",
    }]);
    const entries = [125, 830].map((rowNumber) => ({
        rowNumber, phoneNumber: `919876543${rowNumber}`, status: "failed", tabKey: "wrong",
        category: "Wrong", billingAction: "refund", notes: "Published note", cells: {},
    }));
    const payload = { entries, spreadsheetColumns: columns, spreadsheetRevision: 0, saveMode: "draft", reportNotes: "Reviewed delivery results." };
    const draft = await fixture.invoke("updateCampaignRecipientsManagement", 0, payload);
    assert.equal(draft.code, 200, draft.body.message);
    assert.equal(fixture.getBalance(), 100);
    assert.equal(fixture.ledger.length, 1);
    assert.equal(fixture.campaign.spreadsheetRevision, 1);
    assert.equal(fixture.storedRows.draft.length, 2);
    const privateView = await fixture.invoke("getCampaignById", 0, null, "User");
    assert.equal(privateView.code, 200);
    assert.ok(!privateView.body.data.recipientEntries);
    assert.ok(!privateView.body.data.spreadsheetColumns);
    assert.ok(!("draftReportNotes" in privateView.body.data));
    assert.ok(!privateView.body.data.publishedSpreadsheet);

    const publish = await fixture.invoke("updateCampaignRecipientsManagement", 0, { ...payload, saveMode: "publish", spreadsheetRevision: 1 });
    assert.equal(publish.code, 200, publish.body.message);
    assert.equal(fixture.getBalance(), 112);
    assert.equal(fixture.ledger.length, 2);
    assert.deepEqual(fixture.storedRows.published.map((row) => row.rowNumber), [125, 830]);
    assert.equal(fixture.storedRows.published[0].values.result, entries[0].phoneNumber.length);
    assert.equal(fixture.campaign.publishedSpreadsheet.columns[5].label, "Length");
    assert.equal(fixture.campaign.publishedSpreadsheet.notes, "Reviewed delivery results.");
    assert.ok(!("formula" in fixture.campaign.publishedSpreadsheet.columns[5]));
    assert.equal(fixture.campaign.recipientEntries.length, 0);

    const republish = await fixture.invoke("updateCampaignRecipientsManagement", 0, { ...payload, saveMode: "publish", spreadsheetRevision: 2 });
    assert.equal(republish.code, 200, republish.body.message);
    assert.equal(fixture.getBalance(), 112);
    assert.equal(fixture.ledger.length, 2);
    const nextDraft = await fixture.invoke("updateCampaignRecipientsManagement", 0, {
        ...payload, entries: entries.map((row) => ({ ...row, notes: "Private edit" })), reportNotes: "Unpublished client note", spreadsheetRevision: 3,
    });
    assert.equal(nextDraft.code, 200, nextDraft.body.message);
    assert.equal(fixture.storedRows.published[0].values.notes, "Published note");
    const viewer = await fixture.invoke("getCampaignById", 0, null, "Reseller");
    assert.equal(viewer.code, 200);
    assert.equal(viewer.body.data.publishedSpreadsheet.rows[0].values.notes, "Published note");
    assert.equal(viewer.body.data.publishedSpreadsheet.notes, "Reviewed delivery results.");
    assert.ok(!("draftReportNotes" in viewer.body.data));
    assert.ok(!viewer.body.data.recipientEntries);
    const stale = await fixture.invoke("updateCampaignRecipientsManagement", 0, payload);
    assert.equal(stale.code, 409);
});

test("saving duplicate occurrences accepts the first row and refunds only later rows with a reference note", async () => {
    const fixture = await controllerFixture();
    const response = await fixture.invoke("updateCampaignRecipientsManagement", 0, {
        entries: [8, 20, 35].map((rowNumber) => ({ rowNumber, phoneNumber: "919876543210", status: "failed", tabKey: "duplicate", category: "Duplicate", billingAction: "refund", notes: "" })),
        saveMode: "publish", spreadsheetRevision: 0, spreadsheetColumns: spreadsheet.BASE_COLUMNS,
    });
    assert.equal(response.code, 200, response.body.message);
    const rows = fixture.storedRows.draft;
    assert.equal(rows[0].billingAction, "keep");
    assert.equal(rows[0].status, "delivered");
    assert.equal(rows[1].category, "Duplicate number");
    assert.equal(rows[1].notes, "Already listed in row 8.");
    assert.equal(rows[2].notes, "Already listed in row 8.");
    assert.equal(fixture.campaign.campaignSummary.creditsRefunded, 24);
    assert.equal(fixture.storedRows.published[1].values.notes, "Already listed in row 8.");
});

test("publishing a failed campaign preserves its full refund and failed status", async () => {
    const fixture = await controllerFixture();
    fixture.campaign.status = "failed";
    fixture.campaign.campaignSummary.creditsRefunded = 120;
    const result = await fixture.invoke("updateCampaignRecipientsManagement", 0, {
        entries: [{ rowNumber: 1, phoneNumber: "919876543210", category: "Delivered", status: "delivered", billingAction: "keep" }],
        saveMode: "publish", status: "completed", spreadsheetRevision: 0, spreadsheetColumns: spreadsheet.BASE_COLUMNS,
    });
    assert.equal(result.code, 200, result.body.message);
    assert.equal(fixture.campaign.status, "failed");
    assert.equal(fixture.campaign.campaignSummary.creditsRefunded, 120);
    assert.equal(fixture.getBalance(), 100);
    assert.equal(fixture.ledger.length, 1);
});

test("spreadsheet publishing rejects changed All indexes and formula errors before moving credits", async () => {
    const fixture = await controllerFixture();
    fixture.campaign.recipientEntries = [{ rowNumber: 125, phoneNumber: "919876543210" }];
    const base = { spreadsheetRevision: 0, saveMode: "publish", spreadsheetColumns: spreadsheet.BASE_COLUMNS };
    const changedIndex = await fixture.invoke("updateCampaignRecipientsManagement", 0, {
        ...base, entries: [{ rowNumber: 1, phoneNumber: "919876543210" }],
    });
    assert.notEqual(changedIndex.code, 200);
    const formulaError = await fixture.invoke("updateCampaignRecipientsManagement", 0, {
        ...base, spreadsheetColumns: [...spreadsheet.BASE_COLUMNS, { id: "result", letter: "F", label: "Broken", formula: "=1/0" }],
        entries: [{ rowNumber: 125, phoneNumber: "919876543210", billingAction: "refund" }],
    });
    assert.notEqual(formulaError.code, 200);
    assert.equal(fixture.getBalance(), 100);
    assert.equal(fixture.ledger.length, 1);
});

for (const handler of ["updateCampaignRecipientsManagement", "saveCampaignReport"]) {
    test(`${handler}: repeated refund/debit/refund moves and unchanged saves`, async () => {
        const fixture = await controllerFixture();
        for (const count of [2, 3, 1, 3, 3]) {
            const response = await fixture.invoke(handler, count);
            assert.equal(response.code, 200, response.body.message);
            assert.equal(fixture.campaign.campaignSummary.creditsRefunded, count * 12);
            assert.equal(fixture.getBalance(), 100 + count * 12 - 12);
        }
        assert.deepEqual(fixture.ledger.map(({ type, amount }) => [type, amount]), [
            ["REFUND", 12], ["REFUND", 12], ["REFUND", 12], ["DEDUCT", 24], ["REFUND", 24],
        ]);
        const operations = fixture.ledger.slice(1).map((entry) => String(entry.refundOperationId));
        assert.equal(new Set(operations).size, operations.length);
        assert.ok(!operations.includes("undefined"));
    });

    test(`${handler}: failed save rolls back wallet and ledger`, async () => {
        const fixture = await controllerFixture();
        fixture.failSave();
        const response = await fixture.invoke(handler, 3);
        assert.equal(response.code, 500);
        assert.equal(fixture.getBalance(), 100);
        assert.equal(fixture.ledger.length, 1);
        assert.equal(fixture.campaign.campaignSummary.creditsRefunded, 12);
    });
}
