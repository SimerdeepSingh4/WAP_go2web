import { creditAmount, creditMinor } from "./credit-amount.js";
import { queueCreditCheck } from "./credit-audit-job.js";

export function buildCreditPostings(record) {
    const amountMinor = creditMinor(record.amount);
    if (amountMinor <= 0) throw new Error("A ledger amount must be positive");
    const entries = [];
    const wallet = (userId, deltaMinor, after) => {
        if (!userId || after === null || after === undefined) throw new Error("A credit movement must include its wallet balance snapshot");
        const balanceAfterMinor = creditMinor(after);
        const balanceBeforeMinor = balanceAfterMinor - deltaMinor;
        if (balanceAfterMinor < 0 || balanceBeforeMinor < 0) throw new Error("A ledger movement cannot overdraw a wallet");
        entries.push({ account: `wallet:${userId}`, userId, deltaMinor, balanceBeforeMinor, balanceAfterMinor });
    };
    if (record.type === "REQUEST") return [];
    if (record.type === "DEDUCT") wallet(record.fromUser || record.toUser, -amountMinor, record.balanceAfterFrom ?? record.balanceAfterTo);
    else if (record.type === "REFUND") wallet(record.toUser, amountMinor, record.balanceAfterTo);
    else if (record.type === "ALLOCATE") {
        if (record.fromUser && record.balanceAfterFrom != null) wallet(record.fromUser, -amountMinor, record.balanceAfterFrom);
        wallet(record.toUser, amountMinor, record.balanceAfterTo);
    } else if (record.type === "RECLAIM") {
        wallet(record.fromUser, -amountMinor, record.balanceAfterFrom);
        if (record.balanceAfterTo != null) wallet(record.toUser, amountMinor, record.balanceAfterTo);
    } else throw new Error("Unknown credit movement type");
    const net = entries.reduce((sum, entry) => sum + entry.deltaMinor, 0);
    if (net) entries.push({ account: record.campaignId ? `campaign:${record.campaignId}` : "system:credit-pool", deltaMinor: -net });
    if (entries.reduce((sum, entry) => sum + entry.deltaMinor, 0) !== 0) throw new Error("Ledger entries must balance");
    return entries;
}

export function ledgerAccountingHooks(schema) {
    schema.post("save", async function (doc) { await queueCreditCheck([doc.fromUser, doc.toUser, ...(doc.postings || []).map(entry => entry.userId)], doc.$session()); });
    schema.pre("validate", function () {
        if (!this.isNew) return;
        this.amount = creditAmount(this.amount);
        this.amountMinor = creditMinor(this.amount);
        this.postings = buildCreditPostings(this);
    });
    schema.pre("save", function () {
        if (!this.isNew) throw new Error("Posted credit transactions are immutable. Post a reversal instead.");
        if (this.type !== "REQUEST" && !this.$session()?.inTransaction()) throw new Error("Credit ledger writes require an active wallet transaction");
    });
    for (const method of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete"]) {
        schema.pre(method, function () { throw new Error("Posted credit transactions cannot be changed or deleted. Post a reversal instead."); });
    }
}
