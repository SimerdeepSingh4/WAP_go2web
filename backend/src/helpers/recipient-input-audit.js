const badAudit = () => Object.assign(new Error("Invalid recipient activity data. Reload the draft and try again."), { statusCode: 400 });
export function sanitizeRecipientInputAudit(input, recipients, submittedBy) {
    if (input === undefined || input === null || input === "") return null;
    if (typeof input === "string" && Buffer.byteLength(input) > 1024) throw badAudit();
    let activity;
    try { activity = typeof input === "string" ? JSON.parse(input) : input; } catch { throw badAudit(); }
    if (!activity || typeof activity !== "object" || Array.isArray(activity) || Buffer.byteLength(JSON.stringify(activity)) > 1024) throw badAudit();
    for (const flag of ["hasPasted", "wasModifiedAfterPaste", "suspiciousOverwrite"]) if (typeof activity[flag] !== "boolean") throw badAudit();
    if (!Number.isSafeInteger(activity.pasteCount) || activity.pasteCount < 0 || activity.pasteCount > 1000000000 || !Number.isSafeInteger(activity.finalTextLength) || activity.finalTextLength < 0 || activity.finalTextLength > 50 * 1024 * 1024) throw badAudit();
    if (activity.hasPasted !== (activity.pasteCount > 0) || activity.wasModifiedAfterPaste && !activity.hasPasted || activity.suspiciousOverwrite && (!activity.wasModifiedAfterPaste || activity.pasteCount < 2)) throw badAudit();
    const minimumLength = recipients.reduce((total, row) => total + String(typeof row === "string" ? row : row?.phoneNumber || "").length, Math.max(0, recipients.length - 1));
    if (activity.finalTextLength < minimumLength) throw badAudit();
    return { version: 2, collectionMethod: "browser_tripwire", submittedBy, recordedAt: new Date(),
        hasPasted: activity.hasPasted, pasteCount: activity.pasteCount, wasModifiedAfterPaste: activity.wasModifiedAfterPaste,
        suspiciousOverwrite: activity.suspiciousOverwrite, finalTextLength: activity.finalTextLength };
}
