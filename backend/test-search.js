import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import mongoose from "mongoose";

const id = (n) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, "0"));
async function fixture() {
    const calls = [];
    const owned = { _id: id(2), createdBy: id(1) };
    const reassigned = { _id: id(3), createdBy: id(9) };
    const User = { collection: { name: "users" }, find(filter) {
        calls.push(["accounts", filter]);
        return { select() { return this; }, sort() { return this; }, limit() { return this; }, lean: async () => filter.$or ? [{ _id: id(2), username: "TestUser", email: "test@example.invalid", role: "User" }] : [owned, reassigned] };
    } };
    const Campaign = { collection: { name: "campaigns" }, aggregate: async (pipeline) => {
        calls.push(["campaigns", pipeline]); return [{ _id: id(4), campaignTitle: "Example campaign", creator: [{ username: "TestUser" }] }];
    } };
    const Transaction = { aggregate: async (pipeline) => {
        calls.push(["transactions", pipeline]); return [{ _id: id(5), type: "REFUND", amount: 30, createdAt: new Date(), campaign: [{ campaignTitle: "Example campaign" }], recipient: [{ username: "TestUser" }] }];
    } };
    const dependencies = { mongoose: { default: mongoose }, "../models/user.model.js": { default: User }, "../models/campaign.model.js": { default: Campaign }, "../models/transaction.model.js": { default: Transaction } };
    const context = vm.createContext({ console, Date });
    const module = new vm.SourceTextModule(await readFile(new URL("./src/controllers/search.controller.js", import.meta.url), "utf8"), { context });
    await module.link((name) => new vm.SyntheticModule(Object.keys(dependencies[name]), function () { for (const [key, value] of Object.entries(dependencies[name])) this.setExport(key, value); }, { context }));
    await module.evaluate();
    async function search(role, q) {
        calls.length = 0;
        const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
        await module.namespace.searchRecords({ user: { _id: id(1), role }, query: { q } }, res);
        return res;
    }
    return { calls, search };
}

test("Search rejects unsupported roles and avoids queries for short or excessive input", async () => {
    const { search, calls } = await fixture();
    assert.equal((await search("Other", "Test")).code, 403);
    assert.equal((await search("User", "x")).body.groups.length, 0);
    assert.equal((await search("User", "x".repeat(121))).code, 400);
    assert.equal(calls.length, 0);
});

test("User search scopes campaigns and transactions to self and returns no accounts", async () => {
    const { search, calls } = await fixture();
    const result = await search("User", ".*");
    const campaigns = calls.find(([kind]) => kind === "campaigns")[1];
    const transactions = calls.find(([kind]) => kind === "transactions")[1];
    assert.deepEqual(Array.from(campaigns[0].$match.userId.$in, String), [String(id(1))]);
    assert.deepEqual(Array.from(transactions[0].$match.$or[0].fromUser.$in, String), [String(id(1))]);
    assert.equal(campaigns[2].$match.$or[0].campaignTitle.test("unrelated"), false);
    assert.equal(campaigns[2].$match.$or[0].campaignTitle.test("literal .* value"), true);
    assert.equal(campaigns[1].$lookup.localField, "userId");
    assert.equal(result.body.groups[0].items[0].title, "Example campaign");
    assert.equal(calls.some(([kind]) => kind === "accounts"), false);
    assert.equal(result.body.groups[1].items[0].href, `/user/credits?transaction=${id(5)}`);
});

test("Reseller transaction scope excludes reassigned users while campaign scope includes assigned users", async () => {
    const { search, calls } = await fixture();
    const result = await search("Reseller", "TestUser");
    const campaigns = calls.find(([kind]) => kind === "campaigns")[1];
    const transactions = calls.find(([kind]) => kind === "transactions")[1];
    assert.deepEqual(Array.from(campaigns[0].$match.userId.$in, String), [1, 2, 3].map((n) => String(id(n))));
    assert.deepEqual(Array.from(transactions[0].$match.$or[1].toUser.$in, String), [1, 2].map((n) => String(id(n))));
    assert.equal(result.body.groups[1].items[0].href, `/reseller/users?account=${id(2)}`);
    assert.equal(result.body.groups[2].items[0].href, `/reseller/credits?transaction=${id(5)}`);
});

test("Admin search supports exact transaction references and returns direct record links", async () => {
    const { search, calls } = await fixture();
    const result = await search("Super Admin", String(id(5)));
    const pipeline = calls.find(([kind]) => kind === "transactions")[1];
    assert.equal(Object.keys(pipeline[0].$match).length, 0);
    assert.equal(String(pipeline[4].$match.$or.at(-1)._id), String(id(5)));
    assert.equal(pipeline[6].$limit, 5);
    assert.equal(result.body.groups[0].items[0].href, `/admin/campaigns/${id(4)}`);
    assert.equal(result.body.groups[2].items[0].href, `/admin/activity?transaction=${id(5)}`);
});
