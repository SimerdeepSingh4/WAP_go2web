process.env.MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-12345";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import userModel from "./src/models/user.model.js";
import { resolveBranding, getResellerBranding, updateResellerBranding } from "./src/controllers/branding.controller.js";
import { updateWhiteLabelAccess } from "./src/controllers/user.controller.js";

// Mock Express req/res
function mockRes() {
    return {
        statusCode: 200,
        data: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.data = payload;
            return this;
        },
    };
}

async function runTests() {
    console.log("Starting White-Label End-to-End Test Suite...");

    // Setup in-memory mock or test user instances
    const adminUser = { _id: new mongoose.Types.ObjectId(), username: "admin", role: "Super Admin" };
    const reseller1Id = new mongoose.Types.ObjectId();
    const reseller2Id = new mongoose.Types.ObjectId();
    const regularUserId = new mongoose.Types.ObjectId();

    // 1. Test Model Virtuals & Methods
    console.log("Testing Model Virtuals & Defaults...");
    const reseller1 = new userModel({
        _id: reseller1Id,
        username: "reseller1",
        email: "reseller1@test.com",
        password: "hashedPassword123",
        role: "Reseller",
        whiteLabel: {
            enabled: false,
            expiresAt: null,
            subdomain: "",
        },
    });

    assert.equal(reseller1.isWhiteLabelActive, false);

    // Enable with future expiry
    reseller1.whiteLabel.enabled = true;
    reseller1.whiteLabel.expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
    assert.equal(reseller1.isWhiteLabelActive, true);

    // Expired
    reseller1.whiteLabel.expiresAt = new Date(Date.now() - 1000 * 60);
    assert.equal(reseller1.isWhiteLabelActive, false);
    console.log("✓ Model virtuals verified!");

    // 2. Test Super Admin Granting White-Label Access Controller Logic
    console.log("Testing Super Admin Access Control...");

    // Mock findById for controller
    const originalFindById = userModel.findById;
    userModel.findById = function (id) {
        return {
            exec: async () => null,
            then(resolve) {
                if (String(id) === String(reseller1Id)) return resolve(reseller1);
                if (String(id) === String(regularUserId)) {
                    return resolve(new userModel({ _id: regularUserId, username: "client1", role: "User", whiteLabel: {} }));
                }
                return resolve(null);
            },
        };
    };

    // Attempt granting to regular User -> must fail with 400
    const reqInvalid = {
        params: { id: regularUserId.toString() },
        body: { enabled: true },
        user: adminUser,
    };
    const resInvalid = mockRes();
    await updateWhiteLabelAccess(reqInvalid, resInvalid);
    assert.equal(resInvalid.statusCode, 400);
    assert.match(resInvalid.data.message, /only be granted to Reseller/i);
    console.log("✓ Non-reseller accounts correctly rejected from white-label access!");

    // Grant to Reseller with 30-day expiry
    const futureExpiry = new Date(Date.now() + 30 * 86400000).toISOString();
    const reqGrant = {
        params: { id: reseller1Id.toString() },
        body: { enabled: true, expiresAt: futureExpiry },
        user: adminUser,
    };
    const resGrant = mockRes();
    reseller1.save = async function () { return this; };
    await updateWhiteLabelAccess(reqGrant, resGrant);
    assert.equal(resGrant.statusCode, 200);
    assert.equal(resGrant.data.success, true);
    assert.equal(reseller1.whiteLabel.enabled, true);
    assert.ok(reseller1.whiteLabel.expiresAt);
    console.log("✓ Super Admin successfully granted white-label access with expiry!");

    // 3. Test Reseller Updating Subdomain & Colors
    console.log("Testing Reseller Branding Configuration...");

    // Mock findOne for uniqueness check
    userModel.findOne = function (query) {
        return {
            select() { return this; },
            then(resolve) {
                // If checking for subdomain taken by another reseller
                if (query["whiteLabel.subdomain"] === "taken-brand") {
                    return resolve({ _id: reseller2Id, username: "reseller2" });
                }
                // If resolving active subdomain from public resolution (no _id filter)
                if (query["whiteLabel.subdomain"] === "apex-marketing" && !query._id && reseller1.isWhiteLabelActive) {
                    return resolve(reseller1);
                }
                return resolve(null);
            },
        };
    };

    // Invalid subdomain (too short)
    const reqBadSub = {
        user: { _id: reseller1Id, role: "Reseller" },
        body: { subdomain: "ab" },
    };
    const resBadSub = mockRes();
    await updateResellerBranding(reqBadSub, resBadSub);
    assert.equal(resBadSub.statusCode, 400);

    // Collision with another reseller
    const reqConflict = {
        user: { _id: reseller1Id, role: "Reseller" },
        body: { subdomain: "taken-brand" },
    };
    const resConflict = mockRes();
    await updateResellerBranding(reqConflict, resConflict);
    assert.equal(resConflict.statusCode, 409);
    console.log("✓ Subdomain format validation & collision detection verified!");

    // Valid branding update
    const reqGood = {
        user: { _id: reseller1Id, role: "Reseller" },
        body: {
            subdomain: "apex-marketing",
            brandName: "Apex Marketing Pro",
            primaryColor: "#000080",
            secondaryColor: "#e2eff6",
        },
    };
    const resGood = mockRes();
    await updateResellerBranding(reqGood, resGood);
    assert.equal(resGood.statusCode, 200);
    assert.equal(reseller1.whiteLabel.subdomain, "apex-marketing");
    assert.equal(reseller1.whiteLabel.brandName, "Apex Marketing Pro");
    assert.equal(reseller1.whiteLabel.primaryColor, "#000080");
    console.log("✓ Reseller successfully customized branding and theme colors!");

    // 4. Test Public Dynamic Brand Resolution
    console.log("Testing Public Brand Resolution...");

    // Active subdomain request
    const reqResolve = {
        query: { subdomain: "apex-marketing" },
        headers: {},
    };
    const resResolve = mockRes();
    await resolveBranding(reqResolve, resResolve);
    assert.equal(resResolve.statusCode, 200);
    assert.equal(resResolve.data.branding.isWhiteLabeled, true);
    assert.equal(resResolve.data.branding.brandName, "Apex Marketing Pro");
    assert.equal(resResolve.data.branding.primaryColor, "#000080");
    console.log("✓ Public resolution successfully returned custom branding for active subdomain!");

    // Expired subdomain resolution
    reseller1.whiteLabel.expiresAt = new Date(Date.now() - 5000); // Expired
    const resResolveExpired = mockRes();
    await resolveBranding(reqResolve, resResolveExpired);
    assert.equal(resResolveExpired.statusCode, 200);
    assert.equal(resResolveExpired.data.branding.isWhiteLabeled, false);
    assert.equal(resResolveExpired.data.branding.brandName, "Promotion");
    console.log("✓ Expired white-label seamlessly reverted to platform default!");

    // Cleanup mocks
    userModel.findById = originalFindById;

    console.log("\n==========================================");
    console.log("ALL WHITE-LABEL INTEGRATION TESTS PASSED!");
    console.log("==========================================");
}

runTests().catch((err) => {
    console.error("Test failure:", err);
    process.exit(1);
});
