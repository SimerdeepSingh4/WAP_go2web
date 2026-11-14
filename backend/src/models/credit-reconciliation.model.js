import mongoose from "mongoose";
const { Schema } = mongoose;
const objectId = Schema.Types.ObjectId;
const mixed = Schema.Types.Mixed;

function appendOnly(schema) {
    schema.pre("save", function () { if (!this.isNew) throw new Error("Reconciliation evidence is append-only."); });
    for (const method of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete", "bulkWrite"]) schema.pre(method, function () { throw new Error("Reconciliation evidence cannot be overwritten or deleted."); });
}
const caseSchema = new Schema({
    userId: { type: objectId, ref: "User", required: true, unique: true },
    state: { type: String, enum: ["open", "resolved"], default: "open", index: true },
    classification: { type: String, enum: ["confirmed", "cannot_confirm", "matched"], required: true },
    summary: { type: mixed, required: true },
    firstDetectedAt: { type: Date, default: Date.now }, lastCheckedAt: Date, resolvedAt: Date,
    snapshot: String, lastFailure: String,
}, { timestamps: true });
const recoverySchema = new Schema({
    userId: { type: objectId, required: true, index: true }, deltaMinor: { type: Number, required: true },
    originalType: { type: String, enum: ["ALLOCATE", "DEDUCT", "REFUND", "RECLAIM"], required: true },
    sourceReference: { type: String, required: true }, effectiveAt: { type: Date, required: true },
    sourceKey: String, transactionKey: String, walletApplied: { type: Boolean, default: false },
    reason: { type: String, required: true }, performedBy: { type: objectId, required: true },
    planId: { type: objectId, required: true, unique: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
recoverySchema.index({ userId: 1, sourceReference: 1 }, { unique: true });
recoverySchema.index({ userId: 1, sourceKey: 1 }, { unique: true, partialFilterExpression: { sourceKey: { $type: "string" } } });
// One completed source transaction can move wallet credits through recovery only once.
recoverySchema.index({ transactionKey: 1 }, { unique: true, sparse: true });
const eventSchema = new Schema({
    userId: { type: objectId, required: true, index: true }, action: { type: String, required: true },
    actor: { type: mixed, required: true }, details: { type: mixed, required: true },
    auditSequence: Number, auditHash: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
const planSchema = new Schema({
    userId: { type: objectId, required: true }, actorId: { type: objectId, required: true },
    mode: { type: String, enum: ["wallet", "ledger", "transaction", "close"], required: true },
    snapshot: { type: String, required: true }, before: { type: mixed, required: true },
    proposed: { type: mixed, required: true }, reason: { type: String, required: true },
    sourceReference: String, sourceKey: String, originalType: String, effectiveAt: Date, transactionVerified: Boolean,
    expiresAt: { type: Date, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
const repairSchema = new Schema({
    planId: { type: objectId, required: true, unique: true }, userId: { type: objectId, required: true, index: true },
    actorId: { type: objectId, required: true }, mode: { type: String, required: true },
    before: { type: mixed, required: true }, after: { type: mixed, required: true },
    reason: { type: String, required: true }, evidence: { type: mixed, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
const jobSchema = new Schema({
    userId: { type: objectId, required: true, unique: true }, generation: { type: Number, default: 0 },
    dirty: { type: Boolean, default: true, index: true }, checkedAt: Date, availableAt: { type: Date, default: Date.now }, attempts: { type: Number, default: 0 }, error: String,
}, { timestamps: true });
const stateSchema = new Schema({
    _id: String, owner: String, leaseUntil: Date, lastTickAt: Date, error: String,
    scanRequestedAt: Date, scanStartedAt: Date, scanFinishedAt: Date, scanQueued: Number,
    scanState: { type: String, enum: ["idle", "pending", "running", "checking", "failed"], default: "idle" },
    nextFullScanAt: Date,
}, { timestamps: true });
const resultSchema = new Schema({
    userId: { type: objectId, required: true, unique: true }, version: { type: String, required: true }, at: { type: Date, required: true },
}, { versionKey: false });
for (const schema of [recoverySchema, eventSchema, planSchema, repairSchema]) appendOnly(schema);
export const CreditCase = mongoose.models.CreditCase || mongoose.model("CreditCase", caseSchema);
export const CreditRecovery = mongoose.models.CreditRecovery || mongoose.model("CreditRecovery", recoverySchema);
export const CreditCaseEvent = mongoose.models.CreditCaseEvent || mongoose.model("CreditCaseEvent", eventSchema);
export const CreditRepairPlan = mongoose.models.CreditRepairPlan || mongoose.model("CreditRepairPlan", planSchema);
export const CreditRepair = mongoose.models.CreditRepair || mongoose.model("CreditRepair", repairSchema);
export const CreditAuditJob = mongoose.models.CreditAuditJob || mongoose.model("CreditAuditJob", jobSchema);
export const CreditAuditState = mongoose.models.CreditAuditState || mongoose.model("CreditAuditState", stateSchema);
export const CreditBalanceResult = mongoose.models.CreditBalanceResult || mongoose.model("CreditBalanceResult", resultSchema);
