import { randomUUID } from "node:crypto";
import { NotificationEvent } from "../models/notification.model.js";

let sequenceCounter = Date.now();
export function getNextNotificationSequence() {
    sequenceCounter = Math.max(Date.now(), sequenceCounter + 1);
    return sequenceCounter;
}

const watched = {
    campaign: ["status", "publishedSpreadsheet", "campaignSummary.reportedAt"],
    user: ["status", "role", "ratePerMsg", "expiresAt", "deviceLimit"],
    wallet: ["balance", "expiresAt", "isLocked"],
};

function snapshot(doc, kind) {
    if (kind === "transaction") return { id: doc._id, type: doc.type, amount: doc.amount, fromUser: doc.fromUser, toUser: doc.toUser, campaignId: doc.campaignId, performedBy: doc.performedBy };
    if (kind === "campaign") return { id: doc._id, userId: doc.userId, title: doc.campaignTitle, status: doc.status, total: doc.totalRecipients, publishedAt: doc.publishedSpreadsheet?.publishedAt || doc.campaignSummary?.reportedAt };
    if (kind === "user") return { id: doc._id, username: doc.username, role: doc.role, status: doc.status, rate: doc.ratePerMsg, expiresAt: doc.expiresAt, createdBy: doc.createdBy, resellerId: doc.resellerId, deviceLimit: doc.deviceLimit };
    return { id: doc._id, userId: doc.userId, balance: doc.balance, expiresAt: doc.expiresAt, isLocked: doc.isLocked };
}

async function enqueue(doc, kind, changeField, isNew, previous, session) {
    const version = getNextNotificationSequence();
    const eventKey = kind === "transaction" ? `transaction:${doc._id}` : `${kind}:${doc._id}:${changeField || "default"}:${randomUUID()}`;
    await NotificationEvent.create([{
        eventKey,
        kind,
        data: { ...snapshot(doc, kind), changeField: changeField || null, changes: changeField ? [changeField] : [], isNew, previous, version },
    }], { session: session || undefined });
}

// Outbox writes share the business operation's Mongo session. A rolled-back
// credit operation cannot leave a deliverable success notification behind.
export function notificationHooks(schema, kind) {
    schema.pre("save", async function () {
        const isNew = this.isNew;
        const changes = (watched[kind] || []).filter((field) => this.isModified(field));
        if (kind === "transaction" ? !isNew : !isNew && !changes.length) { this.$locals.notificationEvent = null; return; }
        if (!this.$session()) {
            const session = await this.constructor.db.startSession();
            session.startTransaction();
            this.$session(session);
            this.$locals.notificationOwnedSession = session;
        }
        let previous;
        if (!isNew && kind === "wallet") previous = await this.constructor.findById(this._id).select("balance expiresAt isLocked").session(this.$session()).lean();
        if (!isNew && kind === "campaign" && changes.includes("publishedSpreadsheet")) {
            const before = await this.constructor.findById(this._id).select("publishedSpreadsheet.publishedAt").session(this.$session()).lean();
            if (String(before?.publishedSpreadsheet?.publishedAt || "") === String(this.publishedSpreadsheet?.publishedAt || "")) changes.splice(changes.indexOf("publishedSpreadsheet"), 1);
        }
        this.$locals.notificationEvent = { changes, isNew, previous };
    });
    schema.post("save", async function (doc) {
        const event = doc.$locals.notificationEvent;
        if (!event) return;
        if (event.isNew) {
            await enqueue(doc, kind, null, true, null, doc.$session());
        } else {
            for (const field of event.changes) {
                await enqueue(doc, kind, field, false, event.previous, doc.$session());
            }
        }
        doc.$locals.notificationEvent = null;
        const owned = doc.$locals.notificationOwnedSession;
        if (owned) {
            await owned.commitTransaction();
            await owned.endSession();
            doc.$session(null);
            doc.$locals.notificationOwnedSession = null;
        }
    });
    schema.post("save", function (error, doc, next) {
        const session = doc?.$locals.notificationOwnedSession;
        if (!session) return next(error);
        void (async () => {
            try { if (session.inTransaction()) await session.abortTransaction(); }
            finally { await session.endSession(); doc.$session(null); doc.$locals.notificationOwnedSession = null; }
        })().then(() => next(error), () => next(error));
    });
    if (kind !== "wallet") return;
    schema.pre("findOneAndUpdate", async function () {
        if (!this.getOptions().session) {
            const session = await this.model.db.startSession();
            session.startTransaction();
            this.setOptions({ session });
            this.notificationOwnedSession = session;
        }
        this.notificationPrevious = await this.model.findOne(this.getFilter()).session(this.getOptions().session || null).lean();
    });
    schema.post("findOneAndUpdate", async function (result) {
        if (!result) {
            if (this.notificationOwnedSession) { await this.notificationOwnedSession.commitTransaction(); await this.notificationOwnedSession.endSession(); this.notificationOwnedSession = null; }
            return;
        }
        const doc = await this.model.findById(result._id).session(this.getOptions().session || null).lean();
        if (!doc) return;
        const previous = this.notificationPrevious;
        const changes = watched.wallet.filter((key) => String(doc[key] ?? "") !== String(previous?.[key] ?? ""));
        for (const field of changes) {
            await enqueue(doc, kind, field, !previous, previous && { balance: previous.balance, expiresAt: previous.expiresAt, isLocked: previous.isLocked }, this.getOptions().session);
        }
        if (this.notificationOwnedSession) { await this.notificationOwnedSession.commitTransaction(); await this.notificationOwnedSession.endSession(); this.notificationOwnedSession = null; }
    });
    schema.post("findOneAndUpdate", function (error, result, next) {
        const session = this.notificationOwnedSession;
        if (!session) return next(error);
        void (async () => {
            try { if (session.inTransaction()) await session.abortTransaction(); }
            finally { await session.endSession(); this.notificationOwnedSession = null; }
        })().then(() => next(error), () => next(error));
    });
}
