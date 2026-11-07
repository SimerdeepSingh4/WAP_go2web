import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import http from "node:http";
import express from "express";
import sharp from "sharp";
import {
    uploadFiles,
    getActiveMediaUploads,
    MAX_CONCURRENT_UPLOADS,
    MAX_TOTAL_UPLOAD_BYTES,
} from "./src/middlewares/upload.middleware.js";
import { uploadsStatic } from "./src/middlewares/uploads-static.middleware.js";

let server, directory, origin, png;
let accepted = 0;
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
const imageName = `${randomUUID()}.webp`;
const documentName = `${randomUUID()}.pdf`;

before(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "wap-upload-security-"));
    png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    await Promise.all([
        writeFile(path.join(directory, "old-page.html"), "<html><script>window.uploadExecuted=true</script></html>"),
        writeFile(path.join(directory, documentName), pdf),
        sharp(png).webp().toFile(path.join(directory, imageName)),
    ]);
    const app = express();
    app.post("/campaigns", uploadFiles, (req, res) => {
        accepted++;
        res.json({ types: Object.values(req.files || {}).flat().map((file) => file.detectedType) });
    });
    app.use("/uploads", uploadsStatic(directory));
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
    origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (directory) {
        assert.equal(path.resolve(path.dirname(directory)), path.resolve(tmpdir()));
        assert(path.basename(directory).startsWith("wap-upload-security-"));
        await rm(directory, { recursive: true, force: true });
    }
});

async function upload(files) {
    const body = new FormData();
    for (const [field, name, type, content] of files) body.append(field, new Blob([content], { type }), name);
    return fetch(`${origin}/campaigns`, { method: "POST", body });
}

test("real PDF and image uploads work through every supported field alias", async () => {
    for (const field of ["pdf", "document", "documents"]) {
        const response = await upload([[field, "offer.PDF", "application/pdf", pdf]]);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).types[0].ext, "pdf");
    }
    for (const field of ["image", "images"]) {
        const response = await upload([[field, "photo.png", "image/png", png]]);
        assert.equal(response.status, 200);
        assert.equal((await response.json()).types[0].ext, "png");
    }
});

test("HTML, SVG, scripts and double-extension HTML are rejected", async () => {
    for (const name of ["offer.html", "offer.pdf.html", "offer.svg", "offer.js"]) {
        const response = await upload([["documents", name, "application/pdf", "<script>alert(1)</script>"]]);
        assert.equal(response.status, 400, name);
        assert.equal((await response.json()).success, false);
    }
});

test("recognized video and audio containers are accepted in their own fields", async () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom"), Buffer.alloc(4), Buffer.from("isommp42")]);
    const wav = Buffer.alloc(44);
    wav.write("RIFF"); wav.writeUInt32LE(36, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36);
    for (const file of [["video", "movie.mp4", "video/mp4", mp4], ["audio", "voice.wav", "audio/wav", wav]]) {
        const response = await upload([file]);
        assert.equal(response.status, 200, file[1]);
    }
    assert.equal((await upload([["documents", "movie.pdf", "application/pdf", mp4]])).status, 400);
});

test("renaming HTML to PDF or media and spoofing its MIME type does not bypass validation", async () => {
    for (const [field, name, mime] of [["documents", "offer.pdf", "application/pdf"], ["images", "photo.png", "image/png"], ["video", "movie.mp4", "video/mp4"]]) {
        const response = await upload([[field, name, mime, "<!doctype html><html><script>alert(1)</script></html>"]]);
        assert.equal(response.status, 400);
    }
});

test("a supported extension still needs matching file contents", async () => {
    assert.equal((await upload([["documents", "offer.pdf", "application/pdf", png]])).status, 400);
    assert.equal((await upload([["images", "photo.webp", "image/webp", png]])).status, 400);
    assert.equal((await upload([["documents", "empty.pdf", "application/pdf", ""]])).status, 400);
});

test("a bad file prevents the entire batch reaching campaign persistence", async () => {
    const previous = accepted;
    const response = await upload([["images", "photo.png", "image/png", png], ["pdf", "offer.pdf", "application/pdf", "<html>Not a PDF</html>"]]);
    assert.equal(response.status, 400);
    assert.equal(accepted, previous);
});

test("PDFs and existing HTML files are downloads with a restrictive sandbox", async () => {
    for (const name of [documentName, "old-page.html"]) {
        const response = await fetch(`${origin}/uploads/${name}`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-disposition"), "attachment");
        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        assert.match(response.headers.get("content-security-policy"), /sandbox; default-src 'none'/);
        if (name.endsWith(".html")) assert.equal(response.headers.get("content-type"), "application/octet-stream");
    }
});

test("generated image files retain inline previews and the correct content type", async () => {
    const response = await fetch(`${origin}/uploads/${imageName}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/webp");
    assert.equal(response.headers.get("content-disposition"), "inline");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});

test("unknown files cannot inherit inline privileges by using an image extension", async () => {
    await writeFile(path.join(directory, "old-image.webp"), "<html>Untrusted legacy file</html>");
    const response = await fetch(`${origin}/uploads/old-image.webp`);
    assert.equal(response.headers.get("content-type"), "application/octet-stream");
    assert.equal(response.headers.get("content-disposition"), "attachment");
});

test("chunked upload without Content-Length exceeding 35 MB is rejected with 413 LIMIT_TOTAL_UPLOAD_SIZE", async () => {
    const boundary = "----WebKitFormBoundaryTestChunked";
    const port = new URL(origin).port;

    const res = await new Promise((resolve) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: "/campaigns",
                method: "POST",
                headers: {
                    "content-type": `multipart/form-data; boundary=${boundary}`,
                    "transfer-encoding": "chunked",
                },
            },
            (res) => {
                let body = "";
                res.on("data", (c) => (body += c));
                res.on("end", () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(body) });
                    } catch {
                        resolve({ status: res.statusCode, body });
                    }
                });
            }
        );

        req.on("error", (err) => {
            resolve({ error: err });
        });

        const partHeader = `--${boundary}\r\nContent-Disposition: form-data; name="documents"; filename="large.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\n`;
        req.write(partHeader);

        const chunk = Buffer.alloc(1024 * 1024); // 1 MB chunk
        for (let i = 0; i < 36; i++) {
            if (req.destroyed) break;
            req.write(chunk);
        }
        if (!req.destroyed) {
            req.write(`\r\n--${boundary}--\r\n`);
            req.end();
        }
    });

    if (res.status) {
        assert.equal(res.status, 413);
        assert.equal(res.body.code, "LIMIT_TOTAL_UPLOAD_SIZE");
    }
    assert.equal(getActiveMediaUploads(), 0);
});

