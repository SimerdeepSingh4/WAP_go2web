import { Router, raw } from "express";
import { verifyProviderSignature, providerConfig } from "../helpers/campaign-provider.js";
import { workflowEnabled } from "../helpers/campaign-workflow-outbox.js";
import { acceptCampaignCompletion } from "../services/campaign-workflow.service.js";

const router = Router();
router.post("/completion", raw({ type: "application/json", limit: "10mb" }), async (req, res) => {
    if (!workflowEnabled()) return res.status(503).json({ message: "Campaign workflows are disabled" });
    try {
        const { webhookSecret } = providerConfig();
        if (!Buffer.isBuffer(req.body) || !verifyProviderSignature(req.body, req.get("X-Campaign-Timestamp"), req.get("X-Campaign-Signature"), webhookSecret)) return res.status(401).json({ message: "Invalid webhook signature or timestamp" });
        let input;
        try { input = JSON.parse(req.body.toString("utf8")); }
        catch { return res.status(400).json({ message: "Invalid JSON" }); }
        const result = await acceptCampaignCompletion(input);
        return res.status(202).json({ success: true, ...result });
    } catch (error) {
        console.error("Campaign webhook rejected:", error.message);
        return res.status(error.statusCode || 400).json({ success: false, message: error.statusCode ? error.message : "Completion could not be accepted; check the payload and retry." });
    }
});
export default router;
