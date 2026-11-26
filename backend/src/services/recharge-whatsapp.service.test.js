import test from "node:test";
import assert from "node:assert/strict";
import CreditPurchase from "../models/credit-purchase.model.js";
import User from "../models/user.model.js";
import { buyerRechargeChatLink, deliverRechargeWhatsApp, rechargeRecipient, rechargeSenderConfigured } from "./recharge-whatsapp.service.js";
import { updateRechargeAlertSettings } from "../controllers/recharge-alert-settings.controller.js";

test("the buyer can open a prepared WhatsApp message to the recorded reviewer after submitting proof", () => {
    const order = { _id: "quote12345", buyerId: { _id: "buyer" }, paymentProofKey: "private", status: "PENDING",
        quantity: 100, category: "CAMPAIGN" };
    for (const [role, number] of [["Super Admin", "+15550100123"], ["Reseller", "+15550100124"]]) {
        order.sellerId = { role, status: "active", rechargeWhatsAppNumber: number };
        const link = new URL(buyerRechargeChatLink(order, "buyer"));
        assert.equal(link.origin, "https://wa.me");
        assert.equal(link.pathname, "/" + number.slice(1));
        assert.match(link.searchParams.get("text"), /100 campaign credits/);
        assert.equal(buyerRechargeChatLink(order, "other"), null);
        assert.equal(buyerRechargeChatLink({ ...order, paymentProofKey: null }, "buyer"), null);
        assert.equal(buyerRechargeChatLink({ ...order, sellerId: { ...order.sellerId, rechargeWhatsAppNumber: "" } }, "buyer"), null);
    }
});

test("sender setup requires all delivery settings and a secure panel URL", () => {
    const valid = { WHATSAPP_GRAPH_VERSION: "v25.0", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_ACCESS_TOKEN: "test",
        WHATSAPP_RECHARGE_TEMPLATE: "review", WHATSAPP_PANEL_URL: "https://panel.example" };
    assert.equal(rechargeSenderConfigured(valid), true);
    for (const key of Object.keys(valid)) assert.equal(rechargeSenderConfigured({ ...valid, [key]: "" }), false);
    assert.equal(rechargeSenderConfigured({ ...valid, WHATSAPP_PANEL_URL: "http://panel.example" }), false);
});

test("a website number overrides the legacy recipient and clearing it disables delivery", t => {
    t.mock.method(JSON, "parse", () => assert.fail("Unexpected legacy lookup"));
    assert.equal(rechargeRecipient({ rechargeWhatsAppNumber: "+919876543210" }, "seller"), "+919876543210");
    assert.equal(rechargeRecipient({ rechargeWhatsAppNumber: "" }, "seller"), "");
});

test("malformed WHATSAPP_RECHARGE_RECIPIENTS falls back to empty string without throwing", t => {
    const previous = process.env.WHATSAPP_RECHARGE_RECIPIENTS;
    process.env.WHATSAPP_RECHARGE_RECIPIENTS = "{invalid-json";
    t.after(() => {
        if (previous === undefined) delete process.env.WHATSAPP_RECHARGE_RECIPIENTS;
        else process.env.WHATSAPP_RECHARGE_RECIPIENTS = previous;
    });
    assert.equal(rechargeRecipient({}, "seller"), "");
});

test("the settings endpoint validates numbers and updates only the signed-in account", async t => {
    const writes = [];
    t.mock.method(User, "updateOne", async (filter, update) => {
        assert.deepEqual(filter, { _id: "self" });
        writes.push(update.$set.rechargeWhatsAppNumber);
        return { matchedCount: 1 };
    });
    for (const [number, code] of [["123", 400], ["+919876543210", 200], ["", 200]]) {
        const res = { code: 200, status(n) { this.code = n; return this; }, json() {} };
        await updateRechargeAlertSettings({ user: { _id: "self" }, body: { number, sellerId: "other" } }, res);
        assert.equal(res.code, code);
    }
    assert.deepEqual(writes, ["+919876543210", ""]);
});

for (const [role, base] of [["Reseller", "reseller"], ["Super Admin", "admin"]]) {
    test(`sends a recharge notice to the assigned ${role} with a panel link`, async t => {
        const settings = { WHATSAPP_RECHARGE_RECIPIENTS: '{"seller":"+15550100123","another":"+15550100124"}',
            WHATSAPP_GRAPH_VERSION: "v25.0", WHATSAPP_PHONE_NUMBER_ID: "123", WHATSAPP_ACCESS_TOKEN: "test",
            WHATSAPP_RECHARGE_TEMPLATE: "review_recharge", WHATSAPP_PANEL_URL: "https://panel.example" };
        const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
        Object.assign(process.env, settings);
        t.after(() => { for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        } });
        t.mock.method(CreditPurchase, "findOne", filter => {
            assert.equal(filter.sellerId, "seller");
            return { lean: async () => ({ _id: "quote", buyerId: "buyer", sellerId: "seller", quantity: 100, category: "CAMPAIGN", totalPaisa: 2500, paymentReference: "REF" }) };
        });
        t.mock.method(User, "findById", id => ({ select: () => ({ lean: async () => id === "seller" ? { role, status: "active" } : { username: "Buyer" } }) }));
        const send = t.mock.method(globalThis, "fetch", async (_, options) => {
            const payload = JSON.parse(options.body);
            assert.equal(payload.to, "15550100123");
            assert.deepEqual(payload.template.components[0].parameters.map(item => item.text),
                ["New payment proof", "Buyer", "quote", "100", "Campaign", "25.00", "REF", `https://panel.example/${base}/credits?tab=requests`]);
            return { ok: true };
        });
        await deliverRechargeWhatsApp({ data: { sellerId: "seller", id: "quote", stage: "submitted" } });
        await deliverRechargeWhatsApp({ data: { sellerId: "unconfigured", id: "other" } });
        assert.equal(send.mock.callCount(), 1);
    });
}
