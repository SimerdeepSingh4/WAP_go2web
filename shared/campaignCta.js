export const CTA_LABEL_LIMIT = 25;
export const LINK_BUTTON_LABELS = ["Visit Website", "View Offer", "Claim Deal", "Shop Now", "Learn More", "Book Now"];
export const CALL_BUTTON_LABELS = ["Call Now", "Contact Sales", "Call to Book", "Speak to Our Team"];
export const DEFAULT_LINK_LABEL = LINK_BUTTON_LABELS[0];
export const DEFAULT_CALL_LABEL = CALL_BUTTON_LABELS[0];

export function campaignLinkError(value) {
    if (value == null || value === "") return "";
    const hint = "Enter a full website URL, such as https://example.com/offer.";
    if (typeof value !== "string") return hint;
    const link = value.trim();
    if (!link) return "";
    if (link.length > 2048 || !/^https?:\/\/[^/\\?#]/i.test(link) || /[\s\\]/.test(link)) return hint;
    try {
        const { hostname } = new URL(link);
        if (hostname.startsWith("[")) return ""; // URL has already validated the IPv6 address.
        const labels = hostname.replace(/\.$/, "").split(".");
        return labels.length > 1 && labels.every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)) ? "" : hint;
    } catch {
        return hint;
    }
}

// Each app supplies its local copy of the same numbering-plan validator.
export function campaignNumberError(value, isValidPhoneNumber) {
    if (value == null || value === "") return "";
    const hint = "Enter a valid phone number with its country code, such as +91 98765 43210.";
    if (typeof value !== "string") return hint;
    const input = value.trim();
    if (!input) return "";
    if (input.length > 40 || !/^\+?[\d ().-]+$/.test(input)) return hint;
    const digits = input.replace(/[+ ().-]/g, "");
    return /^[1-9]\d{6,14}$/.test(digits) && isValidPhoneNumber("+" + digits) ? "" : hint;
}

export function normalizeCampaignCtaLabel(value, fallback) {
    if (value != null && typeof value !== "string") throw new Error("Button labels must be text.");
    const label = value?.trim() || fallback;
    if (label.length > CTA_LABEL_LIMIT) throw new Error(`Button labels must be ${CTA_LABEL_LIMIT} characters or fewer.`);
    return label;
}
