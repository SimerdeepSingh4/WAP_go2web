import userModel from "../models/user.model.js";
import walletModel from "../models/wallet.model.js";
import { runCreditTransaction } from "./credit-operation.js";

/**
 * Creates a user account and its initial zero-balance wallet atomically inside a Mongo transaction.
 */
export async function createUserWithWallet(userData, { resellerId = null } = {}) {
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
        return createdUser;
    });
}
