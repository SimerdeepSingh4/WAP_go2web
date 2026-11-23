import { CAMPAIGN_CREDITS, CREDIT_CATEGORIES, NUMBER_FILTERING_CREDITS, isCreditQuantity } from "./credit-categories.js";

const same = (a, b) => String(a ?? "") === String(b ?? "");

export function categoryWalletMovements(record, { systemReclaim = false } = {}) {
    const { category, type, amount, fromUser, toUser, purchaseId, campaignId, filterRequestId, originalTransactionId, fromReserved } = record;
    if (!CREDIT_CATEGORIES.includes(category) || !isCreditQuantity(amount) || !amount || !toUser) throw new Error("Choose a credit category and a positive whole credit quantity.");
    if (purchaseId && !["ALLOCATE", "RESERVE", "RELEASE"].includes(type)
        || fromReserved && (type !== "ALLOCATE" || !fromUser || !purchaseId)) {
        throw new Error("This credit movement cannot use a purchase or reserved credits.");
    }
    if (campaignId && (category !== CAMPAIGN_CREDITS || !["DEDUCT", "REFUND"].includes(type))
        || filterRequestId && (category !== NUMBER_FILTERING_CREDITS || type !== "DEDUCT")) {
        throw new Error("The usage reference does not belong to this credit movement.");
    }
    if (type === "DEDUCT" && (!same(fromUser, toUser) || !(campaignId || filterRequestId))) throw new Error("Usage requires the affected wallet and its work reference.");
    if (type === "REFUND" && (category !== CAMPAIGN_CREDITS || !campaignId || !originalTransactionId)) throw new Error("A campaign refund requires the original campaign debit.");
    if (originalTransactionId && (category !== CAMPAIGN_CREDITS || !campaignId || !["REFUND", "DEDUCT"].includes(type))) {
        throw new Error("Only a campaign refund or its correction may reference the original debit.");
    }
    if (["RESERVE", "RELEASE"].includes(type) && (!purchaseId || !same(fromUser, toUser))) throw new Error("Reserving or releasing credits requires the seller's wallet and purchase.");
    if (["ALLOCATE", "RECLAIM"].includes(type) && same(fromUser, toUser) || type === "RECLAIM" && !fromUser) throw new Error("Choose distinct source and destination accounts.");

    const debit = bucket => ({ side: "From", userId: fromUser, bucket, deltaQuantity: -amount });
    const credit = bucket => ({ side: "To", userId: toUser, bucket, deltaQuantity: amount });
    switch (type) {
        case "ALLOCATE": return [...(fromUser ? [debit(fromReserved ? "reserved" : "available")] : []), credit("available")];
        case "DEDUCT": return [debit("available")];
        case "REFUND": return [credit("available")];
        case "RECLAIM": return [debit("available"), ...(systemReclaim ? [] : [credit("available")])];
        case "RESERVE": return [debit("available"), credit("reserved")];
        case "RELEASE": return [debit("reserved"), credit("available")];
        case "REQUEST": return [];
        default: throw new Error("Unsupported categorized credit movement.");
    }
}

export function buildCategoryPostings(record, options) {
    const { category } = record;
    const entries = categoryWalletMovements(record, options).map(({ side, userId, bucket, deltaQuantity }) => {
        const balanceAfterQuantity = record[`balanceAfter${side}`];
        const balanceBeforeQuantity = balanceAfterQuantity - deltaQuantity;
        if (!isCreditQuantity(balanceAfterQuantity) || !isCreditQuantity(balanceBeforeQuantity)) throw new Error("A category posting needs valid wallet snapshots.");
        return { account: `wallet:${userId}:${category}:${bucket}`, userId, category, bucket, deltaQuantity, balanceBeforeQuantity, balanceAfterQuantity };
    });
    const net = entries.reduce((sum, entry) => sum + entry.deltaQuantity, 0);
    if (net) {
        const account = record.campaignId ? `campaign:${record.campaignId}`
            : record.filterRequestId ? `number-filter:${record.filterRequestId}` : "system:credit-pool";
        entries.push({ account: `${account}:${category}`, category, deltaQuantity: -net });
    }
    return entries;
}
