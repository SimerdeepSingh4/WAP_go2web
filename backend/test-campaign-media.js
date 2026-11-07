import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import sharp from "sharp";
import { uploadFiles } from "./src/middlewares/upload.middleware.js";

let server, origin, png;
let accepted = 0;
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");

before(async () => {
    png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    const app = express();
    app.post("/upload", uploadFiles, (req, res) => {
        accepted++;
        res.json({ types: Object.values(req.files || {}).flat().map((file) => file.detectedType.ext) });
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
    });
    origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function upload(files) {
    const body = new FormData();
    for (const [field, name, content] of files) body.append(field, new Blob([content]), name);
    return fetch(`${origin}/upload`, { method: "POST", body });
}

test("campaign uploads accept real images and PDFs through all field aliases", async () => {
    for (const field of ["image", "images"]) {
        const response = await upload([[field, "photo.PNG", png]]);
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).types, ["png"]);
    }
    for (const field of ["pdf", "document", "documents"]) {
        const response = await upload([[field, "offer.pdf", pdf]]);
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()).types, ["pdf"]);
    }
});

test("campaign uploads reject unsupported names, spoofed content and empty files", async () => {
    for (const file of [
        ["documents", "offer.html", pdf],
        ["documents", "offer.pdf", "<html>Not a PDF</html>"],
        ["images", "photo.webp", png],
        ["documents", "offer.pdf", png],
        ["documents", "empty.pdf", ""],
    ]) {
        const response = await upload([file]);
        assert.equal(response.status, 400, file[1]);
        assert.equal((await response.json()).success, false);
    }
});

test("one invalid file prevents the entire batch reaching the controller", async () => {
    const previous = accepted;
    const response = await upload([
        ["images", "photo.png", png],
        ["pdf", "offer.pdf", "<html>Not a PDF</html>"],
    ]);
    assert.equal(response.status, 400);
    assert.equal(accepted, previous);
});
