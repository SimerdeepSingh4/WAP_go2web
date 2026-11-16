import mongoose from "mongoose";
import config from "./config.js";
import { ensureTransactionRefundIndex } from "./transaction-indexes.js";
import CreditOperation from "../models/credit-operation.model.js";
import Transaction from "../models/transaction.model.js";
import { AuditEvent, AuditHead } from "../models/audit.model.js";
import { auditSigningKey } from "../services/audit.service.js";
import { CreditCase, CreditRecovery, CreditCaseEvent, CreditRepairPlan, CreditRepair, CreditAuditJob, CreditAuditState, CreditBalanceResult } from "../models/credit-reconciliation.model.js";

async function connectToDB(){
    auditSigningKey();
    await mongoose.connect(config.MONGO_URI);
    await ensureTransactionRefundIndex(mongoose.connection.collection("transactions"));
    await CreditOperation.createIndexes();
    await Transaction.collection.createIndex({ operationKey: 1 }, { unique: true, sparse: true });
    await AuditEvent.createIndexes();
    await AuditHead.createIndexes();
    await Promise.all([CreditCase, CreditRecovery, CreditCaseEvent, CreditRepairPlan, CreditRepair, CreditAuditJob, CreditAuditState, CreditBalanceResult].map(model => model.createIndexes()));
    console.log("Connected to MongoDB")
}

export default connectToDB;
