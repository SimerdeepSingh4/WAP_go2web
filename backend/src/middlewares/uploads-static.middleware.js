import express from "express";
import path from "node:path";

const inlineTypes = {
    ".webp": "image/webp",
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".aac": "audio/aac", ".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg",
};
const generatedName = /^(?:dp_[a-f\d]{24}_)?[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}\.[a-z\d]+$/i;

export function uploadsStatic(directory) {
    return express.static(directory, {
        index: false,
        dotfiles: "deny",
        setHeaders(res, filePath) {
            const extension = path.extname(filePath).toLowerCase();
            const inlineType = generatedName.test(path.basename(filePath)) && inlineTypes[extension];
            res.setHeader("X-Content-Type-Options", "nosniff");
            if (inlineType) {
                res.setHeader("Content-Type", inlineType);
                res.setHeader("Content-Disposition", "inline");
            } else {
                // Covers PDF documents AND old uploads, including previously saved HTML.
                res.setHeader("Content-Type", extension === ".pdf" ? "application/pdf" : "application/octet-stream");
                res.setHeader("Content-Disposition", "attachment");
                res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
            }
        },
    });
}
