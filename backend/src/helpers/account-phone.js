export function normalizeAccountPhone(value) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value !== "string" || value.length > 40 || !/^\+?[\d\s().-]+$/.test(value.trim())) {
        throw Object.assign(new Error("Enter a valid phone number with 7 to 15 digits, including the country code."), { statusCode: 400 });
    }
    const phone = value.trim().replace(/[\s().-]/g, "");
    if (!/^\+?\d{7,15}$/.test(phone)) throw Object.assign(new Error("Enter a valid phone number with 7 to 15 digits, including the country code."), { statusCode: 400 });
    return phone;
}

export function normalizeAccountCompany(value) {
    if (value === undefined || value === null || value === "") return "";
    if (typeof value !== "string" || value.trim().length > 150) throw Object.assign(new Error("Company name must be 150 characters or fewer."), { statusCode: 400 });
    return value.trim();
}
