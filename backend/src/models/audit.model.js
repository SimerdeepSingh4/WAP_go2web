import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
    stream: { type: String, required: true },
    sequence: { type: Number, required: true },
    occurredAt: { type: Date, required: true },
    action: { type: String, required: true },
    actor: { type: mongoose.Schema.Types.Mixed, required: true },
    request: mongoose.Schema.Types.Mixed,
    data: mongoose.Schema.Types.Mixed,
    previousHash: { type: String, required: true },
    hash: { type: String, required: true },
    keyId: { type: String, required: true },
}, { versionKey: false, collection: "audit_events" });
eventSchema.index({ stream: 1, sequence: 1 }, { unique: true });
eventSchema.index({ occurredAt: -1, _id: -1 });
eventSchema.index({ "actor.id": 1, occurredAt: -1 });
eventSchema.index({ "request.id": 1 });
eventSchema.pre("save", function () {
    if (!this.isNew) throw new Error("Audit events are append-only");
});
for (const method of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne", "findOneAndReplace", "deleteOne", "deleteMany", "findOneAndDelete", "bulkWrite"]) {
    eventSchema.pre(method, function () { throw new Error("Audit events cannot be updated or deleted"); });
}
eventSchema.pre("deleteOne", { document: true, query: false }, function () { throw new Error("Audit events cannot be deleted"); });
const headSchema = new mongoose.Schema({
    _id: String, sequence: { type: Number, default: 0 }, hash: { type: String, default: "GENESIS" },
}, { versionKey: false, collection: "audit_heads" });

export const AuditEvent = mongoose.models.AuditEvent || mongoose.model("AuditEvent", eventSchema);
export const AuditHead = mongoose.models.AuditHead || mongoose.model("AuditHead", headSchema);