test("chunked upload under 35 MB is accepted normally", async () => {
    const boundary = "----WebKitFormBoundaryValidChunked";
    const port = new URL(origin).port;

    const res = await new Promise((resolve, reject) => {
        const req = http.request(
            {
                hostname: "127.0.0.1",
                port,
                path: "/campaigns",
                method: "POST",
                headers: {
                    "content-type": `multipart/form-data; boundary=${boundary}`,
                    "transfer-encoding": "chunked",
                },
            },
            (res) => {
                let body = "";
                res.on("data", (c) => (body += c));
                res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
            }
        );

        req.on("error", reject);

        const partHeader = `--${boundary}\r\nContent-Disposition: form-data; name="documents"; filename="valid.pdf"\r\nContent-Type: application/pdf\r\n\r\n`;
        req.write(partHeader);
        req.write(pdf);
        req.write(`\r\n--${boundary}--\r\n`);
        req.end();
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.types[0].ext, "pdf");
    assert.equal(getActiveMediaUploads(), 0);
});

test("aggregate file size exceeding 35 MB across multiple files is rejected with 413 LIMIT_TOTAL_UPLOAD_SIZE", async () => {
    // 3 PDF files of 13 MB each = 39 MB. Each file is < 16 MB limit, but sum > 35 MB.
    const file13mb = Buffer.concat([pdf, Buffer.alloc(13 * 1024 * 1024 - pdf.length)]);
    const response = await upload([
        ["documents", "doc1.pdf", "application/pdf", file13mb],
        ["documents", "doc2.pdf", "application/pdf", file13mb],
        ["documents", "doc3.pdf", "application/pdf", file13mb],
    ]);
    assert.equal(response.status, 413);
    const body = await response.json();
    assert.equal(body.code, "LIMIT_TOTAL_UPLOAD_SIZE");
    assert.equal(getActiveMediaUploads(), 0);
});

test("client-aborted upload cleans up the active concurrency slot immediately", async () => {
    const boundary = "----WebKitFormBoundaryAbortCleanup";
    const port = new URL(origin).port;

    const initialActive = getActiveMediaUploads();

    await new Promise((resolve) => {
        const req = http.request({
            hostname: "127.0.0.1",
            port,
            path: "/campaigns",
            method: "POST",
            headers: {
                "content-type": `multipart/form-data; boundary=${boundary}`,
                "transfer-encoding": "chunked",
            },
        });

        req.on("error", () => {}); // ignore client-side abort error

        req.write(`--${boundary}\r\nContent-Disposition: form-data; name="documents"; filename="abort.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);

        setTimeout(() => {
            req.destroy();
            setTimeout(() => {
                assert.equal(getActiveMediaUploads(), initialActive);
                resolve();
            }, 50);
        }, 50);
    });
});

test("concurrent upload limiter rejects requests beyond MAX_CONCURRENT_UPLOADS with 429", async () => {
    const boundary = "----WebKitFormBoundaryConcurrency";
    const port = new URL(origin).port;
    const clientRequests = [];

    // Open 5 concurrent uploads and hold them open
    for (let i = 0; i < MAX_CONCURRENT_UPLOADS; i++) {
        const req = http.request({
            hostname: "127.0.0.1",
            port,
            path: "/campaigns",
            method: "POST",
            headers: {
                "content-type": `multipart/form-data; boundary=${boundary}`,
                "transfer-encoding": "chunked",
            },
        });
        req.on("error", () => {});
        req.write(`--${boundary}\r\nContent-Disposition: form-data; name="documents"; filename="doc${i}.pdf"\r\nContent-Type: application/pdf\r\n\r\n`);
        clientRequests.push(req);
    }

    // Wait for the 5 requests to be registered
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(getActiveMediaUploads(), MAX_CONCURRENT_UPLOADS);

    // The 6th request should be immediately rejected with 429
    const overflowResponse = await upload([["documents", "overflow.pdf", "application/pdf", pdf]]);
    assert.equal(overflowResponse.status, 429);
    const body = await overflowResponse.json();
    assert.equal(body.code, "CONCURRENT_UPLOAD_LIMIT");

    // Close and destroy the 5 holding requests
    for (const req of clientRequests) {
        req.destroy();
    }

    // Wait for slot cleanups
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(getActiveMediaUploads(), 0);

    // After cleanup, a normal upload should succeed cleanly
    const normalResponse = await upload([["documents", "after-cleanup.pdf", "application/pdf", pdf]]);
    assert.equal(normalResponse.status, 200);
    assert.equal(getActiveMediaUploads(), 0);
});
