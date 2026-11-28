import userModel from "../models/user.model.js";
import walletModel from "../models/wallet.model.js";
import CreditPurchaseRate from "../models/credit-purchase-rate.model.js";
import { runCreditTransaction } from "./credit-operation.js";

/**
 * Creates a user account and its initial zero-balance wallet atomically inside a Mongo transaction.
 */
export async function createUserWithWallet(userData, { resellerId = null, purchaseRates = [], createdBy = null } = {}) {
    return runCreditTransaction(async (session) => {
        const [createdUser] = await userModel.create([userData], { session });
        await walletModel.create(
            [
                {
                    userId: createdUser._id,
                    balance: 0,
                    resellerId,
                },
            ],
            { session }
        );
        if (purchaseRates.length) {
            const sellerId = resellerId || createdBy;
            await CreditPurchaseRate.create(
                purchaseRates.map(({ category, unitPriceInr }) => ({
                    sellerId,
                    buyerId: createdUser._id,
                    category,
                    version: 1,
                    unitPriceInr,
                    createdBy: createdBy || sellerId,
                })),
                { session, ordered: true }
            );
        }
        return createdUser;
    });
}
