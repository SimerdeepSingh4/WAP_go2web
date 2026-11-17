import test from "node:test";
import assert from "node:assert/strict";
import Settings from "../models/platformSettings.model.js";
import Wallet from "../models/wallet.model.js";
import { getPlatformSettingsDoc, calculateDefaultAccountExpiry } from "./platform-settings.service.js";

test("legacy expiry settings preserve the account default without exposing credit-expiry settings", async t => {
    t.mock.method(Settings, "findById", () => ({ lean: async () => ({ creditExpiryValue: 6, creditExpiryUnit: "months" }) }));
    const settings = await getPlatformSettingsDoc();
    assert.equal(settings.accountExpiryValue, 6);
    assert.equal(settings.accountExpiryUnit, "months");
    assert.equal(Object.hasOwn(settings, "creditExpiryValue"), false);
    assert.equal(Object.hasOwn(settings, "creditExpiryUnit"), false);
    assert.equal((await calculateDefaultAccountExpiry(new Date("2026-01-15T12:00:00Z"))).toISOString(), "2026-07-15T23:59:59.999Z");
});

test("account-expiry settings take priority and still support no expiry", async t => {
    t.mock.method(Settings, "findById", () => ({ lean: async () => ({ accountExpiryValue: 0, accountExpiryUnit: "never", creditExpiryValue: 2, creditExpiryUnit: "years" }) }));
    assert.equal(await calculateDefaultAccountExpiry(), null);
});

test("new wallets have no expiry field or automatic expiry default", () => {
    assert.equal(Wallet.schema.path("expiresAt"), undefined);
    const wallet = new Wallet({ userId: "507f1f77bcf86cd799439011" });
    assert.equal(Object.hasOwn(wallet.toObject(), "expiresAt"), false);
    assert.equal(wallet.isLocked, false);
});
