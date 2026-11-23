import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

Object.assign(process.env, {
    MONGO_URI: "mongodb://127.0.0.1:1/unused",
    JWT_SECRET: "number-filtering-test-secret",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "6379",
    REDIS_PASSWORD: "test-only",
    AUDIT_SIGNING_KEY: "number-filtering-test-audit-signing-key",
    DOTENV_CONFIG_QUIET: "true",
});

const { default: router } = await import("../routes/number-filtering.routes.js");
const { tokenHash } = await import("../helpers/browser-session.js");
const { default: User } = await import("../models/user.model.js");
const { default: Session } = await import("../models/session.model.js");
const { default: Wallet } = await import("../models/wallet.model.js");
const { default: Transaction } = await import("../models/transaction.model.js");
const { default: CreditOperation } = await import("../models/credit-operation.model.js");
const { default: NumberFilterRequest, NumberFilterRowChunk } = await import("../models/number-filter-request.model.js");
const { AuditEvent, AuditHead } = await import("../models/audit.model.js");
const { CreditAuditJob } = await import("../models/credit-reconciliation.model.js");
const { runCreditTransaction } = await import("../helpers/credit-operation.js");
const { postCreditMovement } = await import("../services/credit-posting.service.js");
const { inspectCreditAccount } = await import("../services/credit-evidence.service.js");

let replica, server, base, admin;
const first = "919876543210";
const second = "919876543211";
const third = "919876543212";

async function makeAccount(role, filtering = 0, campaign = 0) {
    const id = new mongoose.Types.ObjectId();
    const token = jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    await User.collection.insertOne({ _id: id, username: `Account ${id}`, email: `${id}@example.test`, role, status: "active", password: "unused" });
    const session = await Session.create({ userId: id, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 3600000) });
    if (role !== "Super Admin") await Wallet.create({ userId: id });
    for (const [category, amount] of [["NUMBER_FILTERING", filtering], ["CAMPAIGN", campaign]]) {
        if (amount) await runCreditTransaction(db => postCreditMovement({
            session: db, operationKey: `seed:${id}:${category}`, type: "ALLOCATE", category, amount, toUser: id, performedBy: admin.id,
        }), { walletIds: [id] });
    }
    return {
        id, token, sessionId: session._id,
        headers: { Cookie: `token=${token}`, "X-Expected-Account": String(id), "X-Expected-Session": String(session._id) },
    };
}

async function request(actor, url = "", { method = "GET", body, key = "number-filtering-test-key", headers = {} } = {}) {
    const response = await fetch(base + url, {
        method, headers: { ...actor?.headers, "Idempotency-Key": key, "Content-Type": "application/json", ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
    });
    return { status: response.status, body: await response.json(), headers: response.headers };
}
const submit = (actor, numbers, key) => request(actor, "", { method: "POST", body: { numbers }, key });
const review = (actor, id, mode, numbers, revision) => request(actor, `/${id}/results`, { method: "PUT", body: { mode, numbers, revision } });
const wallet = async actor => (await Wallet.findOne({ userId: actor.id }).lean()).creditBalances;

before(async () => {
    const binary = fileURLToPath(new URL("../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe", import.meta.url));
    replica = await MongoMemoryReplSet.create({ ...(existsSync(binary) ? { binary: { systemBinary: binary } } : {}), replSet: { count: 1 } });
    mongoose.set("autoIndex", false);
    await mongoose.connect(replica.getUri("number_filtering_test"));
    await User.init();
    await Promise.all([Session, Wallet, Transaction, CreditOperation, NumberFilterRequest, NumberFilterRowChunk, AuditEvent, AuditHead, CreditAuditJob].map(async model => {
        await model.init();
        await model.createIndexes();
    }));
    admin = await makeAccount("Super Admin");
    const app = express();
    app.use(express.json());
    app.use("/api/number-filtering", router);
    await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
    base = `http://127.0.0.1:${server.address().port}/api/number-filtering`;
});

after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await replica?.stop();
});

