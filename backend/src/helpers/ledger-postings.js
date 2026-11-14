import { creditAmount, creditMinor } from "./credit-amount.js";
import { queueCreditCheck } from "./credit-audit-job.js";
import { recordLedgerPostings } from "./credit-session-guard.js";
import mongoose from "mongoose";

export function buildCreditPostings(record, { systemReclaim = false } = {}) {
    const amountMinor = creditMinor(record.amount);
    if (amountMinor <= 0) throw new Error("A ledger amount must be positive");
    const entries = [];
    const wallet = (userId, deltaMinor, after) => {
        if (!userId || after === null || after === undefined) throw new Error("A credit movement must include its wallet balance snapshot");
        const balanceAfterMinor = creditMinor(after);
        const balanceBeforeMinor = balanceAfterMinor - deltaMinor;
        if (!Number.isSafeInteger(balanceBeforeMinor) || balanceAfterMinor < 0 || balanceBeforeMinor < 0) throw new Error("A ledger movement cannot overdraw a wallet or exceed the supported range");
        entries.push({ account: `wallet:${userId}`, userId, deltaMinor, balanceBeforeMinor, balanceAfterMinor });
    };
    if (record.type === "REQUEST") return [];
    if (record.type === "DEDUCT") wallet(record.fromUser || record.toUser, -amountMinor, record.balanceAfterFrom ?? record.balanceAfterTo);
    else if (record.type === "REFUND") wallet(record.toUser, amountMinor, record.balanceAfterTo);
    else if (record.type === "ALLOCATE") {
        if (record.fromUser) wallet(record.fromUser, -amountMinor, record.balanceAfterFrom);
        wallet(record.toUser, amountMinor, record.balanceAfterTo);
    } else if (record.type === "RECLAIM") {
        wallet(record.fromUser, -amountMinor, record.balanceAfterFrom);
        if (!systemReclaim) wallet(record.toUser, amountMinor, record.balanceAfterTo);
    } else throw new Error("Unknown credit movement type");
    const net = entries.reduce((sum, entry) => sum + entry.deltaMinor, 0);
    if (net) entries.push({ account: record.campaignId ? `campaign:${record.campaignId}` : "system:credit-pool", deltaMinor: -net });
    if (entries.reduce((sum, entry) => sum + entry.deltaMinor, 0) !== 0) throw new Error("Ledger entries must balance");
    return entries;
}

export function ledgerAccountingHooks(schema) {
    schema.post("save", async function (doc) {
        recordLedgerPostings(doc.$session(), doc);
        await queueCreditCheck([doc.fromUser, doc.toUser, ...(doc.postings || []).map(entry => entry.userId)], doc.$session());
    });
    schema.pre("validate", async function () {
        if (!this.isNew) return;
        this.amount = creditAmount(this.amount);
        this.amountMinor = creditMinor(this.amount);
        let systemReclaim = false;
        if (this.type === "ALLOCATE" && !this.fromUser || this.type === "RECLAIM" && this.balanceAfterTo == null) {
            const actor = await mongoose.model("User").findById(this.performedBy).select("role").session(this.$session()).lean();
            if (actor?.role !== "Super Admin" || this.type === "RECLAIM" && String(this.toUser) !== String(this.performedBy)) throw new Error("Only an explicit Super Admin issuance or reclaim may use the system credit pool");
            systemReclaim = this.type === "RECLAIM";
        }
        this.postings = buildCreditPostings(this, { systemReclaim });
    });
    schema.pre("save", function () {
        if (!this.isNew) throw new Error("Posted credit transactions are immutable. Post a reversal instead.");
        if (this.type !== "REQUEST" && !this.$session()?.inTransaction()) throw new Error("Credit ledger writes require an active wallet transaction");
    });
    for (const method of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete", "insertMany", "bulkWrite"]) {
        schema.pre(method, function () { throw new Error("Posted credit transactions cannot be changed or deleted. Post a reversal instead."); });
    }
}
