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
    await ensureTransactionRefundIndex(mongoose.connection.collection("transactions"));
    await CreditOperation.createIndexes();
    await Promise.all([Transaction, CreditPurchase, CreditPurchaseRate, NumberFilterRequest, NumberFilterRowChunk].map(model => model.createIndexes()));
    await AuditEvent.createIndexes();
    await AuditHead.createIndexes();
    await Promise.all([CreditCase, CreditRecovery, CreditCaseEvent, CreditRepairPlan, CreditRepair, CreditAuditJob, CreditAuditState, CreditBalanceResult].map(model => model.createIndexes()));
    console.log("Connected to MongoDB")
}

export default connectToDB;
