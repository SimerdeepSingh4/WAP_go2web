import { CreditAuditJob } from "../models/credit-reconciliation.model.js";

// This durable outbox shares the business transaction. Rolled-back movements
// cannot schedule a committed-balance check, and worker outages lose no checks.
export async function queueCreditCheck(userIds, session) {
    for (const userId of [...new Set(userIds.filter(Boolean).map(String))]) {
        await CreditAuditJob.updateOne({ userId }, { $inc: { generation: 1 }, $set: { dirty: true, availableAt: new Date(), attempts: 0, error: null } }, { upsert: true, session });
    }
}
