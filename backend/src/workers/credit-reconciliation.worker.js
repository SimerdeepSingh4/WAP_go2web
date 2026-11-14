import { randomUUID } from "node:crypto";
import Wallet from "../models/wallet.model.js";
import User from "../models/user.model.js";
import { CreditAuditJob, CreditAuditState } from "../models/credit-reconciliation.model.js";
import { checkCreditAccount } from "../services/credit-reconciliation.service.js";
import { notifyRole } from "../services/socket.service.js";

const owner = randomUUID();
const HOUR = 3600000;
let timer, running, stopped = true;
export async function requestCreditFullScan(session = null) {
    await CreditAuditState.updateOne({ _id: "monitor" }, { $setOnInsert: { scanState: "idle", nextFullScanAt: new Date(0) } }, { upsert: true, session });
    const state = await CreditAuditState.findOneAndUpdate({ _id: "monitor", scanState: { $in: ["idle", "failed"] } }, { $set: { scanState: "pending", scanRequestedAt: new Date(), error: null } }, { returnDocument: "after", session }).lean();
    return { queued: Boolean(state), state: state?.scanState || "already_pending" };
}
export async function runCreditCheckCycle() {
    await CreditAuditState.updateOne({ _id: "monitor" }, { $setOnInsert: { scanState: "idle", nextFullScanAt: new Date(0) } }, { upsert: true });
    const now = new Date();
    const state = await CreditAuditState.findOneAndUpdate({ _id: "monitor", $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: null }, { owner }] },
        { $set: { owner, leaseUntil: new Date(Date.now() + 60000), lastTickAt: now } }, { returnDocument: "after" }).lean();
    if (!state) return;
    let fullScanActive = state.scanState === "checking";
    async function renew(fields = {}) {
        const result = await CreditAuditState.updateOne({ _id: "monitor", owner }, { $set: { leaseUntil: new Date(Date.now() + 60000), lastTickAt: new Date(), ...fields } });
        if (!result.matchedCount) throw new Error("Credit monitor lease changed.");
    }
    try {
        const due = !state.nextFullScanAt || state.nextFullScanAt <= now;
        if (state.scanState === "pending" || state.scanState === "running" || due && state.scanState !== "checking") {
            await renew({ scanState: "running", scanStartedAt: new Date(), scanQueued: 0, error: null });
            const seen = new Set();
            let batch = [], queued = 0;
            async function flush() {
                if (!batch.length) return;
                await CreditAuditJob.bulkWrite(batch, { ordered: false });
                queued += batch.length; batch = [];
                await renew({ scanQueued: queued });
            }
            async function enqueue(userId) {
                if (!userId || seen.has(String(userId))) return;
                seen.add(String(userId));
                batch.push({ updateOne: { filter: { userId }, update: { $inc: { generation: 1 }, $set: { dirty: true, availableAt: new Date(), attempts: 0, error: null } }, upsert: true } });
                if (batch.length >= 200) await flush();
            }
            for await (const user of User.find({ role: { $in: ["User", "Reseller"] } }).select("_id").lean().cursor()) await enqueue(user._id);
            for await (const wallet of Wallet.find().select("userId").lean().cursor()) await enqueue(wallet.userId);
            await flush();
            await renew({ scanState: "checking", scanQueued: queued });
            fullScanActive = true;
        }
        const jobs = await CreditAuditJob.find({ dirty: true, availableAt: { $lte: new Date() } }).sort({ updatedAt: 1 }).limit(20).lean();
        for (const job of jobs) {
            await renew();
            try {
                await checkCreditAccount(job.userId);
                await CreditAuditJob.updateOne({ _id: job._id, generation: job.generation }, { $set: { dirty: false, checkedAt: new Date(), attempts: 0, error: null } });
            } catch (error) {
                await CreditAuditJob.updateOne({ _id: job._id, generation: job.generation }, { $inc: { attempts: 1 }, $set: { error: "The check could not complete; it will retry.", availableAt: new Date(Date.now() + Math.min(300000, 5000 * 2 ** Math.min(job.attempts || 0, 6))) } });
            }
        }
        const pending = await CreditAuditJob.exists({ dirty: true });
        await renew({ error: null, ...(!pending && fullScanActive ? { scanState: "idle", scanFinishedAt: new Date(), nextFullScanAt: new Date(Date.now() + HOUR) } : {}) });
        if (jobs.length || fullScanActive) await Promise.allSettled([notifyRole("Super Admin", "CREDIT_RECONCILIATION_CHANGED", {})]);
    } catch (error) {
        await CreditAuditState.updateOne({ _id: "monitor", owner }, { $set: { error: "Credit checks need attention. Pending checks are retained for retry.", scanState: "failed" } });
    } finally {
        await CreditAuditState.updateOne({ _id: "monitor", owner }, { $set: { leaseUntil: new Date(0) } });
    }
}
export function startCreditReconciliationWorker() {
    if (timer) return;
    stopped = false;
    const tick = () => {
        if (stopped || running) return;
        running = runCreditCheckCycle().catch(() => {}).finally(() => { running = null; });
    };
    timer = setInterval(tick, 5000); timer.unref?.(); tick();
}
export async function closeCreditReconciliationWorker() {
    stopped = true; if (timer) clearInterval(timer); timer = null; if (running) await running;
}
