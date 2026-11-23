import CreditPurchase from "../models/credit-purchase.model.js";
import Transaction from "../models/transaction.model.js";
import { runCreditTransaction } from "../helpers/credit-operation.js";
import { postCreditMovement } from "./credit-posting.service.js";
import { notifyUser } from "./socket.service.js";
import { categoryBalances } from "../helpers/credit-categories.js";

export async function releasePurchaseHold(purchase, actor, session) {
    if (purchase.reservationFree) return null;
    const events = await Transaction.find({ purchaseId: purchase._id }).select("type").session(session).lean();
    const posted = new Set(events.map(event => event.type));
    if (!posted.has("RESERVE") || posted.has("RELEASE") || posted.has("ALLOCATE")) return null;
    return postCreditMovement({
        session, operationKey: 'purchase:' + purchase._id + ':release',
        type: "RELEASE", category: purchase.category, amount: purchase.quantity,
        fromUser: purchase.sellerId, toUser: purchase.sellerId, performedBy: actor,
        purchaseId: purchase._id, notes: "Released stock held for recharge.",
    });
}

export function notifyPurchaseStock(purchase, posting) {
    if (!posting?.fromWallet) return;
    const { available, reserved } = categoryBalances(posting.fromWallet)[purchase.category];
    const stock = posting.transaction.type;
    return notifyUser(purchase.sellerId, "WALLET_UPDATED", {
        category: purchase.category, newBalance: available, reserved,
        reason: stock, transactionId: posting.transaction._id, purchaseId: purchase._id,
    });
}

export async function expirePurchaseHold(purchase, now, session) {
    if (purchase.holdExpiryProcessedAt || purchase.expiresAt > now || !["QUOTED", "EXPIRED"].includes(purchase.status)) return null;
    const posting = await releasePurchaseHold(purchase, purchase.sellerId, session);
    purchase.status = "EXPIRED";
    purchase.holdExpiryProcessedAt = now;
    await purchase.save({ session });
    return posting;
}

export async function expireDueCreditQuotes(now = new Date()) {
    const due = await CreditPurchase.find({
        $or: [
            { status: { $in: ["QUOTED", "EXPIRED"] }, holdExpiryProcessedAt: null, expiresAt: { $lte: now } },
            { status: { $in: ["QUOTED", "PENDING", "FLAGGED", "REVIEW_REQUIRED"] }, reservationFree: { $ne: true } },
        ],
    }).select("sellerId").sort({ expiresAt: 1, _id: 1 }).limit(50).lean();
    for (const { _id, sellerId } of due) {
        try {
            const result = await runCreditTransaction(async session => {
                const purchase = await CreditPurchase.findById(_id).session(session);
                if (!purchase) return null;
                if (!purchase.reservationFree && ["QUOTED", "PENDING", "FLAGGED", "REVIEW_REQUIRED"].includes(purchase.status)) {
                    const posting = await releasePurchaseHold(purchase, sellerId, session);
                    purchase.reservationFree = true;
                    await purchase.save({ session });
                    await expirePurchaseHold(purchase, now, session);
                    return { purchase, posting };
                }
                return { purchase, posting: await expirePurchaseHold(purchase, now, session) };
            }, { walletIds: [sellerId] });
            if (result) await notifyPurchaseStock(result.purchase, result.posting);
        } catch (error) {
            console.error("Credit quote expiry failed", String(_id), error.code || error.name);
        }
    }
}
