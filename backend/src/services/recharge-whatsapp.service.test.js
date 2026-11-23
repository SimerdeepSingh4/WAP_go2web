import test from "node:test";
import assert from "node:assert/strict";
import CreditPurchase from "../models/credit-purchase.model.js";
import User from "../models/user.model.js";
import { deliverRechargeWhatsApp } from "./recharge-whatsapp.service.js";

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
