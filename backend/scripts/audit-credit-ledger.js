// Read-only audit. No indexes, collections, balances, or ledger rows are changed.
import mongoose from "mongoose";
import config from "../src/config/config.js";
import User from "../src/models/user.model.js";
import Wallet from "../src/models/wallet.model.js";
import { reconcileWallet } from "../src/helpers/credit.helper.js";
import Campaign from "../src/models/campaign.model.js";
import { loadSpreadsheetRows } from "../src/helpers/spreadsheet-storage.js";

const args = process.argv.slice(2);
const username = args[args.indexOf("--username") + 1];
if (!args.includes("--username") && !args.includes("--all")) throw new Error("Use --username <name> or --all to select wallets to audit");
try {
    await mongoose.connect(config.MONGO_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    let wallets;
    if (args.includes("--username")) {
        const user = await User.findOne({ username }).select("_id username").lean();
        if (!user) throw new Error("Account not found");
        wallets = [{ userId: user._id, username: user.username }];
        if (args.includes("--campaign-title")) {
            const prefix = args[args.indexOf("--campaign-title") + 1];
            const candidates = await Campaign.find({ userId: user._id }).lean();
            const campaign = candidates.find((row) => row.campaignTitle.startsWith(prefix));
            if (!campaign) throw new Error("Campaign not found");
            const draft = await loadSpreadsheetRows(campaign._id, "draft");
            console.log(JSON.stringify({ campaignId: campaign._id, title: campaign.campaignTitle, submitted: campaign.totalRecipients, originalEntries: campaign.originalRecipients?.length, recipients: campaign.recipients?.length, duplicateCount: campaign.recipientStats?.duplicateCount, duplicateEntries: campaign.recipientStats?.duplicatesList?.length, invalidCount: campaign.recipientStats?.invalidCount, invalidEntries: campaign.recipientStats?.invalidList?.length, blankDigitInvalidEntries: campaign.recipientStats?.invalidList?.filter((entry) => !String(entry).replace(/\D/g, "")).length, savedEntries: campaign.recipientEntries?.length, draftRows: draft.length, publishedRows: campaign.publishedSpreadsheet?.summary?.total }));
        }
    } else wallets = await Wallet.find().select("userId").lean();
    for (const wallet of wallets) {
        const report = await reconcileWallet(wallet.userId);
        console.log(JSON.stringify({ username: wallet.username, ...report }));
        if (!report.isReconciled) process.exitCode = 2;
    }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
