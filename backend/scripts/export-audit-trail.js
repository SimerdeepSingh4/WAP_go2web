import mongoose from "mongoose";
import { once } from "node:events";
import connectToDB from "../src/config/db.js";
import { AuditEvent, AuditHead } from "../src/models/audit.model.js";
import { auditHash, validAuditHash } from "../src/services/audit.service.js";

async function output(value) {
    if (!process.stdout.write(JSON.stringify(value) + "\n")) await once(process.stdout, "drain");
}
try {
    // Send connection status to stderr so stdout contains JSONL only.
    console.log = (...args) => console.error(...args);
    await connectToDB();
    const stream = process.argv[2];
    if (!stream) throw new Error("Usage: npm run audit:export -- <stream> (redirect stdout to an archive)");
    const session = await mongoose.startSession();
    try {
        session.startTransaction({ readConcern: { level: "snapshot" } });
        const head = await AuditHead.findById(stream).session(session).lean();
        if (!head) throw new Error("Audit stream not found");
        let sequence = 0, hash = "GENESIS";
        for await (const event of AuditEvent.find({ stream }).sort({ sequence: 1 }).session(session).lean().cursor()) {
            if (event.sequence !== sequence + 1 || event.previousHash !== hash || !validAuditHash(event)) throw new Error("Audit integrity verification failed; export is incomplete");
            sequence = event.sequence; hash = event.hash;
            await output({ type: "event", event });
        }
        if (head.sequence !== sequence || head.hash !== hash) throw new Error("Audit head does not match the stream");
        const checkpoint = { stream, sequence, headHash: hash, exportedAt: new Date(), keyId: process.env.AUDIT_KEY_ID || "v1" };
        await output({ type: "checkpoint", checkpoint, signature: auditHash(checkpoint) });
        await session.commitTransaction();
    } finally { if (session.inTransaction()) await session.abortTransaction(); await session.endSession(); }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
