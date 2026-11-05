const keyOf = (value) => String(value ?? "").replace(/\D/g, "") || String(value ?? "").trim().toLowerCase();

export function originalCampaignEntries(campaign) {
    let source;
    if (campaign.originalRecipients?.length) {
        const valid = new Set((campaign.recipients || []).map((row) => keyOf(row.phoneNumber)));
        const seen = new Set();
        source = campaign.originalRecipients.map((phoneNumber) => {
            const key = keyOf(phoneNumber);
            const kind = !valid.has(key) ? "invalid" : seen.has(key) ? "duplicate" : "submitted";
            seen.add(key);
            return { phoneNumber, kind };
        });
    } else if (campaign.recipients?.length || campaign.recipientStats?.duplicatesList?.length || campaign.recipientStats?.invalidList?.length) {
        source = [
            ...(campaign.recipients || []).map((row) => ({ phoneNumber: row.phoneNumber, kind: "submitted" })),
            ...(campaign.recipientStats?.duplicatesList || []).map((phoneNumber) => ({ phoneNumber, kind: "duplicate" })),
            ...(campaign.recipientStats?.invalidList || []).map((phoneNumber) => ({ phoneNumber, kind: "invalid" })),
        ];
    } else source = [...(campaign.recipientEntries || [])].sort((a, b) => a.rowNumber - b.rowNumber).map((row) => ({ phoneNumber: row.phoneNumber, kind: "submitted" }));
    return source.map((row, index) => ({ rowNumber: index + 1, phoneNumber: String(row.phoneNumber ?? ""), kind: row.kind }));
}

export function campaignContactRows(campaign) {
    const original = originalCampaignEntries(campaign);
    const sheet = campaign.publishedSpreadsheet;
    const published = Boolean(sheet?.publishedAt);
    const byPhone = new Map();
    for (const row of sheet?.rows || []) {
        const key = keyOf(row.phoneNumber);
        if (!byPhone.has(key)) byPhone.set(key, []);
        byPhone.get(key).push(row);
    }
    return original.map((row) => {
        const result = byPhone.get(keyOf(row.phoneNumber))?.shift();
        return { ...row, status: !published ? "pending_report" : sheet.status === "failed" ? "failed" : result?.status || "queued" };
    });
}

// Older drafts could drop invalid inputs when stripping non-digits. Restore
// missing submitted occurrences without renumbering any existing report rows.
export function restoreOriginalCampaignEntries(campaign) {
    const rows = (campaign.recipientEntries || []).map((row) => row.toObject ? row.toObject() : { ...row });
    const remaining = new Map();
    for (const row of rows) remaining.set(keyOf(row.phoneNumber), (remaining.get(keyOf(row.phoneNumber)) || 0) + 1);
    let next = rows.reduce((max, row) => Math.max(max, Number(row.rowNumber) || 0), 0) + 1;
    for (const original of originalCampaignEntries(campaign)) {
        const key = keyOf(original.phoneNumber);
        if (remaining.get(key) > 0) { remaining.set(key, remaining.get(key) - 1); continue; }
        const invalid = original.kind === "invalid", duplicate = original.kind === "duplicate";
        rows.push({ rowNumber: next++, phoneNumber: original.phoneNumber, status: invalid || duplicate ? "failed" : "queued", classification: invalid ? "wrong" : duplicate ? "duplicate" : "pending", category: invalid ? "Wrong number" : duplicate ? "Duplicate number" : "All", tabKey: invalid ? "wrong" : duplicate ? "duplicate" : "all", billingAction: invalid || duplicate ? "refund" : "keep", notes: "", cells: {} });
    }
    return rows;
}
