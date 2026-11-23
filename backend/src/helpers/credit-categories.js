export const CAMPAIGN_CREDITS = "CAMPAIGN";
export const NUMBER_FILTERING_CREDITS = "NUMBER_FILTERING";
export const CREDIT_CATEGORIES = Object.freeze([CAMPAIGN_CREDITS, NUMBER_FILTERING_CREDITS]);
export const CREDIT_BUCKETS = Object.freeze(["available", "reserved"]);
export const LEGACY_CREDITS = Object.freeze({ category: null });

export const isCreditQuantity = value => Number.isSafeInteger(value) && value >= 0;
export const creditBalancePath = (category, bucket) => `creditBalances.${category}.${bucket}`;
export const isCreditBalancePath = path => CREDIT_CATEGORIES.some(category =>
    CREDIT_BUCKETS.some(bucket => creditBalancePath(category, bucket) === path));

export function categoryBalances(wallet) {
    return Object.fromEntries(CREDIT_CATEGORIES.map(category => [category, {
        available: wallet?.creditBalances?.[category]?.available ?? 0,
        reserved: wallet?.creditBalances?.[category]?.reserved ?? 0,
    }]));
}

export function validCategoryBalance({ available, reserved }) {
    return isCreditQuantity(available) && isCreditQuantity(reserved) && isCreditQuantity(available + reserved);
}
