import test from "node:test";
import assert from "node:assert/strict";
import { Writable } from "node:stream";
import sharp from "sharp";
import { uploadCampaignMedia } from "./campaign-upload.js";

function fakeCloudinary({ error, bytes = 123 } = {}) {
    const calls = [];
    return { calls, uploader: { upload_stream(options, callback) {
        const chunks = [];
        return new Writable({
            write(chunk, encoding, done) { chunks.push(chunk); done(); },
            final(done) {
                calls.push({ options, buffer: Buffer.concat(chunks) });
                callback(error, error ? undefined : { secure_url: "https://example.test/asset", public_id: "test-asset", bytes });
                done();
            },
        });
    } } };
}

test("every supported image is Sharp-encoded as WebP before the Cloudinary stream opens", async () => {
    for (const format of ["png", "jpeg", "webp"]) {
        const buffer = await sharp({ create: { width: 64, height: 32, channels: 3, background: "red" } }).toFormat(format).toBuffer();
        const client = fakeCloudinary();
        const result = await uploadCampaignMedia({ buffer, originalname: `source.${format}`, mimetype: `image/${format}` }, "images", client);
        const uploaded = client.calls[0];
        assert.equal((await sharp(uploaded.buffer).metadata()).format, "webp");
        assert.equal(uploaded.options.resource_type, "image");
        assert.equal(uploaded.options.format, "webp");
        assert.equal(result.mimetype, "image/webp");
        assert.equal(result.size, 123);
    }
});

test("portrait and landscape images stay within 1920 pixels without being enlarged", async () => {
    for (const [width, height] of [[2000, 4000], [4000, 2000], [64, 32]]) {
        const buffer = await sharp({ create: { width, height, channels: 3, background: "blue" } }).png().toBuffer();
        const client = fakeCloudinary();
        await uploadCampaignMedia({ buffer, originalname: "image.png" }, "images", client);
        const output = await sharp(client.calls[0].buffer).metadata();
        assert(output.width <= 1920 && output.height <= 1920);
        assert(output.width <= width && output.height <= height);
        assert.equal(output.width / output.height, width / height);
    }
});

test("videos request incoming automatic-quality MP4 compression and record the resulting file size", async () => {
    const buffer = Buffer.from("test video");
    const client = fakeCloudinary({ bytes: 50 });
    const trackers = [];
    const result = await uploadCampaignMedia({ buffer, originalname: "clip.mov", mimetype: "video/quicktime" }, "video", client, tracker => trackers.push(tracker));
    const { options } = client.calls[0];
    assert.equal(options.resource_type, "video");
    assert.equal(options.format, "mp4");
    assert.equal(options.transformation[0].quality, "auto");
    assert.equal(options.transformation[0].video_codec, "h264");
    assert.equal(options.transformation[0].audio_codec, "aac");
    assert.equal(options.eager, undefined);
    assert.equal(result.filename, "clip.mp4");
    assert.equal(result.mimetype, "video/mp4");
    assert.equal(result.size, 50);
    assert.equal(trackers[0].resourceType, "video");
});

test("PDF pages, text and original bytes are preserved as a raw document", async () => {
    const buffer = Buffer.from("%PDF-1.7\noriginal document bytes");
    const client = fakeCloudinary();
    await uploadCampaignMedia({ buffer, originalname: "report.pdf", mimetype: "application/pdf" }, "documents", client);
    const uploaded = client.calls[0];
    assert.deepEqual(uploaded.buffer, buffer);
    assert.equal(uploaded.options.resource_type, "raw");
    assert.match(uploaded.options.public_id, /\.pdf$/);
    assert.equal(uploaded.options.transformation, undefined);
});

test("image processing failures and Cloudinary errors reject the upload", async () => {
    const client = fakeCloudinary();
    await assert.rejects(uploadCampaignMedia({ buffer: Buffer.from("invalid image"), originalname: "image.png" }, "images", client));
    assert.equal(client.calls.length, 0);
    await assert.rejects(uploadCampaignMedia({ buffer: Buffer.from("video"), originalname: "video.mp4" }, "video", fakeCloudinary({ error: new Error("Cloudinary unavailable") })), /Cloudinary unavailable/);
});
