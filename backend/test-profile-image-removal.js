import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const userId = "6ae96a3caacdc8ca6d181395";
const filename = `dp_${userId}_12345678-abcd-4321-aaaa-123456789012.webp`;

async function fixture({ photo = "", missing = false, updateError = false, cleanupError = false } = {}) {
    const updates = [], removedFiles = [], removedCloudFiles = [];
    const source = await readFile(new URL("./src/controllers/user.controller.js", import.meta.url), "utf8");
    const imports = new Map([...source.matchAll(/import\s+([^;]+?)\s+from\s+["']([^"']+)["'];/g)].map(([, clause, name]) => [name, clause.trim()]));
    const dependencies = {
        "../models/user.model.js": { default: { findByIdAndUpdate: (...args) => {
            updates.push(args);
            return { select: async (fields) => {
                assert.equal(fields, "username email role dp_img");
                if (updateError) throw new Error("Database unavailable");
                if (missing) return null;
                const user = { _id: userId, username: "Photo owner", role: "User", dp_img: photo };
                return { ...user, toObject: () => user };
            } };
        } } },
        "node:path": { default: path },
        "node:fs/promises": { mkdir() {}, writeFile() {}, unlink: async (file) => { removedFiles.push(file); if (cleanupError) throw Error("Storage unavailable"); } },
        "../config/cloudinary.config.js": { isCloudinaryConfigured: () => true, default: { uploader: { destroy: async (...args) => { removedCloudFiles.push(args); } } } },
    };
    const context = vm.createContext({ URL, console: { error() {}, warn() {} }, process: { cwd: () => path.resolve("test-workspace"), env: { CLOUDINARY_CLOUD_NAME: "test-cloud" } } });
    const module = new vm.SourceTextModule(source, { context });
    await module.link(async (name) => {
        const clause = imports.get(name);
        const exports = dependencies[name] || (clause.startsWith("{")
            ? Object.fromEntries(clause.slice(1, -1).split(",").map((part) => [part.trim().split(/\s+as\s+/)[0], () => {}]))
            : { default: {} });
        return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key, value] of Object.entries(exports)) this.setExport(key, value); }, { context });
    });
    await module.evaluate();
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    const invoke = (overrides = {}) => module.namespace.removeCurrentUserProfileImage({ user: { _id: userId }, params: { id: "another-account" }, ...overrides }, res);
    return { invoke, res, updates, removedFiles, removedCloudFiles };
}

test("removal clears only the signed-in user's photo and returns the default avatar value", async () => {
    const f = await fixture({ photo: `/uploads/profile-pictures/${filename}` });
    await f.invoke();
    assert.equal(f.res.code, 200);
    assert.equal(f.res.body.user.dp_img, "");
    assert.equal(f.updates[0][0], userId);
    assert.equal(f.updates[0][1].$set.dp_img, "");
    assert.equal(f.updates[0][2].new, false);
    assert.deepEqual(f.removedFiles, [path.resolve("test-workspace", "uploads", "profile-pictures", filename)]);
});

test("preview mode blocks removal before any database or file operations", async () => {
    const f = await fixture();
    await f.invoke({ isPreview: true });
    assert.equal(f.res.code, 403);
    assert.equal(f.updates.length, 0);
    assert.equal(f.removedFiles.length, 0);
});

test("removing an already empty photo is safe", async () => {
    const f = await fixture();
    await f.invoke();
    assert.equal(f.res.code, 200);
    assert.equal(f.res.body.user.dp_img, "");
    assert.equal(f.removedFiles.length, 0);
});

test("database errors and missing accounts do not delete stored photos", async () => {
    for (const [options, expected] of [[{ missing: true }, 404], [{ updateError: true }, 500]]) {
        const f = await fixture({ ...options, photo: `/uploads/profile-pictures/${filename}` });
        await f.invoke();
        assert.equal(f.res.code, expected);
        assert.equal(f.removedFiles.length, 0);
    }
});

test("cleanup failure does not undo a successfully removed account photo", async () => {
    const f = await fixture({ photo: `/uploads/profile-pictures/${filename}`, cleanupError: true });
    await f.invoke();
    assert.equal(f.res.code, 200);
    assert.equal(f.res.body.user.dp_img, "");
});

test("only this account's managed Cloudinary image is cleaned up", async () => {
    const f = await fixture({ photo: `https://res.cloudinary.com/test-cloud/image/upload/v123/profile-pictures/${filename}` });
    await f.invoke();
    assert.equal(f.res.code, 200);
    assert.equal(f.removedCloudFiles[0][0], `profile-pictures/${filename.slice(0, -5)}`);
    assert.equal(f.removedCloudFiles[0][1].invalidate, true);
});

test("unmanaged paths, other accounts' images, and other Cloudinary accounts are never deleted", async () => {
    for (const photo of [
        "/uploads/profile-pictures/../../important.webp",
        "/uploads/profile-pictures/dp_another-user_123.webp",
        `https://res.cloudinary.com/other-cloud/image/upload/v123/profile-pictures/${filename}`,
        `https://example.com/profile-pictures/${filename}`,
    ]) {
        const f = await fixture({ photo });
        await f.invoke();
        assert.equal(f.res.code, 200);
        assert.equal(f.removedFiles.length, 0);
        assert.equal(f.removedCloudFiles.length, 0);
    }
});
