import CreditPurchase from "../models/credit-purchase.model.js";
import User from "../models/user.model.js";
import { NotificationEvent } from "../models/notification.model.js";
import { roleBase } from "../helpers/notification-policy.js";

export const rechargeNumberPattern = /^\+[1-9]\d{6,14}$/;

export function buyerRechargeChatLink(purchase, viewerId) {
    const seller = purchase.sellerId;
    const buyerId = String(purchase.buyerId?._id || purchase.buyerId || "");
    const viewer = String(viewerId || "");
    if (!buyerId || buyerId !== viewer ||
        !purchase.paymentProofKey || !["PENDING", "REVIEW_REQUIRED"].includes(purchase.status) ||
        !["Reseller", "Super Admin"].includes(seller?.role) || seller.status !== "active" ||
        (seller.expiresAt && seller.expiresAt <= new Date()) ||
        !seller?.rechargeWhatsAppNumber ||
        !rechargeNumberPattern.test(String(seller.rechargeWhatsAppNumber).trim())) return null;
    const credits = purchase.category === "NUMBER_FILTERING" ? "number filtering" : "campaign";
    const cleanNumber = String(seller.rechargeWhatsAppNumber).trim();
    const message = `Hello, I've submitted payment proof for recharge #${String(purchase._id).slice(-8)} for ${purchase.quantity.toLocaleString("en-IN")} ${credits} credits. Please review my request.`;
    return `https://wa.me/${cleanNumber.slice(1)}?text=${encodeURIComponent(message)}`;
}

export function rechargeSenderConfigured(env = process.env) {
    return Boolean(/^v\d+\.\d+$/.test(env.WHATSAPP_GRAPH_VERSION) &&
        /^\d+$/.test(env.WHATSAPP_PHONE_NUMBER_ID) && env.WHATSAPP_ACCESS_TOKEN?.trim() &&
        env.WHATSAPP_RECHARGE_TEMPLATE?.trim() && URL.canParse(env.WHATSAPP_PANEL_URL) &&
        new URL(env.WHATSAPP_PANEL_URL).protocol === "https:");
}

export function rechargeRecipient(account, accountId) {
    // An explicitly cleared website setting also disables any legacy destination.
    return account.rechargeWhatsAppNumber ?? JSON.parse(process.env.WHATSAPP_RECHARGE_RECIPIENTS || "{}")[String(accountId)] ?? "";
}

export async function queueRechargeAlerts(purchase, stage, session) {
    const eventKey = `recharge:${purchase._id}:proof:${stage}`;
    const data = { id: purchase._id, buyerId: purchase.buyerId, sellerId: purchase.sellerId, stage, version: purchase.updatedAt.getTime() };
    const events = [{ eventKey, kind: "recharge", data }];
    events.push({ eventKey: `${eventKey}:whatsapp`, kind: "recharge-whatsapp", data });
    await NotificationEvent.create(events, { session, ordered: true });
}   

export async function deliverRechargeWhatsApp({ data }) {
    const env = process.env;
    const seller = await User.findById(data.sellerId).select("role status expiresAt +rechargeWhatsAppNumber").lean();
    if (!seller || !["Super Admin", "Reseller"].includes(seller.role) || seller.status !== "active" || (seller.expiresAt && seller.expiresAt <= new Date())) return;
    const to = rechargeRecipient(seller, data.sellerId);
    if (!to) return;
    if (!rechargeNumberPattern.test(to)) throw new Error("Invalid reviewer WhatsApp number");
    const purchase = await CreditPurchase.findOne({ _id: data.id, sellerId: data.sellerId, status: { $in: ["PENDING", "REVIEW_REQUIRED"] } }).lean();
    if (!purchase || (data.stage === "submitted" && purchase.fixedAt)) return;
    const buyer = await User.findById(purchase.buyerId).select("username").lean();
    if (!rechargeSenderConfigured(env)) {
        throw new Error("WhatsApp recharge sender settings are incomplete");
    }
    const url = new URL(`${roleBase(seller.role)}/credits?tab=requests`, env.WHATSAPP_PANEL_URL);
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
