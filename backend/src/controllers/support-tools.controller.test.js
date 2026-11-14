import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

Object.assign(process.env, { MONGO_URI: "mongodb://127.0.0.1:1/unused", JWT_SECRET: "support-tools-test", REDIS_HOST: "127.0.0.1", REDIS_PORT: "6379", REDIS_PASSWORD: "test-only", AUDIT_SIGNING_KEY: "support-tools-tests-only-signing-key-123456", DOTENV_CONFIG_QUIET: "true" });
let replica, User, Wallet, Transaction, Conversation, Message, tools, credits;
const oid = () => new mongoose.Types.ObjectId();
const reseller = { _id: oid(), username: "Account manager", role: "Reseller", status: "active" };
const admin = { _id: oid(), username: "Private admin", role: "Super Admin", status: "active" };
const customer = { _id: oid(), username: "Client", role: "User", status: "active", resellerId: reseller._id };
const outsider = { _id: oid(), username: "Another client", role: "User", status: "active" };
let conversation, otherConversation, ownEntry, otherEntry;

const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = JSON.parse(JSON.stringify(body)); return this; }, set() { return this; } });
async function invoke(handler, viewer, body = {}, query = {}, conversationId = conversation._id) {
    const req = { params: { id: conversationId }, user: viewer, body, query, isPreview: false };
    const res = response();
    await handler(req, res);
    return res;
}

before(async () => {
    replica = await MongoMemoryReplSet.create({ binary: { systemBinary: fileURLToPath(new URL("../../node_modules/.cache/mongodb-memory-server/mongod-x64-win32-8.2.6.exe", import.meta.url)) }, replSet: { count: 1 } });
    mongoose.set("autoIndex", false);
    await mongoose.connect(replica.getUri("support_tools_test"));
    ({ default: User } = await import("../models/user.model.js"));
    ({ default: Wallet } = await import("../models/wallet.model.js"));
    ({ default: Transaction } = await import("../models/transaction.model.js"));
    ({ default: Conversation } = await import("../models/supportConversation.model.js"));
    ({ default: Message } = await import("../models/supportMessage.model.js"));
    tools = await import("./support-tools.controller.js");
    credits = await import("./credit.controller.js");
    await Promise.all([User, Wallet, Transaction, Conversation, Message].map(model => model.init()));
    await Message.createIndexes();
    await User.collection.insertMany([reseller, admin, customer, outsider].map(user => ({ ...user, email: `${user._id}@example.test`, password: "unused", ratePerMsg: 1, expiresAt: null, updatedAt: new Date("2026-01-01T00:00:00Z") })));
    await Wallet.collection.insertMany([{ userId: reseller._id, balance: 2000, balanceMinor: 200000 }, { userId: customer._id, balance: 100, balanceMinor: 10000, expiresAt: null, isLocked: false }]);
    conversation = await Conversation.create({ user: customer._id, reseller: reseller._id, subject: "Credit problem" });
    otherConversation = await Conversation.create({ user: outsider._id, reseller: admin._id, subject: "Other account" });
    ownEntry = { _id: oid(), fromUser: reseller._id, toUser: customer._id, type: "ALLOCATE", amount: 100, balanceAfterTo: 100, notes: "Private internal note", performedBy: admin._id, createdAt: new Date() };
    otherEntry = { ...ownEntry, _id: oid(), toUser: outsider._id };
    await Transaction.collection.insertMany([ownEntry, otherEntry]);
});

after(async () => { await mongoose.disconnect(); if (replica) await replica.stop(); });

test("context is restricted to the conversation account and discloses no manager identity", async () => {
    const result = await invoke(tools.getSupportContext, customer);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.data.account.id, String(customer._id));
    assert.equal(result.body.data.wallet.balance, 100);
    assert.deepEqual(result.body.data.capabilities, { manageAccount: false, allocate: false, requestCredits: true, manageCreditValidity: false, auditLedger: false, escalate: false });
    assert.equal(result.body.data.account.resellerId, undefined);
    assert.equal((await invoke(tools.getSupportContext, outsider)).statusCode, 403);
    const manager = await invoke(tools.getSupportContext, reseller);
    assert.equal(manager.body.data.capabilities.manageAccount, true);
});

