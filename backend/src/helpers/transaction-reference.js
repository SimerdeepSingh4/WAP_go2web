// Use the complete, database-unique ledger ID. Never truncate financial references.
// Existing records get the same stable reference without modifying the ledger.
export function transactionReference(id) {
    const value = String(id ?? "");
    return /^[a-f\d]{24}$/i.test(value) ? `TXN-${value.toUpperCase()}` : null;
}

export function transactionObjectId(reference) {
    if (typeof reference !== "string") return null;
    const value = reference.trim().replace(/^TXN-/i, "");
    return /^[a-f\d]{24}$/i.test(value) ? value.toLowerCase() : null;
}
