export const RESERVED_SUBDOMAINS = new Set([
    "admin",
    "superadmin",
    "api",
    "app",
    "dashboard",
    "portal",
    "www",
    "mail",
    "email",
    "smtp",
    "ftp",
    "localhost",
    "root",
    "dev",
    "development",
    "staging",
    "stage",
    "test",
    "demo",
    "status",
    "auth",
    "login",
    "signup",
    "register",
    "billing",
    "pricing",
    "help",
    "support",
    "docs",
    "cdn",
    "assets",
    "static",
    "media",
]);

const SUBDOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

/**
 * Validates a proposed subdomain.
 * @param {string} rawSubdomain
 * @returns {{ valid: boolean, error?: string, normalized?: string }}
 */
export function validateSubdomain(rawSubdomain) {
    if (!rawSubdomain || typeof rawSubdomain !== "string") {
        return { valid: false, error: "Subdomain is required." };
    }

    const normalized = rawSubdomain.trim().toLowerCase();

    if (normalized.length < 3 || normalized.length > 30) {
        return { valid: false, error: "Subdomain must be between 3 and 30 characters long." };
    }

    if (!SUBDOMAIN_REGEX.test(normalized)) {
        return {
            valid: false,
            error: "Subdomain can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen.",
        };
    }

    if (RESERVED_SUBDOMAINS.has(normalized)) {
        return { valid: false, error: `The subdomain "${normalized}" is reserved and cannot be used.` };
    }

    return { valid: true, normalized };
}

/**
 * Extracts a candidate subdomain from a hostname header or query.
 * Handles cases like "acme.example.com", "acme.localhost:5173", "acme.localhost".
 * Ignores IP addresses, top-level domains, and bare localhost.
 * @param {string} host
 * @returns {string|null}
 */
export function extractSubdomain(host) {
    if (!host || typeof host !== "string") return null;

    // Remove port if present (e.g. "acme.localhost:5173" -> "acme.localhost")
    const cleanHost = host.split(":")[0].trim().toLowerCase();

    // Check if IP address (IPv4)
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanHost)) {
        return null;
    }

    const parts = cleanHost.split(".");

    // Case 1: "acme.localhost" (length 2 and ends with localhost)
    if (parts.length === 2 && parts[1] === "localhost") {
        return parts[0];
    }

    // Case 2: Standard domain e.g. "acme.wapgo2web.com" or "acme.onrender.com" (3 parts)
    // If it's a 2-part domain like "example.com" or 1-part "localhost", there is no subdomain.
    if (parts.length >= 3) {
        // First part is the candidate subdomain
        const sub = parts[0];
        if (sub && sub !== "www" && !RESERVED_SUBDOMAINS.has(sub)) {
            return sub;
        }
    }

    return null;
}

