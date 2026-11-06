import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import mongoose from "mongoose";
import { AuditEvent, AuditHead } from "../models/audit.model.js";
import { creditTransactionOptions } from "../helpers/credit-amount.js";

export const auditContext = new AsyncLocalStorage();
export function auditSigningKey() {
    const key = process.env.AUDIT_SIGNING_KEY;
    if (!key || Buffer.byteLength(key) < 32) throw new Error("AUDIT_SIGNING_KEY must contain at least 32 bytes");
    return key;
}
export function canonical(value) {
    if (value instanceof Date) return value.toISOString();
    if (value?.toHexString) return value.toHexString();
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]));
    return value;
}
const secretField = /password|token|secret|authorization|cookie|subscription|privatekey|buffer/i;
export function redactAudit(value, depth = 0) {
    if (depth > 8) return "[depth limited]";
    if (value instanceof Date || value?.toHexString) return canonical(value);
    if (Array.isArray(value)) return { count: value.length, sha256: createHash("sha256").update(JSON.stringify(canonical(value.map((item) => redactAudit(item, depth + 1))))).digest("hex") };
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !["__v", "$locals"].includes(key)).map(([key, item]) => [key, secretField.test(key) ? "[redacted]" : redactAudit(item, depth + 1)]));
    return typeof value === "string" ? value.slice(0, 4000) : value;
}
export function auditHash(event, key = auditSigningKey()) {
    const { _id, hash, ...signed } = event;
    return createHmac("sha256", key).update(JSON.stringify(canonical(signed))).digest("hex");
}
export function validAuditHash(event, key) {
    if (!key) {
        if (event.keyId === (process.env.AUDIT_KEY_ID || "v1")) key = auditSigningKey();
        else {
            try { key = JSON.parse(process.env.AUDIT_VERIFY_KEYS_JSON || "{}")[event.keyId]; }
            catch { return false; }
            if (typeof key !== "string" || Buffer.byteLength(key) < 32) return false;
        }
    }
    const expected = Buffer.from(auditHash(event, key));
    const actual = Buffer.from(event.hash || "");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function requestMetadata(req) {
    return { id: req.auditRequestId, method: req.method, path: (req.originalUrl || req.url || "").split("?")[0], ip: req.ip || req.socket?.remoteAddress || null, userAgent: String(req.get?.("user-agent") || "").slice(0, 500) };
}
export async function appendAudit({ stream, action, data, actor }, session = null) {
    if (!session) {
        const owned = await mongoose.startSession();
        try { return await owned.withTransaction(() => appendAudit({ stream, action, data, actor }, owned), creditTransactionOptions); }
        finally { await owned.endSession(); }
    }
    if (!session.inTransaction()) throw new Error("Audit writes require an active transaction");
    const req = auditContext.getStore()?.req;
    const head = await AuditHead.findOneAndUpdate({ _id: stream }, { $inc: { sequence: 1 } }, { upsert: true, returnDocument: "before", session }).lean();
    const record = {
        stream, sequence: (head?.sequence || 0) + 1, previousHash: head?.hash || "GENESIS",
        occurredAt: new Date(), action,
        actor: redactAudit(actor || (req?.user ? { id: String(req.user._id), role: req.user.role, name: req.user.username, originalAdmin: req.originalAdmin || null, impersonation: Boolean(req.isImpersonation), preview: Boolean(req.isPreview) } : { role: "System" })),
        request: req ? requestMetadata(req) : null, data: redactAudit(data), keyId: process.env.AUDIT_KEY_ID || "v1",
    };
    record.hash = auditHash(record);
    await AuditEvent.create([record], { session });
    await AuditHead.updateOne({ _id: stream }, { $set: { hash: record.hash } }, { session });
    return record;
}
export async function auditModelChange(kind, before, after, session) {
    const document = after || before;
    return appendAudit({ stream: `${kind}:${document._id}`, action: `${kind}.${!before ? "created" : !after ? "deleted" : "updated"}`, data: { before: before || null, after: after?.toObject ? after.toObject() : after || null } }, session);
}
export async function verifyAuditStream(stream) {
    // Snapshot reads prevent concurrent appends from producing false alarms.
    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(async () => {
            let sequence = 0, hash = "GENESIS";
            for await (const event of AuditEvent.find({ stream }).sort({ sequence: 1 }).session(session).lean().cursor()) {
                if (event.sequence !== sequence + 1 || event.previousHash !== hash || !validAuditHash(event)) return { valid: false, sequence: event.sequence };
                sequence = event.sequence; hash = event.hash;
            }
            const head = await AuditHead.findById(stream).session(session).lean();
            return { valid: Boolean(head) && head.sequence === sequence && head.hash === hash, stream, sequence, hash };
        }, creditTransactionOptions);
    } finally { await session.endSession(); }
}

export function auditRequestContext(req, _res, next) {
    req.auditRequestId = randomUUID();
    auditContext.run({ req }, next);
}

// Write intent before executing a mutation; persist its outcome before sending
// the response. A crash leaves an explicit, inspectable unresolved intent.
export async function auditAuthenticatedRequest(req, res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) && !["Super Admin", "Reseller"].includes(req.user?.role)) return next();
    const stream = `request:${req.auditRequestId || randomUUID()}`;
    try {
        await appendAudit({ stream, action: "request.started", data: { method: req.method, path: req.path, input: req.body } });
        const originalEnd = res.end;
        let ending = false;
        res.end = function (...args) {
            if (ending) return this;
            ending = true;
            void appendAudit({ stream, action: "request.finished", data: { status: res.statusCode, outcome: res.statusCode < 400 ? "success" : "rejected" } })
                .then(() => originalEnd.apply(res, args))
                .catch((error) => {
                    console.error("Audit outcome persistence failed", req.auditRequestId, error.message);
                    if (!res.headersSent) { res.statusCode = 503; res.removeHeader("Content-Length"); res.setHeader("Content-Type", "application/json"); originalEnd.call(res, JSON.stringify({ success: false, message: "Audit confirmation unavailable. Check the operation before retrying.", requestId: req.auditRequestId })); }
                    else res.destroy(error);
                });
            return this;
        };
        res.setHeader("X-Request-Id", req.auditRequestId || stream);
        return next();
    } catch (error) { return res.status(503).json({ success: false, message: "Audit storage unavailable; action was not started." }); }
}
