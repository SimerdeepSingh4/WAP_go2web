import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import sharp from "sharp";
import { uploadFiles } from "./src/middlewares/upload.middleware.js";
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
