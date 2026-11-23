import CreditPurchase from "../models/credit-purchase.model.js";
import User from "../models/user.model.js";
import { NotificationEvent } from "../models/notification.model.js";
import { roleBase } from "../helpers/notification-policy.js";

export async function queueRechargeAlerts(purchase, stage, session) {
    const eventKey = `recharge:${purchase._id}:proof:${stage}`;
    const data = { id: purchase._id, buyerId: purchase.buyerId, sellerId: purchase.sellerId, stage, version: purchase.updatedAt.getTime() };
    const events = [{ eventKey, kind: "recharge", data }];
    if (process.env.WHATSAPP_RECHARGE_RECIPIENTS) {
        events.push({ eventKey: `${eventKey}:whatsapp`, kind: "recharge-whatsapp", data });
    }
    await NotificationEvent.create(events, { session, ordered: true });
}

export async function deliverRechargeWhatsApp({ data }) {
    const env = process.env;
    const recipients = JSON.parse(env.WHATSAPP_RECHARGE_RECIPIENTS || "{}");
    const to = recipients[String(data.sellerId)];
    if (!to) return;
    if (!/^\+[1-9]\d{6,14}$/.test(to)) throw new Error("Invalid reviewer WhatsApp number");
    const purchase = await CreditPurchase.findOne({ _id: data.id, sellerId: data.sellerId, status: { $in: ["PENDING", "REVIEW_REQUIRED"] } }).lean();
    if (!purchase || (data.stage === "submitted" && purchase.fixedAt)) return;
    const seller = await User.findById(purchase.sellerId).select("role status expiresAt").lean();
    if (!seller || !["Super Admin", "Reseller"].includes(seller.role) || seller.status !== "active" || (seller.expiresAt && seller.expiresAt <= new Date())) return;
    const buyer = await User.findById(purchase.buyerId).select("username").lean();
    if (!/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION) || !/^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID) || !env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_RECHARGE_TEMPLATE) {
        throw new Error("WhatsApp recharge sender settings are incomplete");
    }
    const url = new URL(`${roleBase(seller.role)}/credits?tab=requests`, env.WHATSAPP_PANEL_URL);
    if (url.protocol !== "https:") throw new Error("WhatsApp panel URL requires HTTPS");
    const values = [
        data.stage === "fixed" ? "Corrected payment proof" : "New payment proof",
        buyer?.username || "Account", String(purchase._id).slice(-8),
        purchase.quantity.toLocaleString("en-IN"), purchase.category === "NUMBER_FILTERING" ? "Number filtering" : "Campaign",
        (purchase.totalPaisa / 100).toFixed(2), purchase.paymentReference, url.href,
    ];
    const response = await fetch(`https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST", signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: to.slice(1), type: "template", template: {
            name: env.WHATSAPP_RECHARGE_TEMPLATE, language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US" },
            components: [{ type: "body", parameters: values.map(value => ({ type: "text", text: String(value).replace(/\s+/g, " ").trim() })) }],
        } }),
    });
    if (!response.ok) throw new Error(`WhatsApp recharge notification failed (HTTP ${response.status})`);
}
