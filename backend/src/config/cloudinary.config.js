import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export function isCloudinaryConfigured() {
  const credentials = [
    process.env.CLOUDINARY_CLOUD_NAME,
    process.env.CLOUDINARY_API_KEY,
    process.env.CLOUDINARY_API_SECRET,
  ].map((value) => String(value || "").trim());
  const hasPlaceholder = credentials.some((value) =>
    !value || /^(?:your[_-].*|change[_-]?me.*|placeholder.*|replace[_-]?me.*|<.*>)$/i.test(value)
  );
  return !hasPlaceholder;
}

export default cloudinary;
