import path from "node:path";
import { fileTypeFromBuffer } from "file-type";

const formats = {
    images: { jpg: ["jpg", "jpeg"], png: ["png"], webp: ["webp"] },
    video: { mp4: ["mp4"], mov: ["mov"], webm: ["webm"] },
    audio: { mp3: ["mp3"], wav: ["wav"], m4a: ["m4a", "mp4"], aac: ["aac"], ogg: ["ogg"], oga: ["ogg", "oga"], opus: ["opus", "ogg"], webm: ["webm"] },
    documents: { pdf: ["pdf"] },
};
const aliases = { image: "images", document: "documents", pdf: "documents" };

export function campaignMediaCategory(field) {
    return aliases[field] || field;
}

export function checkCampaignMediaName(file) {
    const category = campaignMediaCategory(file.fieldname);
    const allowed = formats[category];
    const name = file.originalname || "";
    const extension = path.extname(name).slice(1).toLowerCase();
    if (!allowed || /[\x00-\x1f\x7f:]/.test(name) || !Object.values(allowed).some((extensions) => extensions.includes(extension))) {
        throw new Error(`Unsupported ${category} file. Use JPG, PNG or WebP images, MP4, MOV or WebM video, supported audio, and PDF documents only.`);
    }
    return { category, extension };
}

export async function validateCampaignMedia(file) {
    const { category, extension } = checkCampaignMediaName(file);
    let detected;
    try { detected = await fileTypeFromBuffer(file.buffer); }
    catch { /* Malformed or truncated files are rejected below. */ }
    if (!detected || !formats[category][detected.ext]?.includes(extension)) {
        throw new Error(`The ${category} file contents do not match an allowed file format.`);
    }
    // Require an actual PDF header, not a later signature inside an HTML file.
    if (category === "documents" && file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("Document contents must be a PDF.");
    }
    file.detectedType = detected;
}