test("each submitted row is charged once and only the requester or admin can read it", async () => {
    const buyer = await makeAccount("User", 8, 14);
    const outsider = await makeAccount("Reseller", 8);
    const numbers = `${first}\r\n\r\n${first}\r\n${second}`;
    const submissions = await Promise.all([submit(buyer, numbers), submit(buyer, numbers)]);
    for (const result of submissions) {
        assert.equal(result.status, 201);
        assert.equal(result.body.creditsCharged, 3);
        assert.equal(result.body.available, 5);
        assert.equal(result.headers.get("cache-control"), "private, no-store");
    }
    const { id, chargeTransactionId } = submissions[0].body.data;
    assert.equal(submissions[1].body.data.id, id);
    assert(submissions.some(result => result.headers.get("idempotent-replayed") === "true"));
    assert.equal((await submit(buyer, second)).status, 409);
    const balance = await wallet(buyer);
    assert.equal(balance.NUMBER_FILTERING.available, 5);
    assert.equal(balance.CAMPAIGN.available, 14);
    const charge = await Transaction.findById(chargeTransactionId).lean();
    assert.equal(charge.category, "NUMBER_FILTERING");
    assert.equal(charge.amount, 3);
    assert.equal(String(charge.filterRequestId), id);
    assert.equal(await Transaction.countDocuments({ filterRequestId: id }), 1);
    assert.equal(await NumberFilterRequest.countDocuments({ userId: buyer.id }), 1);
    const submitted = await NumberFilterRowChunk.findOne({ requestId: id, kind: "submitted" }).lean();
    assert.deepEqual(submitted.rows.map(row => row.rowNumber), [1, 3, 4]);
    assert.equal((await request(null, `/${id}`)).status, 401);
    assert.equal((await request(outsider, `/${id}`)).status, 404);
    assert.deepEqual((await request(outsider)).body.items, []);
    const own = (await request(buyer, `/${id}`)).body.data;
    assert.equal(own.submittedNumbers, `${first}\n${first}\n${second}`);
    assert.equal(own.publishedNumbers, null);
    assert.equal(Object.hasOwn(own, "draftNumbers"), false);
    assert.equal((await request(admin, `/${id}`)).body.data.owner.role, "User");
    assert.equal((await review(buyer, id, "publish", first, 0)).status, 403);
    assert.equal((await submit(admin, first)).status, 403);
    const audit = JSON.stringify(await AuditEvent.find().select("data").lean());
    assert.equal(audit.includes(first), false);
    assert.equal(audit.includes(second), false);
});

test("a published filtering result survives a test credit reset", async () => {
    const owner = await makeAccount("User");
    const archived = await NumberFilterRequest.create({
        userId: owner.id, submittedRowCount: 1, publishedRowCount: 1, status: "PUBLISHED",
        publishedAt: new Date(), creditResetAt: new Date(),
    });
    await NumberFilterRowChunk.create({
        requestId: archived._id, kind: "published", chunkIndex: 0,
        rows: [{ rowNumber: 1, phoneNumber: first }],
    });

    const result = await request(owner, `/${archived._id}`);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.chargeTransactionId, null);
    assert.equal(result.body.data.creditsCharged, 0);
    assert.equal(result.body.data.publishedNumbers, first);
    assert.deepEqual(result.body.data.publishedResults.rows, [{ rowNumber: 1, phoneNumber: first, category: "returned" }]);
    const session = await mongoose.startSession();
    try {
        const { summary } = await session.withTransaction(() => inspectCreditAccount(owner.id, session));
        assert.equal(summary.classification, "matched");
    } finally { await session.endSession(); }
});

test("category drafts stay private and every categorized occurrence keeps its original charge", async () => {
    const seller = await makeAccount("Reseller", 10);
    const created = await submit(seller, [first, first, second, third].join("\n"));
    assert.equal(created.status, 201);
    const { id } = created.body.data;
    const categories = [
        { id: "valid", label: "Valid numbers", numbers: first },
        { id: "duplicates", label: "Duplicates", numbers: first },
        { id: "not-on-whatsapp", label: "Not on WhatsApp", numbers: second },
        { id: "check-later", label: "Check later", numbers: third },
    ];
    const update = (mode, revision, body = categories) => request(admin, `/${id}/results`, { method: "PUT", body: { mode, revision, categories: body } });

    const invalid = await update("draft", 0, [...categories, { id: "wrong", label: "Wrong numbers", numbers: third }]);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.categoryIssues[0].categoryId, "wrong");
    assert.equal((await update("draft", 0, [{ id: "duplicates", label: "Duplicates", numbers: second }])).status, 400);
    assert.equal((await update("draft", 0)).status, 200);
    const before = (await request(seller, `/${id}`)).body.data;
    assert.equal(before.publishedResults, null);
    assert.equal(Object.hasOwn(before, "draftResults"), false);
    const editor = (await request(admin, `/${id}`)).body.data;
    assert.equal(editor.draftResults.categories.at(-1).label, "Check later");
    assert.equal(editor.draftResults.rows.length, 4);
    assert.equal((await update("publish", 0)).status, 409);
    assert.equal((await update("publish", 1)).status, 200);

    const published = (await request(seller, `/${id}`)).body.data;
    assert.deepEqual(published.publishedResults.rows, [
        { rowNumber: 1, phoneNumber: first, category: "valid" },
        { rowNumber: 2, phoneNumber: first, category: "duplicates" },
        { rowNumber: 3, phoneNumber: second, category: "not-on-whatsapp" },
        { rowNumber: 4, phoneNumber: third, category: "check-later" },
    ]);
    assert.equal(published.publishedRowCount, 4);
    assert.equal(published.creditsCharged, 4);
    assert.equal((await wallet(seller)).NUMBER_FILTERING.available, 6);
    assert.equal(await Transaction.countDocuments({ filterRequestId: id }), 1);
    assert.equal((await update("draft", 2, [])).status, 200);
    assert.deepEqual((await request(seller, `/${id}`)).body.data.publishedResults, published.publishedResults);
});

