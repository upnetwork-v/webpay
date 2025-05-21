import {
  Connection,
  clusterApiUrl,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { SOLANA_NETWORK } from "./phantom";

const connection = new Connection(clusterApiUrl(SOLANA_NETWORK));

// Default fee in SOL if estimation fails
const DEFAULT_FEE = 0.000005; // 5000 lamports

export const estimateTransactionFee = async (
  transaction: Transaction | VersionedTransaction
): Promise<number> => {
  try {
    if (transaction instanceof VersionedTransaction) {
      // For versioned transactions, use a default fee for now
      // as simulation doesn't return the fee directly
      return DEFAULT_FEE;
    } else {
      // For legacy transactions
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;

      // Get the fee for the transaction
      const fee = await connection.getFeeForMessage(
        transaction.compileMessage(),
        "confirmed"
      );

      // Convert lamports to SOL and format to 6 decimal places
      return fee.value ? fee.value / LAMPORTS_PER_SOL : DEFAULT_FEE;
    }
  } catch (error) {
    console.error("Error estimating transaction fee:", error);
    return DEFAULT_FEE; // Return default fee if estimation fails
  }
};
