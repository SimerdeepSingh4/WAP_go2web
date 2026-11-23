import mongoose from "mongoose";
import NumberFilterRequest, { NumberFilterRowChunk } from "../models/number-filter-request.model.js";
import { NUMBER_FILTERING_CREDITS, categoryBalances } from "../helpers/credit-categories.js";
import { creditTransactionOptions } from "../helpers/credit-amount.js";
import { abortCreditSession, creditErrorDetails, creditPostingKey, saveCreditReceipt, startCreditSession } from "../helpers/credit-operation.js";
import { publicAccountIdentity } from "../helpers/account-identity.js";
import { postCreditMovement } from "../services/credit-posting.service.js";
import { appendAudit } from "../services/audit.service.js";
import { notifyRole, notifyUser } from "../services/socket.service.js";
import {
    FILTERING_RESULT_CATEGORIES, FILTERING_STATUSES, LEGACY_FILTERING_CATEGORY,
    matchCategorizedFilteringResults, matchFilteringResults, parseFilteringRows,
} from "../../../shared/numberFiltering.js";

const pageSize = 20;
const rowsPerChunk = 1000;
const reviewer = req => req.user.role === "Super Admin";
const requestScope = req => reviewer(req) ? {} : { userId: req.user._id };
const phoneList = rows => rows.map(row => row.phoneNumber).join("\n");
const conflict = message => Object.assign(new Error(message), { statusCode: 409 });

function requestView(item, withOwner = false) {
    return {
        id: item._id, status: item.status, submittedRowCount: item.submittedRowCount,
        publishedAt: item.publishedAt ?? null, publishedRowCount: item.publishedRowCount ?? 0,
        createdAt: item.createdAt, updatedAt: item.updatedAt, revision: item.revision,
        chargeTransactionId: item.chargeTransactionId ?? null,
        creditsCharged: item.creditResetAt ? 0 : item.submittedRowCount,
        ...(withOwner ? { owner: publicAccountIdentity(item.userId, "Super Admin") } : {}),
    };
}

function resultView(categories, rows) {
    return {
        categories: categories ?? [...FILTERING_RESULT_CATEGORIES, ...(rows.length ? [LEGACY_FILTERING_CATEGORY] : [])],
        rows: rows.map(({ rowNumber, phoneNumber, category }) => ({ rowNumber, phoneNumber, category: category || LEGACY_FILTERING_CATEGORY.id })),
    };
}

function findRequest(req, session) {
    const query = NumberFilterRequest.findOne({ ...requestScope(req), _id: req.params.id }).session(session);
    if (reviewer(req)) query.populate("userId", "username email role");
    return query.lean();
}

async function readRows(requestId, kinds, session) {
    const chunks = await NumberFilterRowChunk.find({ requestId, kind: { $in: kinds } }).sort({ chunkIndex: 1 }).session(session).lean();
    const rows = Object.fromEntries(kinds.map(kind => [kind, []]));
    for (const chunk of chunks) rows[chunk.kind].push(...chunk.rows);
    return rows;
}

async function insertRows(requestId, kind, rows, session) {
    const chunks = [];
    for (let offset = 0; offset < rows.length; offset += rowsPerChunk) {
        chunks.push({ requestId, kind, chunkIndex: offset / rowsPerChunk, rows: rows.slice(offset, offset + rowsPerChunk) });
    }
    if (chunks.length) await NumberFilterRowChunk.insertMany(chunks, { session });
}

function invalidList(res, parsed, emptyMessage) {
    const message = parsed.error || (parsed.invalidCount ? "Correct the invalid lines before continuing."
        : parsed.unmatchedCount ? "Remove result numbers that were not in the submitted list." : emptyMessage);
    return res.status(400).json({
        success: false, message, invalidEntries: parsed.invalidEntries,
        ...(parsed.unmatchedCount ? { unmatchedEntries: parsed.unmatchedEntries } : {}),
    });
}

