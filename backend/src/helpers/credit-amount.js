const invalidAmount = (message) => Object.assign(new Error(message), { statusCode: 400 });
// Credits have two decimal places. All arithmetic is done in integer hundredths.
export function creditMinor(value) {
    if (typeof value !== "number" && typeof value !== "string") throw invalidAmount("Invalid credit amount");
    if (typeof value === "string" && !value.trim()) throw invalidAmount("Invalid credit amount");
    const amount = Number(value);
    const scaled = amount * 100;
    const minor = Math.round(scaled);
    if (!Number.isFinite(amount) || !Number.isSafeInteger(minor) || Math.abs(scaled - minor) > 0.000001) {
        throw invalidAmount("Credits must be finite, within the supported range, and have at most two decimal places");
    }
    return minor;
}

export const creditAmount = (value) => creditMinor(value) / 100;
export function creditsForCount(rate, count) {
    if (!Number.isSafeInteger(Number(count)) || Number(count) < 0) throw invalidAmount("Recipient count must be a non-negative integer");
    const minor = creditMinor(rate) * Number(count);
    if (minor < 0 || !Number.isSafeInteger(minor)) throw invalidAmount("Invalid campaign credit amount");
    return minor / 100;
}
export const creditDifference = (target, previous) => creditAmount((creditMinor(target) - creditMinor(previous)) / 100);

export const creditTransactionOptions = {
    readConcern: { level: "snapshot" },
    writeConcern: { w: "majority", j: true },
};
