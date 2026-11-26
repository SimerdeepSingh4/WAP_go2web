import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, mkdir, writeFile, access, rm } from "node:fs/promises";
import os from "node:os";

Object.assign(process.env, {
    MONGO_URI: "mongodb://127.0.0.1/branding-test",
    JWT_SECRET: "branding-test-secret",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "6379",
    REDIS_PASSWORD: "test",
    AUDIT_SIGNING_KEY: "branding-test-audit-key-at-least-32-bytes",
});

const { default: userModel } = await import("../models/user.model.js");
const { deleteBrandLogoFile, removeResellerLogo } = await import("./branding.controller.js");

test("deleteBrandLogoFile deletes owned local logo files and ignores foreign or traversal paths", async (t) => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "branding-logo-test-"));
    const originalCwd = process.cwd();
    t.after(async () => {
        process.chdir(originalCwd);
        await rm(tmpRoot, { recursive: true, force: true });
    });

    const uploadDir = path.join(tmpRoot, "uploads", "white-label-logos");
    await mkdir(uploadDir, { recursive: true });
    const ownedName = "logo_reseller1_11111111-2222-3333-4444-555555555555.webp";
    const otherName = "logo_other_11111111-2222-3333-4444-555555555555.webp";
    await writeFile(path.join(uploadDir, ownedName), "owned");
    await writeFile(path.join(uploadDir, otherName), "other");
    process.chdir(tmpRoot);

    await deleteBrandLogoFile("reseller1", `/uploads/white-label-logos/${ownedName}`);
    await assert.rejects(() => access(path.join(uploadDir, ownedName)));

    await deleteBrandLogoFile("reseller1", `/uploads/white-label-logos/${otherName}`);
    await access(path.join(uploadDir, otherName));

    await deleteBrandLogoFile("reseller1", `/uploads/white-label-logos/../white-label-logos/${otherName}`);
    await access(path.join(uploadDir, otherName));
});

test("removeResellerLogo enforces active white-label access and removes the logo when active", async (t) => {
    const expiredReseller = {
        _id: "reseller-expired",
        role: "Reseller",
        whiteLabel: { enabled: true, expiresAt: new Date(Date.now() - 60_000), logoUrl: "/uploads/white-label-logos/logo_reseller-expired_abc.webp" },
        async save() { assert.fail("Expired reseller should not save"); },
    };

    t.mock.method(userModel, "findById", async () => expiredReseller);
    const expiredRes = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    await removeResellerLogo({ user: { _id: "reseller-expired" } }, expiredRes);
    assert.equal(expiredRes.statusCode, 403);
    assert.equal(expiredRes.body.success, false);

    let saved = false;
    const activeReseller = {
        _id: "reseller-active",
        role: "Reseller",
        whiteLabel: { enabled: true, expiresAt: null, logoUrl: "" },
        async save() { saved = true; },
    };
    t.mock.method(userModel, "findById", async () => activeReseller);
    const activeRes = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
    await removeResellerLogo({ user: { _id: "reseller-active" } }, activeRes);
    assert.equal(activeRes.statusCode, 200);
    assert.equal(activeRes.body.success, true);
    assert.equal(saved, true);
});
