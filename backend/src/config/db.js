import mongoose from "mongoose";
import config from "./config.js";
import { ensureTransactionRefundIndex } from "./transaction-indexes.js";

async function connectToDB(){
    await mongoose.connect(config.MONGO_URI);
    await ensureTransactionRefundIndex(mongoose.connection.collection("transactions"));
    console.log("Connected to MongoDB")
}

export default connectToDB;
