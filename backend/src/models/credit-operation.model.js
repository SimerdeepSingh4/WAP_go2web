import mongoose from "mongoose";

// Receipts are committed in the same MongoDB transaction as wallet and ledger
// changes. Keep them indefinitely so an old request cannot be paid twice.
const schema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    fingerprint: { type: String, required: true },
    status: { type: Number, required: true },
    response: { type: mongoose.Schema.Types.Mixed, required: true },
}, { timestamps: true });
export default mongoose.models.CreditOperation || mongoose.model("CreditOperation", schema);