test("credit expiry and ledger powers are reserved for Super Admin", async () => {
    const manager = await invoke(tools.getSupportContext, reseller);
    assert.equal(manager.body.data.capabilities.manageCreditValidity, false);
    assert.equal(manager.body.data.capabilities.auditLedger, false);
    assert.equal(manager.body.data.capabilities.escalate, true);
    const staff = await invoke(tools.getSupportContext, admin);
    assert.equal(staff.body.data.capabilities.manageCreditValidity, true);
    assert.equal(staff.body.data.capabilities.auditLedger, true);
    assert.equal(staff.body.data.capabilities.escalate, false);
    assert.equal((await invoke(tools.applySupportWalletAction, reseller, { expiresAt: null, isLocked: false, expectedUpdatedAt: null })).statusCode, 403);
    assert.equal((await invoke(tools.getSupportLedger, reseller)).statusCode, 403);
});

test("Super Admin changes wallet validity without changing account access or its balance", async () => {
    const wallet = await Wallet.findOne({ userId: customer._id }).lean();
    const accountBefore = await User.findById(customer._id).lean();
    const result = await invoke(tools.applySupportWalletAction, admin, { expiresAt: null, isLocked: true, expectedUpdatedAt: wallet.updatedAt?.toISOString() || null });
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
    const updated = await Wallet.findOne({ userId: customer._id }).lean();
    assert.equal(updated.balance, wallet.balance);
    assert.equal(updated.isLocked, true);
    const accountAfter = await User.findById(customer._id).lean();
    assert.equal(accountAfter.status, accountBefore.status);
    assert.equal(String(accountAfter.expiresAt), String(accountBefore.expiresAt));
    const report = await invoke(tools.getSupportLedger, admin);
    assert.equal(report.statusCode, 200, JSON.stringify(report.body));
    assert.equal(report.body.data.currentBalance, wallet.balance);
    assert.equal(report.body.data.isReconciled, true);
    assert.equal(report.body.data.classification, "matched");
    // Restore the test wallet so later allocation tests exercise the same permissions.
    await invoke(tools.applySupportWalletAction, admin, { expiresAt: null, isLocked: false, expectedUpdatedAt: updated.updatedAt.toISOString() });
    await Message.deleteMany({ conversationId: conversation._id });
    await Conversation.updateOne({ _id: conversation._id }, { $set: { nextSequenceNumber: 1 } });
});

test("a former reseller cannot inspect a reassigned account through historical chat membership", async () => {
    const reassigned = await User.collection.insertOne({ username: "Reassigned", role: "User", resellerId: admin._id, email: "reassigned@example.test", status: "active" });
    const oldChat = await Conversation.create({ user: reassigned.insertedId, reseller: reseller._id, subject: "Old assignment" });
    assert.equal((await invoke(tools.getSupportContext, reseller, {}, {}, oldChat._id)).statusCode, 403);
    assert.equal((await invoke(tools.getSupportTransactions, reseller, {}, {}, oldChat._id)).statusCode, 403);
});

test("transaction lookup scopes references and balances without exposing internal notes or participants", async () => {
    const result = await invoke(tools.getSupportTransactions, customer, {}, { reference: `TXN-${ownEntry._id}` });
    assert.equal(result.body.data.length, 1);
    assert.equal(result.body.accountId, String(customer._id));
    assert.equal(result.body.data[0].balanceAfter, 100);
    assert.equal(result.body.data[0].direction, "in");
    assert.equal(result.body.data[0].notes, undefined);
    assert.equal(result.body.data[0].performedBy, undefined);
    assert.equal(result.body.data[0].fromUser, undefined);
    assert.deepEqual((await invoke(tools.getSupportTransactions, customer, {}, { reference: `TXN-${otherEntry._id}` })).body.data, []);
    const managerLookup = await invoke(tools.getSupportTransactions, admin, {}, { userId: String(outsider._id) });
    assert.equal(managerLookup.body.accountId, String(customer._id));
    assert(managerLookup.body.data.every(item => item.id !== String(otherEntry._id)));
    assert.equal((await invoke(tools.getSupportTransactions, customer, {}, { reference: "TXN-short" })).statusCode, 400);
});

test("clients cannot grant themselves access", async () => {
    assert.equal((await invoke(tools.applySupportAccessAction, customer, { action: "unblock" })).statusCode, 403);
    assert.equal(await Message.countDocuments(), 0);
});

