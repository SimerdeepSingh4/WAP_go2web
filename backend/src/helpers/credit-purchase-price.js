const MAX_PAISE = BigInt(Number.MAX_SAFE_INTEGER);

function decimalParts(rate) {
    const match = /^(\d+)(?:\.(\d+))?(?:E([+-]?\d+))?$/i.exec(String(rate));
    if (!match) return null;
    const [, whole, fraction = "", exponent = "0"] = match;
    const scale = Number(exponent) - fraction.length + 2;
    const coefficient = BigInt(whole + fraction);
    return coefficient > 0n && Math.abs(scale) <= 6200 ? { coefficient, scale } : null;
}

export const isPurchaseRate = rate => Boolean(decimalParts(rate));

// Decimal128 holds the quoted INR rate. Round only the final order total.
export function purchaseTotalPaisa(quantity, rate) {
    const parts = decimalParts(rate);
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || !parts) throw new RangeError("A positive whole credit quantity and INR rate are required.");
    const { coefficient, scale } = parts;
    const scaled = coefficient * BigInt(quantity);
    const factor = 10n ** BigInt(Math.abs(scale));
    const total = scale >= 0 ? scaled * factor : (scaled + factor / 2n) / factor;
    if (total <= 0n || total > MAX_PAISE) throw new RangeError("The purchase total is outside the supported paisa range.");
    return Number(total);
}
