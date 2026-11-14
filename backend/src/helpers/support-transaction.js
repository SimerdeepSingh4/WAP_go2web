// A support card exposes only the selected account's side of a ledger entry.
export function supportTransactionView(item, accountId) {
    const isFrom = String(item.fromUser) === String(accountId);
    const isTo = String(item.toUser) === String(accountId);
    if (!isFrom && !isTo) return null;
    const direction = item.type === "REQUEST" ? "request" : item.type === "DEDUCT" ? "out" : isTo ? "in" : "out";
    const balanceAfter = direction === "request" ? null : isFrom && isTo ? item.balanceAfterTo ?? item.balanceAfterFrom : isTo ? item.balanceAfterTo : item.balanceAfterFrom;
    return {
        id: item._id, reference: `TXN-${String(item._id).toUpperCase()}`, type: item.type,
        amount: item.amount, direction, balanceAfter, campaignId: item.campaignId || null, createdAt: item.createdAt,
    };
}
