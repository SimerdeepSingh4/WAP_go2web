// Campaign creation uses one unformatted Indian phone number per line.
// Keep these rules shared so API requests cannot bypass the form validation.
export function campaignRecipientError(value) {
    if (typeof value !== "string" || value.length === 0 || /[^0-9]/.test(value)) {
        return "Use digits only, with one number per line; no spaces, commas or +.";
    }
    if (value.length >= 2 && !value.startsWith("91")) return "Must start with 91.";
    if (value.length !== 12) return `Has ${value.length} digits; exactly 12 required.`;
    return null;
}

export function campaignRecipientLines(raw) {
    return raw.split(/\r\n?|\n/).map((value, index) => ({ value, lineNumber: index + 1 }))
        .filter(({ value }) => value.trim().length > 0);
}
