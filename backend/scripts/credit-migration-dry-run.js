import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import User from "../src/models/user.model.js";
import Wallet from "../src/models/wallet.model.js";
import Transaction from "../src/models/transaction.model.js";
import Campaign from "../src/models/campaign.model.js";
import CreditPurchaseRate from "../src/models/credit-purchase-rate.model.js";
import CreditPurchase from "../src/models/credit-purchase.model.js";
import { CreditAuditJob, CreditCase } from "../src/models/credit-reconciliation.model.js";
import { categoryBalances, CREDIT_CATEGORIES, LEGACY_CREDITS, validCategoryBalance } from "../src/helpers/credit-categories.js";
import { inspectCreditAccount } from "../src/services/credit-evidence.service.js";

export async function inventoryCreditMigration() {
    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(async () => {
            const database = mongoose.connection.name;
            const accounts = { buyers: 0, wallets: 0, withLegacyBalance: 0, missingWallets: 0, missingCategoryFields: 0, invalidCategoryWallets: 0, requiringReconciliation: 0 };
            const startingBalances = Object.fromEntries(CREDIT_CATEGORIES.map(category => [category, { available: 0n, held: 0n }]));
            for await (const user of User.find({ role: { $in: ["User", "Reseller"] } }).select("_id").session(session).lean().cursor()) {
                accounts.buyers++;
                const wallet = await Wallet.findOne({ userId: user._id }).select("balance creditBalances").session(session).lean();
                if (!wallet) accounts.missingWallets++;
                const view = await inspectCreditAccount(user._id, session);
                if (view.summary.needsReview) accounts.requiringReconciliation++;
            }
            for await (const wallet of Wallet.find().select("balance creditBalances").session(session).lean().cursor()) {
                accounts.wallets++;
                if (wallet.balance) accounts.withLegacyBalance++;
                if (CREDIT_CATEGORIES.some(category => !wallet.creditBalances?.[category])) accounts.missingCategoryFields++;
                const balances = Object.entries(categoryBalances(wallet));
                if (balances.some(([, balance]) => !validCategoryBalance(balance))) accounts.invalidCategoryWallets++;
                for (const [category, balance] of balances) {
                    if (!validCategoryBalance(balance)) continue;
                    startingBalances[category].available += BigInt(balance.available);
                    startingBalances[category].held += BigInt(balance.reserved);
                }
            }
            const prices = await CreditPurchaseRate.aggregate([
                { $sort: { version: -1 } },
                { $group: { _id: { sellerId: "$sellerId", buyerId: "$buyerId", category: "$category" }, rate: { $first: "$unitPriceInr" }, version: { $first: "$version" } } },
                { $sort: { "_id.sellerId": 1, "_id.buyerId": 1, "_id.category": 1 } },
            ]).session(session);
            return {
                database, accounts,
                startingBalances: Object.fromEntries(Object.entries(startingBalances).map(([category, balances]) => [
                    category, { available: balances.available.toString(), held: balances.held.toString() },
                ])),
                legacyTransactions: await Transaction.countDocuments(LEGACY_CREDITS).session(session),
                categorizedTransactions: await Transaction.countDocuments({ category: { $in: CREDIT_CATEGORIES } }).session(session),
                legacyCampaigns: await Campaign.countDocuments(LEGACY_CREDITS).session(session),
                unsettledLegacyCampaigns: await Campaign.countDocuments({ ...LEGACY_CREDITS, status: { $in: ["draft", "scheduled", "pending", "ongoing", "paused"] } }).session(session),
                openRechargeOrders: await CreditPurchase.countDocuments({ status: { $in: ["QUOTED", "PENDING", "REVIEW_REQUIRED"] } }).session(session),
                pendingReconciliationChecks: await CreditAuditJob.countDocuments({ dirty: true }).session(session),
                openReconciliationCases: await CreditCase.countDocuments({ state: "open" }).session(session),
                activeRates: prices.map(row => ({ ...row._id, unitPriceInr: row.rate.toString(), version: row.version })),
            };
        }, { readConcern: { level: "snapshot" } });
    } finally {
        await session.endSession();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const [flag, database] = process.argv.slice(2);
    if (flag !== "--database" || !database || !process.env.MONGO_URI) {
        console.error("Set MONGO_URI and run credits:migration:dry-run -- --database <designated database>.");
        process.exitCode = 1;
    } else {
        try {
            await mongoose.connect(process.env.MONGO_URI, { dbName: database, autoCreate: false, autoIndex: false });
            console.log(JSON.stringify(await inventoryCreditMigration(), null, 2));
        } finally {
            await mongoose.disconnect();
        }
    }
}
