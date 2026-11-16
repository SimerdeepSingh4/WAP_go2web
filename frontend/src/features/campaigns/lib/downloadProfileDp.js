import api from "@/api/client";

export async function downloadProfileDp(campaignId) {
  const response = await api.get(`/campaigns/${campaignId}/profile-dp`, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = url;
  const mime = response.data.type || "image/jpeg";
  const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  anchor.download = `profile-dp.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