function respondError(req, res, error, fallback) {
    const details = creditErrorDetails(error, req);
    const status = error.statusCode || (error.code === 11000 || error.hasErrorLabel?.("TransientTransactionError") ? 409 : 500);
    if (status >= 500) console.error("[number-filtering]", error.code || error.name, req.auditRequestId || "");
    return res.status(status).json({ success: false, message: error.statusCode ? error.message : fallback, ...details });
}

export async function listFilteringRequests(req, res) {
    const status = req.query.status;
    const page = req.query.page == null ? 1 : Number(req.query.page);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger((page - 1) * pageSize)
        || (status != null && !FILTERING_STATUSES.includes(status))) {
        return res.status(400).json({ success: false, message: "Choose a valid page and request status." });
    }
    try {
        const filter = { ...requestScope(req), ...(status ? { status } : {}) };
        const query = NumberFilterRequest.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * pageSize).limit(pageSize);
        if (reviewer(req)) query.populate("userId", "username email role");
        const [items, total] = await Promise.all([query.lean(), NumberFilterRequest.countDocuments(filter)]);
        return res.json({ success: true, items: items.map(item => requestView(item, reviewer(req))), pagination: { page, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
    } catch (error) {
        return respondError(req, res, error, "Could not load filtering requests.");
    }
}

export async function getFilteringRequest(req, res) {
    let session;
    try {
        session = await mongoose.startSession();
        const data = await session.withTransaction(async () => {
            const item = await findRequest(req, session);
            if (!item) return null;
            const kinds = ["submitted"];
            if (reviewer(req)) kinds.push("draft");
            if (item.publishedAt) kinds.push("published");
            const rows = await readRows(item._id, kinds, session);
            return {
                ...requestView(item, reviewer(req)),
                submittedNumbers: phoneList(rows.submitted),
                publishedNumbers: rows.published ? phoneList(rows.published) : null,
                publishedResults: rows.published ? resultView(item.publishedCategories, rows.published) : null,
                ...(reviewer(req) ? {
                    draftNumbers: phoneList(rows.draft),
                    draftResults: item.draftCategories || rows.draft.length ? resultView(item.draftCategories, rows.draft) : null,
                } : {}),
            };
        }, creditTransactionOptions);
        if (!data) return res.status(404).json({ success: false, message: "Filtering request not found." });
        return res.json({ success: true, data });
    } catch (error) {
        return respondError(req, res, error, "Could not load this filtering request.");
    } finally { await session?.endSession(); }
}

export async function createFilteringRequest(req, res) {
    if (!["User", "Reseller"].includes(req.user.role)) return res.status(403).json({ success: false, message: "Only users and resellers can submit filtering requests." });
    const parsed = parseFilteringRows(req.body?.numbers);
    if (parsed.error || parsed.invalidCount || !parsed.rows.length) return invalidList(res, parsed, "Enter at least one phone number.");
    let session;
    try {
        session = await startCreditSession(req);
        session.startTransaction(creditTransactionOptions);
        req.filterRequestId ||= new mongoose.Types.ObjectId();
        const { transaction, wallet } = await postCreditMovement({
            session, operationKey: creditPostingKey(req, "number-filtering-charge"), type: "DEDUCT", category: NUMBER_FILTERING_CREDITS,
            amount: parsed.rows.length, toUser: req.user._id, performedBy: req.user._id, filterRequestId: req.filterRequestId,
            notes: "Number filtering request",
        });
        const [item] = await NumberFilterRequest.create([{
            _id: req.filterRequestId, userId: req.user._id, submittedRowCount: parsed.rows.length, chargeTransactionId: transaction._id,
        }], { session });
        await insertRows(item._id, "submitted", parsed.rows, session);
        await appendAudit({ stream: `number-filtering:${item._id}`, action: "number-filtering.submitted",
            data: { userId: req.user._id, submittedRowCount: parsed.rows.length, chargeTransactionId: transaction._id } }, session);
        const available = categoryBalances(wallet)[NUMBER_FILTERING_CREDITS].available;
        const body = { success: true, data: requestView(item), creditsCharged: parsed.rows.length, available };
        await saveCreditReceipt(req, session, 201, body);
        await session.commitTransaction();
        void Promise.allSettled([
            notifyUser(req.user._id, "WALLET_UPDATED", { category: NUMBER_FILTERING_CREDITS, newBalance: available, delta: -parsed.rows.length, reason: "DEDUCT", filterRequestId: item._id, transactionId: transaction._id }),
            notifyRole("Super Admin", "NUMBER_FILTER_REQUEST_UPDATED", { requestId: item._id }),
        ]);
        return res.status(201).json(body);
    } catch (error) {
        if (session) await abortCreditSession(session);
        return respondError(req, res, error, "Could not submit the filtering request. Retry with the same request reference.");
    } finally { await session?.endSession(); }
}

export async function saveFilteringResults(req, res) {
    const { revision, numbers, categories, mode } = req.body ?? {};
    if (!Number.isSafeInteger(revision) || revision < 0 || !["draft", "publish", "close"].includes(mode)) {
        return res.status(400).json({ success: false, message: "Choose a valid review action and revision." });
    }
    let session;
    try {
        session = await mongoose.startSession();
        const outcome = await session.withTransaction(async () => {
            const item = await findRequest(req, session);
            if (!item) return null;
            if (item.revision !== revision) throw conflict("This request changed. Reload it before saving your results.");
            let parsed;
            if (mode !== "close") {
                const { submitted } = await readRows(item._id, ["submitted"], session);
                if (categories === undefined) {
                    parsed = matchFilteringResults(numbers, submitted);
                    if (parsed.error || parsed.invalidCount || parsed.unmatchedCount) return { invalid: parsed };
                    Object.assign(parsed, resultView(undefined, parsed.rows));
                } else {
                    parsed = matchCategorizedFilteringResults(categories, submitted);
                    if (parsed.error || parsed.invalidCount) return { invalidCategories: parsed };
                }
            }
            const changes = { reviewedBy: req.user._id };
            if (parsed) changes.draftCategories = parsed.categories;
            if (mode === "close") changes.status = "CLOSED";
            else if (mode === "publish") Object.assign(changes, {
                status: "PUBLISHED", publishedAt: new Date(), publishedRowCount: parsed.rows.length, publishedCategories: parsed.categories,
            });
            else changes.status = item.publishedAt ? "PUBLISHED" : "IN_REVIEW";

            const updated = await NumberFilterRequest.findOneAndUpdate({ _id: item._id, revision }, { $set: changes, $inc: { revision: 1 } }, {
                session, returnDocument: "after",
            }).lean();
            if (!updated) throw conflict("This request changed. Reload it before saving your results.");
            if (parsed) {
                const kinds = mode === "publish" ? ["draft", "published"] : ["draft"];
                await NumberFilterRowChunk.deleteMany({ requestId: item._id, kind: { $in: kinds } }, { session });
                for (const kind of kinds) await insertRows(item._id, kind, parsed.rows, session);
            }
            await appendAudit({ stream: `number-filtering:${item._id}`, action: `number-filtering.${{ draft: "draft-saved", publish: "published", close: "closed" }[mode]}`,
                data: { revision: updated.revision, status: updated.status, ...(parsed ? { resultCount: parsed.rows.length } : {}) } }, session);
            return { item: updated, ownerId: item.userId?._id };
        }, creditTransactionOptions);
        if (!outcome) return res.status(404).json({ success: false, message: "Filtering request not found." });
        if (outcome.invalid) return invalidList(res, outcome.invalid);
        if (outcome.invalidCategories) return res.status(400).json({
            success: false,
            message: outcome.invalidCategories.error || "Correct the category lists before saving.",
            categoryIssues: outcome.invalidCategories.issues,
        });
        void Promise.allSettled([
            notifyUser(outcome.ownerId, "NUMBER_FILTER_REQUEST_UPDATED", { requestId: outcome.item._id }),
            notifyRole("Super Admin", "NUMBER_FILTER_REQUEST_UPDATED", { requestId: outcome.item._id }),
        ]);
        return res.json({ success: true, data: requestView(outcome.item) });
    } catch (error) {
        return respondError(req, res, error, "Could not save the filtering results.");
    } finally { await session?.endSession(); }
}
