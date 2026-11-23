import User from "../models/user.model.js";
import { rechargeNumberPattern, rechargeRecipient, rechargeSenderConfigured } from "../services/recharge-whatsapp.service.js";

export async function getRechargeAlertSettings(req, res) {
    const account = await User.findById(req.user._id).select("+rechargeWhatsAppNumber").lean();
    if (!account) return res.status(404).json({ message: "Account not found." });
    return res.json({ number: rechargeRecipient(account, req.user._id), senderConfigured: rechargeSenderConfigured() });
}

export async function updateRechargeAlertSettings(req, res) {
    const number = req.body?.number;
    if (typeof number !== "string" || (number !== "" && !rechargeNumberPattern.test(number))) {
        return res.status(400).json({ message: "Enter a WhatsApp number with + and the country code." });
    }
    const result = await User.updateOne({ _id: req.user._id }, { $set: { rechargeWhatsAppNumber: number } });
    if (!result.matchedCount) return res.status(404).json({ message: "Account not found." });
    return res.json({ number, senderConfigured: rechargeSenderConfigured() });
}
