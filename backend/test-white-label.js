import assert from "node:assert/strict";
import { validateSubdomain, extractSubdomain, RESERVED_SUBDOMAINS } from "./src/helpers/subdomain.helper.js";

// Test 1: Subdomain Validation
console.log("Running Subdomain Helper Tests...");

// Valid subdomains
assert.equal(validateSubdomain("acme").valid, true);
assert.equal(validateSubdomain("brand-123").valid, true);
assert.equal(validateSubdomain("my-portal").normalized, "my-portal");
assert.equal(validateSubdomain("ACME-CORP").normalized, "acme-corp");

// Invalid lengths
assert.equal(validateSubdomain("ab").valid, false);
assert.equal(validateSubdomain("a".repeat(31)).valid, false);

// Invalid characters & hyphen placement
assert.equal(validateSubdomain("acme_corp").valid, false);
assert.equal(validateSubdomain("acme!").valid, false);
assert.equal(validateSubdomain("-acme").valid, false);
assert.equal(validateSubdomain("acme-").valid, false);
assert.equal(validateSubdomain("").valid, false);
assert.equal(validateSubdomain(null).valid, false);

// Reserved subdomains
assert.equal(validateSubdomain("admin").valid, false);
assert.equal(validateSubdomain("superadmin").valid, false);
assert.equal(validateSubdomain("api").valid, false);
assert.equal(validateSubdomain("www").valid, false);
assert.equal(validateSubdomain("dashboard").valid, false);
assert.equal(validateSubdomain("portal").valid, false);

console.log("✓ Subdomain validation tests passed!");

// Test 2: Subdomain Extraction from Host Header
console.log("Running Subdomain Extraction Tests...");

assert.equal(extractSubdomain("acme.myplatform.com"), "acme");
assert.equal(extractSubdomain("brand-one.onrender.com:443"), "brand-one");
assert.equal(extractSubdomain("testcorp.localhost:5173"), "testcorp");
assert.equal(extractSubdomain("testcorp.localhost"), "testcorp");
assert.equal(extractSubdomain("localhost:3000"), null);
assert.equal(extractSubdomain("127.0.0.1:5173"), null);
assert.equal(extractSubdomain("myplatform.com"), null);
assert.equal(extractSubdomain("www.myplatform.com"), null);
assert.equal(extractSubdomain("admin.myplatform.com"), null); // reserved ignored
assert.equal(extractSubdomain(""), null);
assert.equal(extractSubdomain(null), null);

console.log("✓ Subdomain extraction tests passed!");

// Test 3: Expiry logic simulation
console.log("Running Expiry Logic Tests...");

function isWhiteLabelActive(wl) {
    if (!wl?.enabled) return false;
    if (!wl.expiresAt) return true;
    return new Date(wl.expiresAt) > new Date();
}

function isWhiteLabelExpired(wl) {
    if (!wl?.enabled) return false;
    if (!wl.expiresAt) return false;
    return new Date(wl.expiresAt) <= new Date();
}

// Lifetime active
const lifetime = { enabled: true, expiresAt: null };
assert.equal(isWhiteLabelActive(lifetime), true);
assert.equal(isWhiteLabelExpired(lifetime), false);

// Future expiry active
const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30); // +30 days
const future = { enabled: true, expiresAt: futureDate.toISOString() };
assert.equal(isWhiteLabelActive(future), true);
assert.equal(isWhiteLabelExpired(future), false);

// Past expiry expired
const pastDate = new Date(Date.now() - 1000 * 60); // -1 minute
const expired = { enabled: true, expiresAt: pastDate.toISOString() };
assert.equal(isWhiteLabelActive(expired), false);
assert.equal(isWhiteLabelExpired(expired), true);

// Disabled
const disabled = { enabled: false, expiresAt: futureDate.toISOString() };
assert.equal(isWhiteLabelActive(disabled), false);
assert.equal(isWhiteLabelExpired(disabled), false);

console.log("✓ Expiry logic tests passed!");
console.log("ALL WHITE-LABEL UNIT TESTS COMPLETED SUCCESSFULLY!");

