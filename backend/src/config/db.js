import mongoose from "mongoose";
import config from "./config.js";
import { ensureTransactionRefundIndex } from "./transaction-indexes.js";
import CreditOperation from "../models/credit-operation.model.js";

async function connectToDB(){
    await mongoose.connect(config.MONGO_URI);
    await ensureTransactionRefundIndex(mongoose.connection.collection("transactions"));
    await CreditOperation.createIndexes();
    console.log("Connected to MongoDB")
}

export default connectToDB;
