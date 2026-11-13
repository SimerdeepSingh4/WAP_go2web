import crypto from "node:crypto";
import path from "node:path";
import sharp from "sharp";

export async function prepareCampaignUpload(file, field) {
    if (field === "images") {
        const buffer = await sharp(file.buffer)
            .rotate()
            .resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 80, effort: 4 })
            .toBuffer();
        return { buffer, ext: "webp", mimetype: "image/webp", size: buffer.length, filename: file.originalname };
    }
    return {
        buffer: file.buffer,
        ext: file.detectedType?.ext || path.extname(file.originalname || "").slice(1),
        mimetype: file.mimetype,
        size: file.buffer.length,
        filename: file.originalname,
    };
}

export function campaignUploadOptions(field, publicId) {
    return {
        folder: `campaigns/${field}`,
        resource_type: field === "documents" ? "raw" : field === "images" ? "image" : "video",
        type: "upload",
        public_id: publicId,
        use_filename: false,
        overwrite: false,
        ...(field === "images" ? { format: "webp" } : {}),
        ...(field === "video" ? {
            format: "mp4",
            // Incoming transformation: Cloudinary stores the optimized video.
            transformation: [{ width: 1920, height: 1920, crop: "limit", quality: "auto", video_codec: "h264", audio_codec: "aac" }],
        } : {}),
    };
}

export async function uploadCampaignMedia(file, field, cloudinary, onUploaded) {
    // Sharp finishes before any image bytes are sent to Cloudinary.
    const prepared = await prepareCampaignUpload(file, field);
    const publicId = `${crypto.randomUUID()}${field === "documents" ? `.${prepared.ext || "pdf"}` : ""}`;
    const options = campaignUploadOptions(field, publicId);
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            if (!result?.secure_url) return reject(new Error("Cloudinary did not return an uploaded asset URL."));
            onUploaded?.({ url: result.secure_url, publicId: result.public_id || publicId, resourceType: options.resource_type });
            resolve({
                url: result.secure_url,
                filename: field === "video" ? `${path.parse(prepared.filename).name}.mp4` : prepared.filename,
                mimetype: field === "video" ? "video/mp4" : prepared.mimetype,
                size: result.bytes ?? prepared.size,
            });
        });
        stream.on("error", reject);
        stream.end(prepared.buffer);
    });
}
