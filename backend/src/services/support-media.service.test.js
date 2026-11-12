import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import { processAndSaveSupportMedia, SUPPORT_STORAGE_DIR } from "./support-media.service.js";
import { sanitizeAttachment } from "../helpers/support-identity.helper.js";
import SupportAttachment from "../models/supportAttachment.model.js";

async function savedFile(buffer, filename, check) {
  const attachment = await processAndSaveSupportMedia(buffer, filename);
  try {
    assert.deepEqual(await fs.readFile(path.join(SUPPORT_STORAGE_DIR, attachment.storageReference)), buffer);
    await check(attachment);
  } finally { await fs.unlink(path.join(SUPPORT_STORAGE_DIR, attachment.storageReference)); }
}

test("PDF receipts are stored as private documents with their detected type", async () => {
  await savedFile(Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF"), "receipt.pdf", attachment => {
    assert.equal(attachment.mediaType, "document");
    assert.equal(attachment.mimeType, "application/pdf");
    assert.match(attachment.storageReference, /^[a-f0-9-]+\.pdf$/);
  });
});

test("UTF-8 CSV and text documents preserve their content", async () => {
  for (const [filename, mime, contents] of [["report.CSV", "text/csv", "\uFEFFcampaign,status\r\nCAMP-123,delivered\r\n"], ["notes.txt", "text/plain", "Transaction TXN-123\nPayment received ₹500"]]) {
    await savedFile(Buffer.from(contents), filename, attachment => {
      assert.equal(attachment.mediaType, "document");
      assert.equal(attachment.mimeType, mime);
    });
  }
});

test("XLSX workbooks are recognized from their contents", async () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Campaign ID", "Status"], ["CAMP-123", "Delivered"]]), "Report");
  await savedFile(XLSX.write(book, { type: "buffer", bookType: "xlsx" }), "campaign-report.xlsx", attachment => {
    assert.equal(attachment.mediaType, "document");
    assert.equal(attachment.mimeType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });
});

test("renaming binary data or malformed UTF-8 to a text document is rejected", async () => {
  await assert.rejects(processAndSaveSupportMedia(Buffer.from("binary\0payload"), "report.csv"), /plain text/);
  await assert.rejects(processAndSaveSupportMedia(Buffer.from([0xff, 0xfe, 0xfa, 0xfb, 0xfc, 0xfd, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), "notes.txt"), /UTF-8/);
  await assert.rejects(processAndSaveSupportMedia(Buffer.from("ordinary plain text"), "pretend.pdf"), /Unable to determine/);
});

test("empty files, oversized documents, and oversized images remain rejected", async () => {
  await assert.rejects(processAndSaveSupportMedia(Buffer.alloc(0), "empty.txt"), /empty/);
  await assert.rejects(processAndSaveSupportMedia(Buffer.alloc(10 * 1024 * 1024 + 1), "large.pdf"), /10 MB/);
  const png = Buffer.alloc(5 * 1024 * 1024 + 1);
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(png);
  await assert.rejects(processAndSaveSupportMedia(png, "large.png"), /5MB/);
});

test("document metadata supports the schema and masks specialist filenames", async () => {
  const value = sanitizeAttachment({ _id: "receipt", uploaderRole: "Super Admin", uploader: "private-id", originalName: "private-staff-name.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", mediaType: "document", storageReference: "private.xlsx" }, "User");
  assert.equal(value.originalName, "document-attachment.xlsx");
  assert.equal(value.storageReference, undefined);
  assert.equal(value.uploader, undefined);
  assert(SupportAttachment.schema.path("mediaType").enumValues.includes("document"));
});
