import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_MEDIA_UPLOAD_LIMITS, normalizeMediaUploadLimits, resolveMediaUploadLimits, campaignMediaLimitBytes } from "./mediaUploadLimits.js";

test("images, video and PDF default to 3 MB, including legacy accounts without overrides", () => {
    assert.deepEqual(resolveMediaUploadLimits(), { imageMB: 3, videoMB: 3, pdfMB: 3 });
    assert.deepEqual(resolveMediaUploadLimits({ imageMB: null }), DEFAULT_MEDIA_UPLOAD_LIMITS);
});

test("each override is independent and clearing one follows changed platform defaults", () => {
    const overrides = normalizeMediaUploadLimits({ imageMB: "2.5", videoMB: "", pdfMB: null }, { overrides: true });
    assert.deepEqual(resolveMediaUploadLimits(overrides, { imageMB: 8, videoMB: 6, pdfMB: 4 }), { imageMB: 2.5, videoMB: 6, pdfMB: 4 });
    assert.deepEqual(normalizeMediaUploadLimits({ imageMB: "1.1", videoMB: 100, pdfMB: 3 }), { imageMB: 1.1, videoMB: 100, pdfMB: 3 });
});

test("invalid or malformed limits cannot silently disable enforcement", () => {
    for (const value of [null, [], "3", { extra: 3 }, {}, { imageMB: 0, videoMB: 3, pdfMB: 3 }, { imageMB: true, videoMB: 3, pdfMB: 3 }]) {
        assert.throws(() => normalizeMediaUploadLimits(value));
    }
    for (const value of ["", -1, 0, 101, Infinity, NaN, "unlimited", 1.001, [], {}]) {
        assert.throws(() => normalizeMediaUploadLimits({ imageMB: value, videoMB: 3, pdfMB: 3 }));
    }
});

test("all campaign multipart aliases use the corresponding size limit", () => {
    const limits = { imageMB: 2, videoMB: 4, pdfMB: 6 };
    for (const [field, mb] of Object.entries({ images: 2, image: 2, video: 4, documents: 6, document: 6, pdf: 6 })) {
        assert.equal(campaignMediaLimitBytes(field, limits), mb * 1024 * 1024);
    }
    assert.equal(campaignMediaLimitBytes("audio", limits), null);
});
