import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";
import { apiNotFoundHandler, errorHandler } from "./error-handler.middleware.js";
import { uploadDocument, uploadProfileImage } from "./upload.middleware.js";

async function withServer(setup, run) {
    const app = express();
    setup(app);
    app.use("/api", apiNotFoundHandler);
    app.use(errorHandler);
    const server = createServer(app);
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address();
    try {
        return await run(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

test("returns structured JSON for malformed JSON, oversized payloads, and missing API routes", async () => {
    await withServer(
        app => {
            app.use(express.json({ limit: "64b" }));
            app.post("/api/echo", (req, res) => res.json(req.body));
        },
        async baseUrl => {
            const badJson = await fetch(`${baseUrl}/api/echo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{invalid",
            });
            assert.equal(badJson.status, 400);
            assert.deepEqual(await badJson.json(), {
                success: false,
                message: "Invalid JSON request body.",
                code: "INVALID_JSON",
            });

            const tooBig = await fetch(`${baseUrl}/api/echo`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ data: "x".repeat(200) }),
            });
            assert.equal(tooBig.status, 413);
            assert.deepEqual(await tooBig.json(), {
                success: false,
                message: "Request payload is too large.",
                code: "PAYLOAD_TOO_LARGE",
            });

            const notFound = await fetch(`${baseUrl}/api/does-not-exist`);
            assert.equal(notFound.status, 404);
            assert.deepEqual(await notFound.json(), {
                success: false,
                message: "API route not found.",
            });
        }
    );
});

test("returns JSON errors for invalid or oversized Multer uploads and hides internal 500 error details", async () => {
    await withServer(
        app => {
            app.post("/api/docs", uploadDocument.single("file"), (_req, res) => res.json({ ok: true }));
            app.post("/api/dp", uploadProfileImage, (_req, res) => res.json({ ok: true }));
            app.get("/api/boom", () => {
                throw new Error("mongodb://internal-secret-connection");
            });
        },
        async baseUrl => {
            const badDoc = new FormData();
            badDoc.append("file", new Blob(["hello"], { type: "text/plain" }), "notes.txt");
            const docRes = await fetch(`${baseUrl}/api/docs`, { method: "POST", body: badDoc });
            assert.equal(docRes.status, 400);
            const docBody = await docRes.json();
            assert.equal(docBody.success, false);
            assert.match(docBody.message, /Unsupported file format/);

            const bigDp = new FormData();
            bigDp.append("dp_img", new Blob([new Uint8Array(5 * 1024 * 1024 + 100)], { type: "image/png" }), "avatar.png");
            const dpRes = await fetch(`${baseUrl}/api/dp`, { method: "POST", body: bigDp });
            assert.equal(dpRes.status, 413);
            const dpBody = await dpRes.json();
            assert.equal(dpBody.success, false);
            assert.equal(dpBody.code, "LIMIT_FILE_SIZE");

            const boomRes = await fetch(`${baseUrl}/api/boom`);
            assert.equal(boomRes.status, 500);
            assert.deepEqual(await boomRes.json(), {
                success: false,
                message: "Internal server error.",
            });
        }
    );
});
