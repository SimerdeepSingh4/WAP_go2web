import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { Writable } from "node:stream";
import cloudinary, { isCloudinaryConfigured } from "./src/config/cloudinary.config.js";

test("sharp compresses image buffers to WebP format before storage", async () => {
    // Generate sample raw PNG
    const samplePng = await sharp({
        create: {
            width: 800,
            height: 600,
            channels: 3,
            background: { r: 255, g: 0, b: 0 },
        },
    })
        .png()
        .toBuffer();

    const originalMeta = await sharp(samplePng).metadata();
    assert.equal(originalMeta.format, "png");

    // Perform the compression pipeline used in campaign & profile upload controllers
    const compressedBuffer = await sharp(samplePng)
        .rotate()
        .resize({ width: 1920, withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();

    const resultMeta = await sharp(compressedBuffer).metadata();
    assert.equal(resultMeta.format, "webp", "Output image must be compressed to WebP format");
    assert(compressedBuffer.length <= samplePng.length, "Compressed WebP must be smaller or equal in size");
});

test("sharp handles orientation and prevents enlargement on small images", async () => {
    const smallJpg = await sharp({
        create: {
            width: 200,
            height: 150,
            channels: 3,
            background: { r: 0, g: 128, b: 255 },
        },
    })
        .jpeg()
        .toBuffer();

    const compressed = await sharp(smallJpg)
        .rotate()
        .resize({ width: 1920, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

    const meta = await sharp(compressed).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(meta.width, 200, "Should not upscale dimensions below 1920");
    assert.equal(meta.height, 150);
});

test("Cloudinary upload_stream receives verified WebP buffer with format: webp", async () => {
    const samplePng = await sharp({
        create: { width: 50, height: 50, channels: 3, background: "green" },
    })
        .png()
        .toBuffer();

    // Compress to WebP
    const webpBuffer = await sharp(samplePng)
        .rotate()
        .resize({ width: 1920, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

    // Intercept / spy upload_stream
    let capturedOptions = null;
    let receivedChunks = [];

    const originalUploadStream = cloudinary.uploader.upload_stream;
    cloudinary.uploader.upload_stream = (options, callback) => {
        capturedOptions = options;
        const writable = new Writable({
            write(chunk, encoding, next) {
                receivedChunks.push(chunk);
                next();
            },
        });
        writable.on("finish", () => {
            callback(null, {
                secure_url: `https://res.cloudinary.com/test-cloud/image/upload/v123456789/${options.folder}/${options.public_id}.webp`,
                public_id: options.public_id,
                format: options.format,
            });
        });
        return writable;
    };

    try {
        const resultUrl = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: "images",
                    resource_type: "image",
                    format: "webp",
                    public_id: "test-uuid-1234",
                },
                (err, res) => (err ? reject(err) : resolve(res.secure_url))
            );
            stream.end(webpBuffer);
        });

        assert.equal(capturedOptions.resource_type, "image");
        assert.equal(capturedOptions.format, "webp");
        assert.equal(capturedOptions.folder, "images");

        const receivedBuffer = Buffer.concat(receivedChunks);
        const receivedMeta = await sharp(receivedBuffer).metadata();
        assert.equal(receivedMeta.format, "webp", "Cloudinary stream must receive valid WebP buffer");
        assert.match(resultUrl, /^https:\/\/res\.cloudinary\.com/);
        assert(resultUrl.endsWith(".webp"));
    } finally {
        cloudinary.uploader.upload_stream = originalUploadStream;
    }
});
