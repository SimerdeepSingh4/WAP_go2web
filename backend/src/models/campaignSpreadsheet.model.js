import mongoose from "mongoose";

// Keep large reports in bounded documents instead of duplicating 50,000 rows
// inside the campaign document (MongoDB has a 16 MB document limit).
const chunkSchema = new mongoose.Schema({
    campaignId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Campaign" },
    kind: { type: String, enum: ["draft", "published", "provider"], required: true },
    chunkIndex: { type: Number, required: true },
    rows: { type: [mongoose.Schema.Types.Mixed], default: [] },
});
chunkSchema.index({ campaignId: 1, kind: 1, chunkIndex: 1 }, { unique: true });
export default mongoose.models.CampaignSpreadsheetChunk || mongoose.model("CampaignSpreadsheetChunk", chunkSchema);
