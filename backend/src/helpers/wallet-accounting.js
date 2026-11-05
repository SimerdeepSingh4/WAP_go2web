import { creditAmount, creditMinor } from "./credit-amount.js";

function requireTransaction(session) {
    if (!session?.inTransaction()) throw new Error("Wallet balance changes require an active ledger transaction");
}

export function walletAccountingHooks(schema) {
    for (const method of ["updateOne", "updateMany", "replaceOne", "findOneAndReplace"]) {
        schema.pre(method, function () {
            const update = this.getUpdate();
            if (Array.isArray(update) || update?.balance !== undefined || ["$set", "$inc", "$unset", "$mul", "$rename"].some((op) => update?.[op]?.balance !== undefined || update?.[op]?.balanceMinor !== undefined)) throw new Error("Use an audited wallet increment to change balances");
        });
    }
    schema.pre("save", function () {
        if (!this.isModified("balance")) return;
        if (!this.isNew || Number(this.balance) !== 0) requireTransaction(this.$session());
        this.balance = creditAmount(this.balance);
        this.balanceMinor = creditMinor(this.balance);
    });

    schema.pre("findOneAndUpdate", function () {
        const update = this.getUpdate();
        if (Array.isArray(update)) throw new Error("Use an audited wallet increment instead of a custom balance pipeline");
        const delta = update?.$inc?.balance;
        if (delta === undefined) {
            if (update?.balance !== undefined || update?.balanceMinor !== undefined || update?.$set?.balance !== undefined || update?.$set?.balanceMinor !== undefined || update?.$unset?.balance !== undefined || update?.$unset?.balanceMinor !== undefined) {
                throw new Error("Wallet balances cannot be replaced; post an audited credit movement instead");
            }
            return;
        }
        requireTransaction(this.getOptions().session);
        const minor = creditMinor(delta);
        if (Object.keys(update.$inc).some((key) => key !== "balance")) throw new Error("Unsupported wallet increment");
        if (minor < 0) {
            this.setQuery({ $and: [this.getFilter(), { balance: { $gte: -minor / 100 } }] });
            this.setOptions({ upsert: false });
        }
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
