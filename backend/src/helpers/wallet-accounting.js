import { creditAmount, creditMinor } from "./credit-amount.js";
import { queueCreditCheck } from "./credit-audit-job.js";
import { creditInvariantError, guardCreditSession, recordWalletMovement } from "./credit-session-guard.js";

const financialPath = key => /^(balance|balanceMinor)(\.|$)/.test(key);
function financialEdits(update) {
    if (Array.isArray(update)) throw creditInvariantError("Custom wallet update pipelines are not allowed.");
    const edits = [];
    for (const [operator, value] of Object.entries(update || {})) {
        if (financialPath(operator)) edits.push({ operator: "replacement", key: operator });
        if (operator.startsWith("$") && value && typeof value === "object") for (const [key, target] of Object.entries(value)) {
            if (financialPath(key) || operator === "$rename" && typeof target === "string" && financialPath(target)) edits.push({ operator, key });
        }
    }
    return edits;
}

function requireTransaction(session) {
    if (!session?.inTransaction()) throw new Error("Wallet balance changes require an active ledger transaction");
}

export function walletAccountingHooks(schema) {
    schema.post("save", async function (doc) {
        if (doc.$locals.creditBalanceChanged) recordWalletMovement(doc.$session(), doc.$locals.creditBefore, doc);
        await queueCreditCheck([doc.userId], doc.$session());
    });
    schema.post("findOneAndUpdate", async function (doc) {
        if (doc && this.creditBalanceChanged) recordWalletMovement(this.getOptions().session, this.creditBefore, doc);
        if (doc) await queueCreditCheck([doc.userId], this.getOptions().session);
    });
    for (const method of ["updateOne", "updateMany", "replaceOne", "findOneAndReplace"]) {
        schema.pre(method, function () {
            if (["replaceOne", "findOneAndReplace"].includes(method) || financialEdits(this.getUpdate()).length) throw creditInvariantError("Use an audited wallet posting to change balances.");
        });
    }
    for (const method of ["insertMany", "bulkWrite"]) schema.pre(method, function () { throw creditInvariantError("Bulk wallet writes cannot bypass credit posting and audit hooks."); });
    schema.pre("save", async function () {
        if (!this.isModified("balance") && !this.isNew) {
            if (this.isModified("balanceMinor")) throw creditInvariantError("The stored integer balance cannot be edited independently.");
            this.$locals.creditBalanceChanged = false;
            return;
        }
        if (!this.isNew || Number(this.balance) !== 0) requireTransaction(this.$session());
        this.balance = creditAmount(this.balance);
        this.balanceMinor = creditMinor(this.balance);
        this.$locals.creditBefore = this.isNew ? null : await this.constructor.findById(this._id).select("userId balance balanceMinor").session(this.$session()).lean();
        if (this.$locals.creditBefore?.balanceMinor != null && this.$locals.creditBefore.balanceMinor !== creditMinor(this.$locals.creditBefore.balance)) throw creditInvariantError("The existing wallet balance formats need an explicit reconciliation.");
        this.$locals.creditBalanceChanged = true;
    });

    schema.pre("findOneAndUpdate", async function () {
        const update = this.getUpdate();
        const edits = financialEdits(update);
        const delta = update?.$inc?.balance;
        if (delta === undefined) {
            if (edits.length) throw creditInvariantError("Wallet balances require an audited credit posting.");
            return;
        }
        if (edits.some(edit => edit.operator !== "$inc" || edit.key !== "balance")) throw creditInvariantError("A wallet posting cannot separately edit either saved balance.");
        requireTransaction(this.getOptions().session);
        guardCreditSession(this.getOptions().session);
        const minor = creditMinor(delta);
        if (Object.keys(update.$inc).some((key) => key !== "balance")) throw new Error("Unsupported wallet increment");
        if (minor < 0) {
            this.setQuery({ $and: [this.getFilter(), { balance: { $gte: -minor / 100 } }] });
            this.setOptions({ upsert: false });
        }
        this.creditBefore = await this.model.findOne(this.getFilter()).select("userId balance balanceMinor").session(this.getOptions().session).lean();
        if (this.creditBefore?.balanceMinor != null && this.creditBefore.balanceMinor !== creditMinor(this.creditBefore.balance)) throw creditInvariantError("The existing wallet balance formats need an explicit reconciliation.");
        const targetMinor = creditMinor(this.creditBefore?.balance ?? 0) + minor;
        if ((this.creditBefore || this.getOptions().upsert) && (!Number.isSafeInteger(targetMinor) || targetMinor < 0)) throw creditInvariantError("The wallet result is outside the supported credit range.");
        this.creditBalanceChanged = true;
        this.setOptions({ returnDocument: "after" });
        // Compute in integer hundredths on MongoDB, then maintain the existing
        // public balance field for older clients. No floating-point accumulation.
        const set = {};
        for (const [key, value] of Object.entries(update.$setOnInsert || {})) {
            set[key] = { $ifNull: [`$${key}`, { $literal: value }] };
        }
        for (const [key, value] of Object.entries(update.$set || {})) set[key] = { $literal: value };
        set.balanceMinor = { $add: [
            { $round: [{ $multiply: [{ $ifNull: ["$balance", 0] }, 100] }, 0] }, minor,
        ] };
        this.setOptions({ updatePipeline: true });
        this.setUpdate([{ $set: set }, { $set: { balance: { $divide: ["$balanceMinor", 100] } } }]);
    });
}
