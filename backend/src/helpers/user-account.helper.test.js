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
const { NotificationEvent } = await import("../models/notification.model.js");
const { createUserWithWallet } = await import("./user-account.helper.js");
const { register } = await import("../controllers/auth.controller.js");

let mongo;

before(async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri(), { autoIndex: false });
    await Promise.all([userModel.init(), walletModel.init(), NotificationEvent.init()]);
});

after(async () => {
    await mongoose.disconnect();
    if (mongo) await mongo.stop();
});

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

test("register creates user + zero-balance wallet and defaults maxVideoSizeMB to 3", async () => {
    const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };

    await register(
        {
            body: {
                username: "freshuser",
                email: "freshuser@example.test",
                password: "password123",
            },
            user: { _id: new mongoose.Types.ObjectId(), role: "Super Admin" },
        },
        res
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.maxVideoSizeMB, 3);

    const wallet = await walletModel.findOne({ userId: res.body.user.id }).lean();
    assert.ok(wallet);
    assert.equal(wallet.balance, 0);
});
