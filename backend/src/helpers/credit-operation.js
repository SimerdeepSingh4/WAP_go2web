import { createHash } from "node:crypto";
import mongoose from "mongoose";
import CreditOperation from "../models/credit-operation.model.js";

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
