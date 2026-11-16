import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Wallet from "../models/wallet.model.js";
import User from "../models/user.model.js";
import Transaction from "../models/transaction.model.js";
import { creditMinor } from "../helpers/credit-amount.js";
import { guardCreditSession } from "../helpers/credit-session-guard.js";

const failure = (message, statusCode = 400, code = "CREDIT_POSTING_REJECTED") => Object.assign(new Error(message), { statusCode, code });
const same = (a, b) => String(a ?? "") === String(b ?? "");
const hash = value => createHash("sha256").update(value).digest("hex");

// All production economic movements use this function. Business controllers
// validate the purpose; this service derives both sides from one exact amount.
export async function postCreditMovement({ session, operationKey, type, amount, fromUser = null, toUser, performedBy, campaignId = null, notes = "", rateSnapshot = null, refundOperationId, toWalletSet = {}, allowLockedDebit = false }) {
    guardCreditSession(session);
    if (typeof operationKey !== "string" || !operationKey.trim() || operationKey.length > 240) throw failure("A stable credit operation reference is required.");
    if (!["ALLOCATE", "REFUND", "DEDUCT", "RECLAIM"].includes(type)) throw failure("Unsupported economic credit movement.");
    const amountMinor = creditMinor(amount);
    if (amountMinor <= 0) throw failure("The credit amount must be greater than zero.");
    const exactAmount = amountMinor / 100;
    const source = type === "DEDUCT" ? fromUser || toUser : fromUser;
    if (type === "DEDUCT" && !same(source, toUser)) throw failure("A deduction must identify the same affected wallet on both sides of its record.");
    if (!toUser || !performedBy || ["ALLOCATE", "RECLAIM"].includes(type) && same(source, toUser)) throw failure("Choose the correct source and destination accounts.");
    const fingerprint = hash(JSON.stringify({ type, amountMinor, from: String(source || ""), to: String(toUser), actor: String(performedBy), campaign: String(campaignId || ""), rate: rateSnapshot, notes }));
    const previous = await Transaction.findOne({ operationKey }).session(session);
    if (previous) {
        if (previous.operationFingerprint !== fingerprint) throw failure("This operation reference already belongs to different credit details.", 409, "CREDIT_REFERENCE_REUSED");
        const fromWallet = source ? await Wallet.findOne({ userId: source }).session(session) : null;
        const toWallet = same(source, toUser) ? fromWallet : await Wallet.findOne({ userId: toUser }).session(session);
        return { transaction: previous, fromWallet, toWallet, wallet: toWallet || fromWallet, replayed: true };
    }
    const target = await User.findById(toUser).select("role resellerId").session(session).lean();
    if (!target) throw failure("Destination account not found.", 404);
    const actor = await User.findById(performedBy).select("role").session(session).lean();
    if (!actor) throw failure("Credit operation actor not found.", 404);
    if (type === "ALLOCATE" && !source && actor.role !== "Super Admin") throw failure("Only Super Admin may issue credits from the system pool.", 403);
    const systemReclaim = type === "RECLAIM" && target.role === "Super Admin";
    if (systemReclaim && (!same(toUser, performedBy) || actor.role !== "Super Admin")) throw failure("Only Super Admin may reclaim into the system pool.", 403);
    if (allowLockedDebit && actor.role !== "Super Admin" && type !== "RECLAIM") throw failure("Only Super Admin may correct a locked wallet's campaign billing.", 403);
    for (const field of Object.keys(toWalletSet)) if (!["expiresAt", "isLocked"].includes(field)) throw failure("Unsupported wallet metadata in a credit posting.");
    async function debit(userId) {
        const existing = await Wallet.findOne({ userId }).session(session);
        if (!existing) throw failure("The source wallet does not exist.", 409);
        if (type !== "RECLAIM" && !allowLockedDebit && (existing.isLocked || existing.expiresAt && existing.expiresAt <= new Date())) throw failure("This wallet is locked or its credits have expired.", 403);
        const wallet = await Wallet.findOneAndUpdate({ userId, balance: { $gte: exactAmount } }, { $inc: { balance: -exactAmount } }, { session, returnDocument: "after" });
        if (!wallet) throw failure("Insufficient credits. No changes were saved.", 400, "CREDIT_INSUFFICIENT");
        return wallet;
    }
    async function credit(userId) {
        return Wallet.findOneAndUpdate({ userId }, { $inc: { balance: exactAmount }, $setOnInsert: { resellerId: target.resellerId || null }, ...(Object.keys(toWalletSet).length ? { $set: toWalletSet } : {}) }, { session, upsert: true, returnDocument: "after" });
    }
    let fromWallet = null, toWallet = null;
    if (type === "ALLOCATE") { if (source) fromWallet = await debit(source); toWallet = await credit(toUser); }
    else if (type === "REFUND") toWallet = await credit(toUser);
    else if (type === "DEDUCT") { fromWallet = await debit(source); toWallet = same(source, toUser) ? fromWallet : null; }
    else { fromWallet = await debit(source); if (!systemReclaim) toWallet = await credit(toUser); }
    const adjustmentId = type === "REFUND" || refundOperationId ? new mongoose.Types.ObjectId(hash(operationKey).slice(0, 24)) : undefined;
    const [transaction] = await Transaction.create([{
        operationKey, operationFingerprint: fingerprint, type, amount: exactAmount, fromUser: source, toUser, performedBy, campaignId, notes, rateSnapshot,
        balanceAfterFrom: fromWallet?.balance ?? null, balanceAfterTo: toWallet?.balance ?? null,
        ...(adjustmentId ? { refundOperationId: adjustmentId } : {}),
    }], { session });
    return { transaction, fromWallet, toWallet, wallet: toWallet || fromWallet, replayed: false };
}
