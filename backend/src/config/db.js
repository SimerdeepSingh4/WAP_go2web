import mongoose from "mongoose";
import config from "./config.js";
import { ensureTransactionRefundIndex } from "./transaction-indexes.js";
import CreditOperation from "../models/credit-operation.model.js";
import { AuditEvent, AuditHead } from "../models/audit.model.js";
import Workflow from "../models/campaign-workflow.model.js";
import { auditSigningKey } from "../services/audit.service.js";

async function connectToDB(){
    auditSigningKey();
    await mongoose.connect(config.MONGO_URI);
    await ensureTransactionRefundIndex(mongoose.connection.collection("transactions"));
    await CreditOperation.createIndexes();
    await AuditEvent.createIndexes();
    await AuditHead.createIndexes();
    await Workflow.createIndexes();
    console.log("Connected to MongoDB")
}

export default connectToDB;
