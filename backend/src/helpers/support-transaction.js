// A support card exposes only the selected account's side of a ledger entry.
export function supportTransactionView(item, accountId) {
    const isFrom = String(item.fromUser) === String(accountId);
    const isTo = String(item.toUser) === String(accountId);
    if (!isFrom && !isTo) return null;
    if (item.category != null) {
        const postings = (item.postings || []).filter(row => String(row.userId) === String(accountId));
        if (!postings.length && item.type !== "REQUEST") return null;
        const available = postings.find(row => row.bucket === "available");
        const movement = available || postings[0];
        const direction = item.type === "REQUEST" ? "request" : movement.deltaQuantity < 0 ? "out" : "in";
        return {
            id: item._id, reference: `TXN-${String(item._id).toUpperCase()}`, type: item.type, category: item.category,
            amount: item.amount, direction, balanceAfter: available?.balanceAfterQuantity ?? null,
            heldAfter: postings.find(row => row.bucket === "reserved")?.balanceAfterQuantity ?? null,
            originalTransactionId: item.originalTransactionId || null,
            campaignId: item.campaignId || null, filterRequestId: item.filterRequestId || null, purchaseId: item.purchaseId || null, createdAt: item.createdAt,
        };
    }
    const direction = item.type === "REQUEST" ? "request" : item.type === "DEDUCT" ? "out" : isTo ? "in" : "out";
    const balanceAfter = direction === "request" ? null : isFrom && isTo ? item.balanceAfterTo ?? item.balanceAfterFrom : isTo ? item.balanceAfterTo : item.balanceAfterFrom;
    return {
        id: item._id, reference: `TXN-${String(item._id).toUpperCase()}`, type: item.type,
        amount: item.amount, direction, balanceAfter, campaignId: item.campaignId || null, createdAt: item.createdAt,
    };
}