test("admin drafts are private and publishing or closing never charges or refunds credits", async () => {
    const seller = await makeAccount("Reseller", 4, 15);
    const created = await submit(seller, `${first}\n${second}`);
    assert.equal(created.status, 201);
    const { id } = created.body.data;
    assert.equal((await review(admin, id, "publish", third, 0)).status, 400);
    const draft = await review(admin, id, "draft", `${second}\n${second}`, 0);
    assert.equal(draft.status, 200);
    assert.equal(draft.body.data.status, "IN_REVIEW");
    assert.equal((await request(admin, `/${id}`)).body.data.draftNumbers, second);
    const forSeller = (await request(seller, `/${id}`)).body.data;
    assert.equal(Object.hasOwn(forSeller, "draftNumbers"), false);
    assert.equal(forSeller.publishedNumbers, null);
    assert.equal((await review(admin, id, "publish", first, 0)).status, 409);
    assert.equal((await review(admin, id, "publish", second, 1)).status, 200);
    assert.equal((await request(seller, `/${id}`)).body.data.publishedNumbers, second);
    assert.equal((await review(admin, id, "draft", first, 2)).status, 200);
    assert.equal((await request(seller, `/${id}`)).body.data.publishedNumbers, second);
    assert.equal((await review(admin, id, "publish", "", 3)).status, 200);
    assert.equal((await request(seller, `/${id}`)).body.data.publishedNumbers, "");
    assert.equal((await review(admin, id, "close", undefined, 4)).status, 200);
    assert.equal((await request(seller, `/${id}`)).body.data.status, "CLOSED");
    assert.equal((await review(admin, id, "publish", first, 5)).status, 200);
    assert.equal((await request(seller, `/${id}`)).body.data.publishedNumbers, first);
    assert.equal((await wallet(seller)).NUMBER_FILTERING.available, 2);
    assert.equal((await wallet(seller)).CAMPAIGN.available, 15);
    assert.equal(await Transaction.countDocuments({ filterRequestId: id }), 1);
    const session = await mongoose.startSession();
    try {
        let evidence = await session.withTransaction(() => inspectCreditAccount(seller.id, session));
        assert.equal(evidence.summary.classification, "matched");
        await NumberFilterRequest.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { submittedRowCount: 3 } });
        evidence = await session.withTransaction(() => inspectCreditAccount(seller.id, session));
        assert(evidence.summary.concerns.includes("Number filtering requests do not match their recorded charges."));
    } finally { await session.endSession(); }
});

test("validation, wallet locks, insufficient credits and failed persistence leave no debit", async t => {
    const buyer = await makeAccount("User", 1, 100);
    assert.equal((await submit(buyer, `${first}\n123`)).status, 400);
    assert.equal((await submit(buyer, `${first}\n${second}`)).body.code, "CREDIT_INSUFFICIENT");
    await Wallet.findOneAndUpdate({ userId: buyer.id }, { $set: { isLocked: true } });
    assert.equal((await submit(buyer, first)).status, 403);
    await Wallet.findOneAndUpdate({ userId: buyer.id }, { $set: { isLocked: false } });
    const failure = t.mock.method(NumberFilterRowChunk, "insertMany", async () => { throw new Error("Simulated write failure"); });
    assert.equal((await submit(buyer, first)).status, 500);
    failure.mock.restore();
    assert.equal(await NumberFilterRequest.countDocuments({ userId: buyer.id }), 0);
    assert.equal(await Transaction.countDocuments({ type: "DEDUCT", toUser: buyer.id }), 0);
    assert.equal((await wallet(buyer)).NUMBER_FILTERING.available, 1);
    assert.equal((await wallet(buyer)).CAMPAIGN.available, 100);
    assert.equal((await submit(buyer, first)).status, 201);
});

test("account preview can read the owner's requests and cannot spend credits", async () => {
    const buyer = await makeAccount("User", 3);
    const created = await submit(buyer, first);
    const token = jwt.sign({
        userId: buyer.id, isPreview: true, parentSessionId: String(admin.sessionId),
        originalAdmin: { id: String(admin.id), role: "Super Admin" },
    }, process.env.JWT_SECRET, { expiresIn: "1h" });
    const session = await Session.create({ userId: buyer.id, parentSessionId: admin.sessionId, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + 3600000) });
    const preview = {
        headers: {
            Cookie: `token=${admin.token}`, Authorization: `Bearer ${token}`, "X-Account-Context": "preview",
            "X-Expected-Account": String(buyer.id), "X-Expected-Session": String(session._id),
        },
    };
    assert.equal((await request(preview, `/${created.body.data.id}`)).status, 200);
    assert.equal((await submit(preview, second, "preview-number-filtering-key")).status, 403);
    assert.equal((await wallet(buyer)).NUMBER_FILTERING.available, 2);
});
