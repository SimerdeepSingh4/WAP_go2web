import chunkModel from "../models/campaignSpreadsheet.model.js";

export async function loadSpreadsheetRows(campaignId, kind, session = null) {
    const chunks = await chunkModel.find({ campaignId, kind }).sort({ chunkIndex: 1 }).session(session).lean();
    return chunks.flatMap((chunk) => chunk.rows);
}

export async function saveSpreadsheetRows(campaignId, kind, rows, session) {
    await chunkModel.deleteMany({ campaignId, kind }, { session });
    const chunks = [];
    for (let offset = 0; offset < rows.length; offset += 1000) chunks.push({
        campaignId, kind, chunkIndex: offset / 1000, rows: rows.slice(offset, offset + 1000),
    });
    if (chunks.length) await chunkModel.insertMany(chunks, { session });
}
