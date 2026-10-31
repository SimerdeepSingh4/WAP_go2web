// src/helpers/credit.helper.js

/**
 * Internal reusable credit helper functions.
 * These functions are intended to be used by controllers (e.g., credit.controller.js)
 * to perform atomic credit deductions and refunds.
 *
 * Each function expects a mongoose session to be passed when called from a
 * transaction context. If no session is supplied, a new session will be
 * created internally – this allows the helpers to be used both inside and
 * outside existing transactions.
 */

import mongoose from "mongoose";
import walletModel from "../models/wallet.model.js";
import userModel from "../models/user.model.js";

/**
 * Deduct credits from a user's wallet.
 * @param {string|mongoose.Types.ObjectId} userId - The target user.
 * @param {number} count - Number of messages (or units) to deduct.
 * @param {mongoose.ClientSession} [session] - Optional mongoose session.
 * @returns {Promise<{amount:number, newBalance:number}>}
 * Throws an error if the user does not exist, has no rate, or insufficient balance.
 */
export async function deductCredits(userId, count, session = null) {
  // Ensure count is a positive integer
  const msgCount = Number(count);
  if (isNaN(msgCount) || msgCount <= 0) {
    throw new Error("count must be a positive number");
  }

  // Start a session if one is not provided (so the operation is atomic)
  const ownSession = !session;
  const mongoSession = ownSession ? await mongoose.startSession() : session;
  if (ownSession) mongoSession.startTransaction();

  try {
    const targetUser = await userModel
      .findById(userId)
      .session(mongoSession);
    if (!targetUser) {
      throw new Error("User not found");
    }
    if (!targetUser.ratePerMsg || targetUser.ratePerMsg <= 0) {
      throw new Error("User does not have a valid rate per message");
    }

    const deductionAmount = targetUser.ratePerMsg * msgCount;

    const wallet = await walletModel
      .findOne({ userId })
      .session(mongoSession);
    if (!wallet || wallet.balance < deductionAmount) {
      throw new Error(
        `Insufficient credits. Required: ${deductionAmount}, Available: ${wallet ? wallet.balance : 0}`
      );
    }

    wallet.balance -= deductionAmount;
    await wallet.save({ session: mongoSession });

    if (ownSession) {
      await mongoSession.commitTransaction();
      mongoSession.endSession();
    }

    return { amount: deductionAmount, newBalance: wallet.balance };
  } catch (err) {
    if (ownSession) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
    }
    throw err;
  }
}

/**
 * Refund credits to a user's wallet.
 * @param {string|mongoose.Types.ObjectId} userId - The target user.
 * @param {number} count - Number of messages (or units) to refund.
 * @param {mongoose.ClientSession} [session] - Optional mongoose session.
 * @returns {Promise<{amount:number, newBalance:number}>}
 */
export async function refundCredits(userId, count, session = null) {
  const msgCount = Number(count);
  if (isNaN(msgCount) || msgCount <= 0) {
    throw new Error("count must be a positive number");
  }

  const ownSession = !session;
  const mongoSession = ownSession ? await mongoose.startSession() : session;
  if (ownSession) mongoSession.startTransaction();

  try {
    const targetUser = await userModel
      .findById(userId)
      .session(mongoSession);
    if (!targetUser) {
      throw new Error("User not found");
    }
    if (!targetUser.ratePerMsg || targetUser.ratePerMsg <= 0) {
      throw new Error("User does not have a valid rate per message");
    }

    const refundAmount = targetUser.ratePerMsg * msgCount;

    // Ensure a wallet exists – create a zero‑balance one if missing
    let wallet = await walletModel
      .findOne({ userId })
      .session(mongoSession);
    if (!wallet) {
      wallet = await walletModel.create(
        [{ userId, balance: 0, resellerId: null }],
        { session: mongoSession }
      );
      wallet = wallet[0];
    }

    wallet.balance += refundAmount;[]
    if (ownSession) {
      await mongoSession.commitTransaction();
      mongoSession.endSession();
    }

    return { amount: refundAmount, newBalance: wallet.balance };
  } catch (err) {
    if (ownSession) {
      await mongoSession.abortTransaction();
      mongoSession.endSession();
    }
    throw err;
  }
}