test("extending a blocked account preserves its block and wallet validity and saves a receipt atomically", async () => {
    await User.collection.updateOne({ _id: customer._id }, { $set: { status: "blocked", accessReason: "Needs review" } });
    const before = await User.findById(customer._id).lean();
    const nextDate = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const result = await invoke(tools.applySupportAccessAction, reseller, { action: "extend-expiry", expiresAt: nextDate, expectedUpdatedAt: before.updatedAt.toISOString() });
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
    const account = await User.findById(customer._id).lean();
    assert.equal(account.status, "blocked");
    assert.equal(account.expiresAt.toISOString(), `${nextDate}T23:59:59.999Z`);
    assert.equal((await Wallet.findOne({ userId: customer._id }).lean()).expiresAt, null);
    const receipt = await Message.findOne({ conversationId: conversation._id }).lean();
    assert.match(receipt.text, /remains blocked/);
    assert.equal(receipt.sequenceNumber, 1);
    assert.equal((await Conversation.findById(conversation._id)).nextSequenceNumber, 2);
});

test("stale or invalid account updates cannot change access or add success receipts", async () => {
    const count = await Message.countDocuments();
    const current = await User.findById(customer._id).lean();
    assert.equal((await invoke(tools.applySupportAccessAction, reseller, { action: "unblock", expectedUpdatedAt: "2020-01-01T00:00:00Z" })).statusCode, 409);
    assert.equal((await invoke(tools.applySupportAccessAction, reseller, { action: "extend-expiry", expectedUpdatedAt: current.updatedAt.toISOString(), expiresAt: "2020-01-01" })).statusCode, 400);
    assert.equal(await Message.countDocuments(), count);
    assert.equal((await User.findById(customer._id)).status, "blocked");
});

test("unblocking an expired account keeps renewal necessary", async () => {
    await User.collection.updateOne({ _id: customer._id }, { $set: { expiresAt: new Date("2020-01-01") } });
    const current = await User.findById(customer._id).lean();
    const result = await invoke(tools.applySupportAccessAction, admin, { action: "unblock", expectedUpdatedAt: current.updatedAt.toISOString() });
    assert.equal(result.statusCode, 200);
    const context = await invoke(tools.getSupportContext, customer);
    assert.equal(context.body.data.account.restriction, "expired");
    assert.equal(context.body.data.capabilities.requestCredits, false);
    assert.match((await Message.findOne({ conversationId: conversation._id }).sort({ sequenceNumber: -1 })).text, /still requires renewal/);
});

test("credit allocation and its chat receipt commit together; invalid conversation rolls both back", async () => {
    const balanceBefore = (await Wallet.findOne({ userId: customer._id })).balance;
    const countBefore = await Message.countDocuments();
    const rejected = await invoke(credits.allocateCredits, reseller, { toUserId: customer._id, amount: 25, supportConversationId: otherConversation._id });
    assert.equal(rejected.statusCode, 403, JSON.stringify(rejected.body));
    assert.equal((await Wallet.findOne({ userId: customer._id })).balance, balanceBefore);
    assert.equal(await Message.countDocuments(), countBefore);
    const accepted = await invoke(credits.allocateCredits, reseller, { toUserId: customer._id, amount: 25, supportConversationId: conversation._id });
    assert.equal(accepted.statusCode, 200, JSON.stringify(accepted.body));
    assert.equal((await Wallet.findOne({ userId: customer._id })).balance, balanceBefore + 25);
    assert.equal(await Message.countDocuments(), countBefore + 1);
    assert.match((await Message.findOne({ conversationId: conversation._id }).sort({ sequenceNumber: -1 })).text, /Allocated 25 credits/);
});

test("requesting credits writes a reference in chat without changing the balance", async () => {
    await User.collection.updateOne({ _id: customer._id }, { $set: { status: "active", expiresAt: null } });
    const before = (await Wallet.findOne({ userId: customer._id })).balance;
    const result = await invoke(credits.requestCredits, customer, { amount: 10, note: "For next campaign", supportConversationId: conversation._id });
    assert.equal(result.statusCode, 201, JSON.stringify(result.body));
    assert.equal((await Wallet.findOne({ userId: customer._id })).balance, before);
    const receipt = await Message.findOne({ conversationId: conversation._id }).sort({ sequenceNumber: -1 });
    assert.match(receipt.text, /Requested 10 credits/);
    assert.match(receipt.text, /TXN-[A-F\d]{24}/);
    const messages = await Message.find({ conversationId: conversation._id }).sort({ sequenceNumber: 1 }).lean();
    assert.deepEqual(messages.map(item => item.sequenceNumber), messages.map((_, index) => index + 1));
});
