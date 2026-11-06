import { auditModelChange } from "../services/audit.service.js";
import { creditTransactionOptions } from "./credit-amount.js";
async function releaseOwned(target, error) {
    const session = target.auditOwnedSession;
    if (!session) return;
    try { if (error) { if (session.inTransaction()) await session.abortTransaction(); } else await session.commitTransaction(); }
    finally { await session.endSession(); target.auditOwnedSession = null; }
}
export function auditQueryHooks(schema, kind) {
    if (kind === "transaction") return;
    for (const method of ["updateOne", "updateMany", "replaceOne", "findOneAndReplace", "findOneAndUpdate", "deleteOne", "deleteMany", "findOneAndDelete"]) {
        if (kind === "wallet" && method === "findOneAndUpdate") continue;
        const deleting = /delete/i.test(method);
        schema.pre(method, { query: true, document: false }, async function () {
            if (!this.getOptions().session) {
                this.auditOwnedSession = await this.model.db.startSession();
                this.auditOwnedSession.startTransaction(creditTransactionOptions); this.setOptions({ session: this.auditOwnedSession });
            }
            const session = this.getOptions().session;
            let query = this.model.find(this.getFilter()).session(session);
            if (!["deleteMany", "updateMany"].includes(method)) query = query.limit(1);
            this.auditBefore = await query.lean();
        });
        schema.post(method, { query: true, document: false }, async function (result) {
            const session = this.getOptions().session;
            if (!deleting && !this.auditBefore?.length && this.getOptions().upsert) {
                const after = await this.model.findById(result?.upsertedId || result?._id).session(session).lean();
                if (after) {
                    await auditModelChange(kind, null, after, session);
                }
            }
            for (const before of this.auditBefore || []) {
                const after = deleting ? null : await this.model.findById(before._id).session(session).lean();
                await auditModelChange(kind, before, after, session);
            }
            await releaseOwned(this);
        });
        schema.post(method, { query: true, document: false }, function (error, _result, next) {
            releaseOwned(this, error).then(() => next(error), () => next(error));
        });
    }
}
