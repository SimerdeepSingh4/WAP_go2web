// Preserve the complete database identity so references remain unique and stable.
export function campaignReference(id) {
    const value = String(id ?? "");
    return /^[a-f\d]{24}$/i.test(value) ? `CMP-${value.toUpperCase()}` : null;
}

export function campaignObjectId(reference) {
    if (typeof reference !== "string") return null;
    const value = reference.trim().replace(/^CMP-/i, "");
    return /^[a-f\d]{24}$/i.test(value) ? value.toLowerCase() : null;
}
