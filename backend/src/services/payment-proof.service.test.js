import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);
const PDF_MIN = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");

test("payment-proof.service uploads privately to Cloudinary and streams back cleanly", async (t) => {
  const prevStorage = process.env.PAYMENT_PROOF_STORAGE_DIR;
  delete process.env.PAYMENT_PROOF_STORAGE_DIR;
  const savedEnv = {
    USE_CLOUDINARY: process.env.USE_CLOUDINARY,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  };
  Object.assign(process.env, {
    USE_CLOUDINARY: "true",
    CLOUDINARY_CLOUD_NAME: "test-cloud",
    CLOUDINARY_API_KEY: "test-key",
    CLOUDINARY_API_SECRET: "test-secret",
    DOTENV_CONFIG_QUIET: "true",
  });

  const { default: cloudinary } = await import("../config/cloudinary.config.js");
  const { savePaymentProofFile, loadPaymentProof, removePaymentProofFile } = await import("./payment-proof.service.js");

  t.after(() => {
    if (prevStorage === undefined) delete process.env.PAYMENT_PROOF_STORAGE_DIR;
    else process.env.PAYMENT_PROOF_STORAGE_DIR = prevStorage;
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  const uploadedPayloads = [];
  t.mock.method(cloudinary.uploader, "upload_stream", (options, callback) => ({
    on() {},
    end(buf) {
      uploadedPayloads.push({ options, buf });
      callback(null, { public_id: `payment_proofs_private/${options.public_id}` });
    },
  }));
  t.mock.method(cloudinary.utils, "private_download_url", (publicId, format, opts) => {
    return `https://mock.cloudinary.local/${opts.resource_type}/${opts.type}/${publicId}${format ? "." + format : ""}`;
  });
  const destroyed = [];
  t.mock.method(cloudinary.uploader, "destroy", async (publicId, opts) => {
    destroyed.push({ publicId, opts });
    return { result: "ok" };
  });

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes(".png")) return new Response(PNG_1X1, { status: 200 });
    if (url.includes(".pdf")) return new Response(PDF_MIN, { status: 200 });
    return new Response(null, { status: 404 });
  };
  t.after(() => {
    global.fetch = originalFetch;
  });

  const savedPng = await savePaymentProofFile(PNG_1X1);
  assert.match(savedPng.key, /^cld:image:png:payment_proofs_private\/proof_/);
  assert.equal(uploadedPayloads[0].options.type, "private");
  assert.equal(uploadedPayloads[0].options.resource_type, "image");

  const loadedPng = await loadPaymentProof(savedPng.key);
  assert.equal(loadedPng.mime, "image/png");
  assert.equal(loadedPng.ext, "png");
  assert.deepEqual(loadedPng.buffer, PNG_1X1);

  const savedPdf = await savePaymentProofFile(PDF_MIN);
  assert.match(savedPdf.key, /^cld:raw:pdf:payment_proofs_private\/proof_.*\.pdf$/);
  const loadedPdf = await loadPaymentProof(savedPdf.key);
  assert.equal(loadedPdf.mime, "application/pdf");
  assert.deepEqual(loadedPdf.buffer, PDF_MIN);

  await removePaymentProofFile(savedPng.key);
  await removePaymentProofFile(savedPdf.key);
  assert.equal(destroyed.length, 2);
  assert.equal(destroyed[0].opts.type, "private");
  assert.equal(destroyed[1].opts.resource_type, "raw");
});

test("payment-proof.service local disk mode works when PAYMENT_PROOF_STORAGE_DIR is set", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "proof-local-test-"));
  const prevStorage = process.env.PAYMENT_PROOF_STORAGE_DIR;
  process.env.PAYMENT_PROOF_STORAGE_DIR = dir;
  // Re-import via cache-busting query string so PAYMENT_PROOF_STORAGE_DIR reflects the temp dir
  const { savePaymentProofFile, loadPaymentProof, removePaymentProofFile } = await import(`./payment-proof.service.js?dir=${Date.now()}`);

  t.after(async () => {
    if (prevStorage === undefined) delete process.env.PAYMENT_PROOF_STORAGE_DIR;
    else process.env.PAYMENT_PROOF_STORAGE_DIR = prevStorage;
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  });

  const saved = await savePaymentProofFile(PNG_1X1);
  assert.match(saved.key, /^proof_.*\.png$/);
  const loaded = await loadPaymentProof(saved.key);
  assert.equal(loaded.mime, "image/png");
  assert.deepEqual(await readFile(loaded.filePath), PNG_1X1);

  await removePaymentProofFile(saved.key);
  assert.equal(await loadPaymentProof(saved.key), null);
});
