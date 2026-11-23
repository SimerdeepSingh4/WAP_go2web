import { campaignRecipientError, campaignRecipientLines } from "./campaignRecipients.js";

export const MAX_FILTERING_ROWS = 100_000;
export const MAX_FILTERING_CATEGORIES = 24;
export const MAX_FILTERING_CATEGORY_LABEL = 48;
export const FILTERING_RESULT_CATEGORIES = Object.freeze([
    { id: "valid", label: "Valid numbers" },
    { id: "duplicates", label: "Duplicates" },
    { id: "wrong", label: "Wrong numbers" },
    { id: "not-on-whatsapp", label: "Not on WhatsApp" },
]);
export const LEGACY_FILTERING_CATEGORY = Object.freeze({ id: "returned", label: "Returned numbers" });
export const FILTERING_STATUS_LABELS = Object.freeze({
    SUBMITTED: "Submitted",
    IN_REVIEW: "In review",
    PUBLISHED: "Results published",
    CLOSED: "Closed",
});
export const FILTERING_STATUSES = Object.freeze(Object.keys(FILTERING_STATUS_LABELS));

export function parseFilteringRows(input) {
    const result = { rows: [], enteredCount: 0, invalidCount: 0, invalidEntries: [], duplicatesCount: 0, error: "" };
    if (typeof input !== "string") {
        result.error = "Enter phone numbers as text, one per line.";
        return result;
    }
    if (input.length > MAX_FILTERING_ROWS * 14) {
        result.error = "The list is too large. Submit up to 100,000 rows at a time.";
        return result;
    }
    const lines = campaignRecipientLines(input);
    result.enteredCount = lines.length;
    if (lines.length > MAX_FILTERING_ROWS) {
        result.error = "Submit up to 100,000 rows at a time.";
        return result;
    }
    const seen = new Set();
    for (const { value, lineNumber } of lines) {
        const message = campaignRecipientError(value);
        if (message) {
            result.invalidCount++;
            if (result.invalidEntries.length < 10) result.invalidEntries.push({ lineNumber, message });
            continue;
        }
        if (seen.has(value)) result.duplicatesCount++;
        else seen.add(value);
        result.rows.push({ rowNumber: lineNumber, phoneNumber: value });
    }
    return result;
}

export function matchFilteringResults(input, submittedRows) {
    const parsed = parseFilteringRows(input);
    const original = new Map();
    for (const row of submittedRows) if (!original.has(row.phoneNumber)) original.set(row.phoneNumber, row);
    const matched = new Map();
    const unmatchedEntries = [];
    let unmatchedCount = 0;
    for (const row of parsed.rows) {
        const source = original.get(row.phoneNumber);
        if (!source) {
            unmatchedCount++;
            if (unmatchedEntries.length < 10) unmatchedEntries.push({ lineNumber: row.rowNumber, message: "This number was not in the submitted list." });
        } else if (!matched.has(row.phoneNumber)) {
            matched.set(row.phoneNumber, source);
        }
    }
    return { ...parsed, rows: [...matched.values()], unmatchedEntries, unmatchedCount };
}

export function matchCategorizedFilteringResults(categories, submittedRows) {
    const result = { categories: [...FILTERING_RESULT_CATEGORIES], rows: [], issues: [], invalidCount: 0, error: "" };
    if (!Array.isArray(categories) || categories.length > MAX_FILTERING_CATEGORIES) {
        return { ...result, error: `Use up to ${MAX_FILTERING_CATEGORIES} result categories.` };
    }

    const presets = new Map(FILTERING_RESULT_CATEGORIES.map(category => [category.id, category.label]));
    const ids = new Set(["all"]);
    const labels = new Set([...presets.values()].map(label => label.toLowerCase()));
    let inputLength = 0;
    for (const category of categories) {
        if (!category || typeof category.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(category.id)
            || ids.has(category.id) || typeof category.label !== "string" || typeof category.numbers !== "string") {
            return { ...result, error: "Each result category needs a unique identifier, a name and a list of numbers." };
        }
        const label = category.label.trim();
        const preset = presets.get(category.id);
        if (!label || label.length > MAX_FILTERING_CATEGORY_LABEL || /[\u0000-\u001f\u007f]/.test(label)
            || (preset ? label !== preset : labels.has(label.toLowerCase()))) {
            return { ...result, error: `Use a unique category name of up to ${MAX_FILTERING_CATEGORY_LABEL} characters.` };
        }
        ids.add(category.id);
        labels.add(label.toLowerCase());
        if (!preset) result.categories.push({ id: category.id, label });
        inputLength += category.numbers.length;
    }
    if (result.categories.length > MAX_FILTERING_CATEGORIES) return { ...result, error: `Use up to ${MAX_FILTERING_CATEGORIES} result categories.` };
    if (inputLength > MAX_FILTERING_ROWS * 14) return { ...result, error: "The combined result lists are too large for this request." };

    const available = new Map();
    for (const row of submittedRows) {
        let pool = available.get(row.phoneNumber);
        if (!pool) {
            pool = { rows: [], start: 0, end: 0 };
            available.set(row.phoneNumber, pool);
        }
        pool.rows.push(row);
        pool.end++;
    }
    for (const category of categories) {
        const parsed = parseFilteringRows(category.numbers);
        if (parsed.error) return { ...result, error: parsed.error };
        const issues = [...parsed.invalidEntries];
        result.invalidCount += parsed.invalidCount;
        const repeats = category.id === "duplicates";
        for (const row of parsed.rows) {
            const pool = available.get(row.phoneNumber);
            if (pool && pool.start < pool.end && (!repeats || pool.end > 1)) {
                const original = pool.rows[repeats ? pool.end - 1 : pool.start];
                if (repeats) pool.end--;
                else pool.start++;
                result.rows.push({ rowNumber: original.rowNumber, phoneNumber: original.phoneNumber, category: category.id });
                continue;
            }
            result.invalidCount++;
            if (issues.length < 10) {
                const message = !pool ? "This number was not submitted."
                    : repeats ? "Only extra submitted occurrences belong in Duplicates."
                    : "Every submitted occurrence of this number is already assigned.";
                issues.push({ lineNumber: row.rowNumber, message });
            }
        }
        result.issues.push(...issues.sort((a, b) => a.lineNumber - b.lineNumber).map(issue => ({ ...issue, categoryId: category.id })));
    }
    result.rows.sort((a, b) => a.rowNumber - b.rowNumber);
    return result;
}
