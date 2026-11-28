import mongoose from "mongoose";
import config from "./config.js";
import { ensureTransactionRefundIndex } from "./transaction-indexes.js";
import CreditOperation from "../models/credit-operation.model.js";
import Transaction from "../models/transaction.model.js";
import CreditPurchase from "../models/credit-purchase.model.js";
import CreditPurchaseRate from "../models/credit-purchase-rate.model.js";
import NumberFilterRequest, { NumberFilterRowChunk } from "../models/number-filter-request.model.js";
import { AuditEvent, AuditHead } from "../models/audit.model.js";
import { auditSigningKey } from "../services/audit.service.js";
import { CreditCase, CreditRecovery, CreditCaseEvent, CreditRepairPlan, CreditRepair, CreditAuditJob, CreditAuditState, CreditBalanceResult } from "../models/credit-reconciliation.model.js";

async function connectToDB(){
    auditSigningKey();
    await mongoose.connect(config.MONGO_URI);
    const usersCollection = mongoose.connection.collection("users");
    try {
        const userIndexes = await usersCollection.indexes();
        for (const indexName of ["email_1", "phone_1"]) {
            const existing = userIndexes.find((idx) => idx.name === indexName && idx.unique);
            if (existing) await usersCollection.dropIndex(indexName);
        }
        await usersCollection.createIndex({ email: 1 });
    } catch (error) {
        if (error?.codeName !== "NamespaceNotFound" && error?.codeName !== "IndexNotFound") {
            console.warn("Could not update users indexes:", error.message);
        }
    }
    await ensureTransactionRefundIndex(mongoose.connection.collection("transactions"));
    await CreditOperation.createIndexes();
    await Promise.all([Transaction, CreditPurchase, CreditPurchaseRate, NumberFilterRequest, NumberFilterRowChunk].map(model => model.createIndexes()));
    await AuditEvent.createIndexes();
    await AuditHead.createIndexes();
    await Promise.all([CreditCase, CreditRecovery, CreditCaseEvent, CreditRepairPlan, CreditRepair, CreditAuditJob, CreditAuditState, CreditBalanceResult].map(model => model.createIndexes()));
    console.log("Connected to MongoDB")
}

export default connectToDB;
