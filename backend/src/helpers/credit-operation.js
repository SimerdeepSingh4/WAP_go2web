import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import CreditOperation from "../models/credit-operation.model.js";
import { reportCreditPostingFailure } from "./credit-session-guard.js";
import { guardCreditSession } from "./credit-session-guard.js";
import { creditTransactionOptions } from "./credit-amount.js";
import { withCreditWalletLocks } from "./credit-wallet-lock.js";

const hash = (value) => createHash("sha256").update(value).digest("hex");
function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
}

export async function creditRequest(req, res, next) {
    try {
        const token = req.get("Idempotency-Key");
        if (!token || !/^[a-zA-Z0-9_-]{16,128}$/.test(token)) return res.status(400).json({ success: false, message: "A valid Idempotency-Key is required for credit operations." });
        const key = hash(`${req.user._id}:${req.method}:${req.baseUrl}:${req.path}:${token}`);
        const files = Object.entries(req.files || {}).sort(([a], [b]) => a.localeCompare(b)).flatMap(([field, entries]) => entries.map((file) => ({ field, name: file.originalname, digest: hash(file.buffer) })));
        const fingerprint = hash(JSON.stringify({ body: canonical(req.body), files }));
        req.creditOperation = { key, fingerprint };
        const receipt = await CreditOperation.findOne({ key }).lean();
        if (!receipt) return next();
        if (receipt.fingerprint !== fingerprint) return res.status(409).json({ success: false, message: "This request reference was already used for different details. Start a new operation." });
        res.set("Idempotent-Replayed", "true");
        return res.status(receipt.status).json(receipt.response);
    } catch (error) { next(error); }
}

export async function startCreditSession(req) {
    const session = await mongoose.startSession();
    session.creditOperation = req.creditOperation;
    return session;
}

export async function saveCreditReceipt(req, session, status, response) {
    if (!req.creditOperation) return;
    await CreditOperation.create([{ ...req.creditOperation, status, response: JSON.parse(JSON.stringify(response)) }], { session });
}

export function creditPostingKey(req, purpose) {
    req.creditPostingNonce ||= randomUUID();
    return `${req.creditOperation?.key || req.creditPostingNonce}:${purpose}`;
}

export async function abortCreditSession(session) {
    if (!session?.inTransaction()) return;
    try { await session.abortTransaction(); } catch { /* Return the original operation outcome. */ }
}

export async function runCreditTransaction(work, { attempts = 5, backoff = true, walletIds = [] } = {}) {
    return withCreditWalletLocks(walletIds, async () => {
    for (let attempt = 0; attempt < attempts; attempt++) {
        const session = await mongoose.startSession();
        session.startTransaction({ ...creditTransactionOptions, maxCommitTimeMS: 10000 });
        guardCreditSession(session);
        try {
            const result = await work(session);
            await session.commitTransaction();
            return result;
        } catch (error) {
            await abortCreditSession(session);
            const retryable = error.hasErrorLabel?.("TransientTransactionError") && !error.hasErrorLabel?.("UnknownTransactionCommitResult");
            if (!retryable || attempt + 1 >= attempts) throw error;
            if (backoff) await new Promise(resolve => setTimeout(resolve, 40 * 2 ** attempt + Math.floor(Math.random() * 100)));
        } finally { await session.endSession(); }
    }
    });
}

export function creditErrorDetails(error, req) {
    if (req) req.creditFailure = error;
    if (error.code === "CREDIT_INVARIANT_FAILED") return { code: error.code, message: "This credit operation was stopped before completion. Please contact support with this request reference." };
    if (error.hasErrorLabel?.("UnknownTransactionCommitResult")) return { code: "CREDIT_RESULT_UNCONFIRMED", message: "The saved result could not be verified. Keep the same request reference when checking or retrying." };
    if (error.hasErrorLabel?.("TransientTransactionError")) return { code: "CREDIT_WRITE_CONFLICT", retryable: true, message: "Another credit operation is finishing. Retrying this request is safe." };
    return error.code ? { code: error.code } : {};
}

// Defer the JSON response until bounded retries have finished. Every attempt
// gets a fresh transaction; only definite rollbacks are retried automatically.
export function retryCreditController(handler, { attempts = 5, backoff = true, walletIds = [] } = {}) {
    return async function creditController(req, res, next) {
        const accounts = typeof walletIds === "function" ? await walletIds(req) : walletIds;
        return withCreditWalletLocks(accounts, async () => {
        for (let attempt = 0; attempt < attempts; attempt++) {
            if (req.creditOperation) {
                const receipt = await CreditOperation.findOne({ key: req.creditOperation.key }).lean();
                if (receipt) {
                    if (receipt.fingerprint !== req.creditOperation.fingerprint) return res.status(409).json({ success: false, code: "CREDIT_REFERENCE_REUSED", message: "This request reference was already used with different details." });
                    res.set?.("Idempotent-Replayed", "true");
                    return res.status(receipt.status).json(receipt.response);
                }
            }
            req.creditFailure = null;
            req.supportActionReceipt = null;
            let status = 200, body, replied = false;
            const headers = new Map();
            let deferred;
            deferred = new Proxy(res, { get(target, key) {
                if (key === "status") return code => { status = code; return deferred; };
                if (key === "json") return value => { body = value; replied = true; return deferred; };
                if (key === "set" || key === "setHeader") return (name, value) => { headers.set(name, value); return deferred; };
                const value = Reflect.get(target, key, target);
                return typeof value === "function" ? value.bind(target) : value;
            } });
            await handler(req, deferred, next);
            if (!replied) return;
            if (status >= 400 && req.creditOperation) {
                const receipt = await CreditOperation.findOne({ key: req.creditOperation.key }).lean();
                if (receipt?.fingerprint === req.creditOperation.fingerprint) { res.set?.("Idempotent-Replayed", "true"); return res.status(receipt.status).json(receipt.response); }
            }
            if (body?.code === "CREDIT_WRITE_CONFLICT" && attempt + 1 < attempts) {
                if (backoff) await new Promise(resolve => setTimeout(resolve, 40 * 2 ** attempt + Math.floor(Math.random() * 100)));
                continue;
            }
            if (body?.code === "CREDIT_WRITE_CONFLICT" || body?.code === "CREDIT_INVARIANT_FAILED") {
                if (!req.creditFailure?.creditIncidentRecorded) await reportCreditPostingFailure(req.creditFailure || Object.assign(new Error("Credit retry limit reached."), { code: body.code }));
                if (body.code === "CREDIT_WRITE_CONFLICT") { status = 503; body = { ...body, retryable: false, message: "This operation could not finish after several attempts. No change was committed by this request. Retry with the same request reference." }; }
            }
            for (const [name, value] of headers) res.set?.(name, value);
            return res.status(status).json(body);
        }
        });
    };
}
