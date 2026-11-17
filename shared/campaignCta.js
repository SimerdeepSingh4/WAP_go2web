export const CTA_LABEL_LIMIT = 25;
export const LINK_BUTTON_LABELS = ["Visit Website", "View Offer", "Claim Deal", "Shop Now", "Learn More", "Book Now"];
export const CALL_BUTTON_LABELS = ["Call Now", "Contact Sales", "Call to Book", "Speak to Our Team"];
export const DEFAULT_LINK_LABEL = LINK_BUTTON_LABELS[0];
export const DEFAULT_CALL_LABEL = CALL_BUTTON_LABELS[0];

export function normalizeCampaignCtaLabel(value, fallback) {
    if (value != null && typeof value !== "string") throw new Error("Button labels must be text.");
    const label = value?.trim() || fallback;
    if (label.length > CTA_LABEL_LIMIT) throw new Error(`Button labels must be ${CTA_LABEL_LIMIT} characters or fewer.`);
    return label;
}
