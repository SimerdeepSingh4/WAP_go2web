import { CreditAuditJob } from "../models/credit-reconciliation.model.js";

// An older worker can clear dirty, but only this checker records which
// generation it actually verified.
export const pendingCreditCheck = { $or: [
    { dirty: true },
    { $expr: { $lt: [{ $ifNull: ["$checkedGeneration", -1] }, { $ifNull: ["$generation", 0] }] } },
] };

// This durable outbox shares the business transaction. Rolled-back movements
// cannot schedule a committed-balance check, and worker outages lose no checks.
export async function queueCreditCheck(userIds, session) {
    for (const userId of [...new Set(userIds.filter(Boolean).map(String))]) {
        await CreditAuditJob.updateOne({ userId }, { $inc: { generation: 1 }, $set: { dirty: true, availableAt: new Date(), attempts: 0, error: null } }, { upsert: true, session });
    }
}
