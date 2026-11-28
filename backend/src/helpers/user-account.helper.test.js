import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

Object.assign(process.env, {
    MONGO_URI: "mongodb://127.0.0.1/user-account-helper-test",
    JWT_SECRET: "user-account-helper-test-secret",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "6379",
    REDIS_PASSWORD: "test",
    AUDIT_SIGNING_KEY: "user-account-helper-audit-key-at-least-32-bytes",
    DOTENV_CONFIG_QUIET: "true",
});

const { default: userModel } = await import("../models/user.model.js");
const { default: walletModel } = await import("../models/wallet.model.js");
const { default: CreditPurchaseRate } = await import("../models/credit-purchase-rate.model.js");
const { default: platformSettings } = await import("../models/platformSettings.model.js");
const { NotificationEvent } = await import("../models/notification.model.js");
const { createUserWithWallet } = await import("./user-account.helper.js");
const { createUser } = await import("../controllers/user.controller.js");

let mongo;

before(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    await Promise.all([userModel.init(), walletModel.init(), CreditPurchaseRate.init(), platformSettings.init(), NotificationEvent.init()]);
});

after(async () => {
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
});

function mockResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
}

test("createUserWithWallet rolls back user creation when wallet creation fails", async (t) => {
    const originalCreate = walletModel.create.bind(walletModel);
    t.mock.method(walletModel, "create", async () => {
        throw new Error("Simulated wallet creation failure");
    });

    await assert.rejects(
        () => createUserWithWallet({
            username: "rollback-user",
            email: "rollback@example.test",
            password: "password123",
            role: "User",
        }),
        /Simulated wallet creation failure/
    );

    assert.equal(await userModel.countDocuments({ email: "rollback@example.test" }), 0);
    assert.equal(await walletModel.countDocuments({}), 0);
    t.mock.restoreAll();
    assert.equal(typeof originalCreate, "function");
});

test("createUser applies platform defaults, creates wallet, and returns complete account details", async () => {
    await platformSettings.updateOne(
        { _id: "platform" },
        { $set: { defaultRatePerMsg: 7, accountExpiryValue: 1, accountExpiryUnit: "years" } },
        { upsert: true }
    );

    const res = mockResponse();
    await createUser(
        {
            body: {
                username: "  Fresh User  ",
                email: "FreshUser@Example.Test",
                phone: "9876543210",
                companyName: "Acme Corp",
                password: "password123",
                dailyCampaignLimit: 5,
                featureAccess: { campaignNumber: true, reclaimCredit: true },
            },
            user: { _id: new mongoose.Types.ObjectId(), role: "Super Admin" },
        },
        res
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.email, "freshuser@example.test");
    assert.equal(res.body.user.ratePerMsg, 7);
    assert.equal(res.body.user.maxVideoSizeMB, 3);
    assert.equal(res.body.user.dailyCampaignLimit, 5);
    assert.equal(res.body.user.phone, "9876543210");
    assert.equal(res.body.user.dp_img, "");
    assert.equal(res.body.user.featureAccess.campaignNumber, true);
    assert.equal(res.body.user.featureAccess.reclaimCredit, true);
    assert.ok(res.body.user.expiresAt);

    const wallet = await walletModel.findOne({ userId: res.body.user.id }).lean();
    assert.ok(wallet);
    assert.equal(wallet.balance, 0);
});

test("createUser rejects invalid role, invalid resellerId, and invalid expiry date with 400", async () => {
    const admin = { _id: new mongoose.Types.ObjectId(), role: "Super Admin" };

    const badRole = mockResponse();
    await createUser(
        { body: { username: "a", email: "badrole@example.test", password: "password123", role: "Super Admin" }, user: admin },
        badRole
    );
    assert.equal(badRole.statusCode, 400);

    const badReseller = mockResponse();
    await createUser(
        { body: { username: "b", email: "badreseller@example.test", password: "password123", resellerId: "not-an-id" }, user: admin },
        badReseller
    );
    assert.equal(badReseller.statusCode, 400);

    const badExpiry = mockResponse();
    await createUser(
        { body: { username: "c", email: "badexpiry@example.test", password: "password123", expiresAt: "not-a-date" }, user: admin },
        badExpiry
    );
    assert.equal(badExpiry.statusCode, 400);
});

test("createUser allows multiple accounts with the same email and phone number", async () => {
    const admin = { _id: new mongoose.Types.ObjectId(), role: "Super Admin" };
    const shared = { email: "shared@example.test", phone: "+919876543210", companyName: "Acme Corp", password: "password123" };

    const first = mockResponse();
    await createUser({ body: { ...shared, username: "Shared User 1" }, user: admin }, first);
    assert.equal(first.statusCode, 201);

    const second = mockResponse();
    await createUser({ body: { ...shared, username: "Shared User 2" }, user: admin }, second);
    assert.equal(second.statusCode, 201);
});

test("createUser configures optional initial purchase rates atomically and rejects invalid rates", async () => {
    const reseller = { _id: new mongoose.Types.ObjectId(), role: "Reseller" };

    const invalid = mockResponse();
    await createUser(
        {
            body: {
                username: "Invalid Rate Buyer",
                email: "badrate@example.test",
                phone: "9876543211",
                companyName: "Acme Corp",
                password: "password123",
                purchaseRates: { CAMPAIGN: "-0.5" },
            },
            user: reseller,
        },
        invalid
    );
    assert.equal(invalid.statusCode, 400);
    assert.equal(await userModel.countDocuments({ email: "badrate@example.test" }), 0);

    const created = mockResponse();
    await createUser(
        {
            body: {
                username: "Priced User",
                email: "priced@example.test",
                phone: "9876543212",
                companyName: "Acme Corp",
                password: "password123",
                purchaseRates: { CAMPAIGN: "0.35", NUMBER_FILTERING: "0.12" },
            },
            user: reseller,
        },
        created
    );
    assert.equal(created.statusCode, 201);
    const savedRates = await CreditPurchaseRate.find({ buyerId: created.body.user.id }).lean();
    assert.equal(savedRates.length, 2);
    const rateMap = Object.fromEntries(savedRates.map((r) => [r.category, r.unitPriceInr.toString()]));
    assert.equal(rateMap.CAMPAIGN, "0.35");
    assert.equal(rateMap.NUMBER_FILTERING, "0.12");
});
