import mongoose from "mongoose";
import { auditModelChange } from "../services/audit.service.js";
import Workflow from "../models/campaign-workflow.model.js";
import { syncCampaignWorkflow, workflowEnabled } from "./campaign-workflow-outbox.js";

export async function guardCampaignWorkflow(campaign, session) {
    if (!workflowEnabled() || campaign.$locals?.skipWorkflowSync) return;
    const workflow = await Workflow.findById(campaign._id).session(session).lean();
    if (workflow && (["waiting_webhook", "settling"].includes(workflow.stage) || (workflow.stage === "ready" && (workflow.dispatchStartedAt || workflow.leaseUntil > new Date())))) {
        const error = new Error("Campaign delivery is in progress. Wait for its completion before editing, cancelling, or publishing a manual report.");
        error.statusCode = 409; throw error;
    }
}
async function guardDeletion(kind, document, session) {
    if (kind === "campaign") return guardCampaignWorkflow(document, session);
    if (!workflowEnabled() || !["wallet", "user"].includes(kind)) return;
    const campaigns = await mongoose.model("Campaign").find({ userId: kind === "user" ? document._id : document.userId }).select("_id").session(session).lean();
    if (await Workflow.exists({ _id: { $in: campaigns.map((campaign) => campaign._id) }, stage: { $nin: ["completed", "cancelled"] } }).session(session)) {
        const error = new Error("This account has an unfinished campaign workflow. Resolve it before deleting the account or wallet.");
        error.statusCode = 409; throw error;
    }
}
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
                this.auditOwnedSession.startTransaction(); this.setOptions({ session: this.auditOwnedSession });
            }
            const session = this.getOptions().session;
            let query = this.model.find(this.getFilter()).session(session);
            if (!["deleteMany", "updateMany"].includes(method)) query = query.limit(1);
            this.auditBefore = await query.lean();
            for (const document of this.auditBefore) {
                if (deleting) await guardDeletion(kind, document, session);
                else if (kind === "campaign") await guardCampaignWorkflow(document, session);
            }
        });
        schema.post(method, { query: true, document: false }, async function (result) {
            const session = this.getOptions().session;
            if (!deleting && !this.auditBefore?.length && this.getOptions().upsert) {
                const after = await this.model.findById(result?.upsertedId || result?._id).session(session).lean();
                if (after) {
                    await auditModelChange(kind, null, after, session);
                    if (kind === "campaign") await syncCampaignWorkflow(after, session);
                }
            }
            for (const before of this.auditBefore || []) {
                const after = deleting ? null : await this.model.findById(before._id).session(session).lean();
                await auditModelChange(kind, before, after, session);
                if (kind === "campaign" && after) await syncCampaignWorkflow(after, session);
                if (kind === "campaign" && deleting) await Workflow.updateOne({ _id: before._id }, { $set: { stage: "cancelled", completedAt: new Date() } }, { session });
            }
            await releaseOwned(this);
        });
        schema.post(method, { query: true, document: false }, function (error, _result, next) {
            releaseOwned(this, error).then(() => next(error), () => next(error));
        });
    }
}
