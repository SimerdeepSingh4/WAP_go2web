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

// Earlier reports assigned All indexes to valid numbers first, followed by
// duplicates and invalid inputs. Keep established indexes only when the
// stored original slots contain exactly the submitted occurrences.
export function originalReportRowsByIndex(campaign) {
    const originals = originalCampaignEntries(campaign);
    const byIndex = new Map(originals.map(row => [row.rowNumber, row]));
    const stored = campaign.recipientEntries || [];
    if (!stored.length) return byIndex;
    const counts = new Map();
    for (const row of originals) {
        const phone = keyOf(row.phoneNumber);
        counts.set(phone, (counts.get(phone) || 0) + 1);
    }
    const established = new Map();
    for (const row of stored) {
        if (!byIndex.has(row.rowNumber)) continue;
        const phone = keyOf(row.phoneNumber);
        if (established.has(row.rowNumber) || !counts.get(phone)) return byIndex;
        counts.set(phone, counts.get(phone) - 1);
        established.set(row.rowNumber, row);
    }
    return established.size === originals.length ? established : byIndex;
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

export function initialCampaignReportRows(campaign) {
    const reportMap = new Map();
    for (const rec of campaign.recipientReport?.records || []) {
        if (rec.phoneNumber) {
            reportMap.set(String(rec.phoneNumber).replace(/\D/g, ""), {
                category: rec.category,
                billingAction: rec.billingAction,
            });
        }
    }

    const recipients = new Map((campaign.recipients || []).map(row => [String(row.phoneNumber).replace(/\D/g, ""), row]));
    return originalCampaignEntries(campaign).map(({ rowNumber, phoneNumber, kind }) => {
        const phone = phoneNumber.replace(/\D/g, "") || phoneNumber.trim();
        const info = reportMap.get(phone);
        const status = kind === "submitted" ? recipients.get(phone)?.status || "queued" : "failed";
        const duplicate = kind === "duplicate";
        const failed = status === "failed";
        const delivered = status === "delivered";
        return {
            rowNumber, phoneNumber: phone, status,
            classification: duplicate ? "duplicate" : failed ? "wrong" : delivered ? "delivered" : "pending",
            category: info?.category || (duplicate ? "Duplicate number" : failed ? "Wrong number" : delivered ? "Delivered" : "Queued"),
            tabKey: duplicate ? "duplicate" : failed ? "wrong" : delivered ? "delivered" : "all",
            billingAction: info?.billingAction || (failed ? "refund" : "keep"),
            tags: duplicate ? ["Duplicate"] : kind === "invalid" ? ["Wrong Number"] : failed ? ["Failed"] : [],
        };
    });
}
