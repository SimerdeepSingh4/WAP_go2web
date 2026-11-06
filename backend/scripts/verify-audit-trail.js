import mongoose from "mongoose";
import connectToDB from "../src/config/db.js";
import { AuditHead } from "../src/models/audit.model.js";
import { verifyAuditStream } from "../src/services/audit.service.js";

try {
    await connectToDB();
    const stream = process.argv[2];
    let invalid = false;
    for await (const head of AuditHead.find(stream ? { _id: stream } : {}).lean().cursor()) {
        const result = await verifyAuditStream(head._id);
        console.log(JSON.stringify(result));
        if (!result.valid) invalid = true;
    }
    if (stream && !await AuditHead.exists({ _id: stream })) throw new Error("Audit stream not found");
    if (invalid) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
