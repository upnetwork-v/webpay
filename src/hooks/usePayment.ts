import { useState, useCallback, useMemo } from "react";
import {
  createSolTransferTransaction,
  createSPLTransferTransaction,
} from "@/utils";
import type { Order, CoinCalculator, Token } from "@/types";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

interface UsePaymentProps {
  order: Order | null;
  paymentToken: Token | null;
  coinCalculator: CoinCalculator | null;
  phantomPublicKey: string | null;
}

export const usePayment = ({
  order,
  paymentToken,
  coinCalculator,
  phantomPublicKey,
}: UsePaymentProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  // Use useMemo to ensure connection is stable across renders
  const connection = useMemo(
    () => new Connection(import.meta.env.VITE_SOLANA_RPC),
    []
  );

  // Proactive balance check function
  const checkBalance = useCallback(async (): Promise<{
    sufficient: boolean;
    details: string;
  }> => {
    if (!phantomPublicKey || !paymentToken || !coinCalculator) {
      return { sufficient: false, details: "Missing payment parameters" };
    }

    try {
      const publicKey = new PublicKey(phantomPublicKey);

      if (paymentToken.isNative) {
        // Check SOL balance
        const balance = await connection.getBalance(publicKey, "confirmed");
        const requiredAmount = BigInt(coinCalculator.payTokenAmount);
        const estimatedFee = BigInt(5000); // Conservative fee estimate
        const totalRequired = requiredAmount + estimatedFee;

        if (balance < totalRequired) {
          const shortfall =
            Number(totalRequired - BigInt(balance)) / LAMPORTS_PER_SOL;
          return {
            sufficient: false,
            details: `Insufficient SOL balance. Current: ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL, required: ${(Number(coinCalculator.payTokenAmount) / LAMPORTS_PER_SOL).toFixed(6)} SOL + fees, shortfall: ${shortfall.toFixed(6)} SOL`,
          };
        }
      } else {
        // Check SPL token balance
        if (!paymentToken.tokenAddress) {
          return { sufficient: false, details: "Token address not provided" };
        }

        const tokenAccount = await getAssociatedTokenAddress(
          new PublicKey(paymentToken.tokenAddress),
          publicKey
        );

        const accountInfo = await connection.getAccountInfo(tokenAccount);
        if (!accountInfo) {
          return {
            sufficient: false,
            details:
              "Token not found in wallet. Please add the required token to your wallet first.",
          };
        }

        const tokenAccountParsed =
          await connection.getParsedAccountInfo(tokenAccount);
        let balance: number = 0;

        if (
          tokenAccountParsed.value &&
          "parsed" in tokenAccountParsed.value.data &&
          tokenAccountParsed.value.data.program === "spl-token"
        ) {
          balance =
            tokenAccountParsed.value.data.parsed.info.tokenAmount.amount;
        }

        const requiredAmount = BigInt(coinCalculator.payTokenAmount);
        if (BigInt(balance) < requiredAmount) {
          const shortfall =
            BigInt(coinCalculator.payTokenAmount) - BigInt(balance);
          return {
            sufficient: false,
            details: `Insufficient ${paymentToken.symbol} balance. Current: ${balance}, required: ${coinCalculator.payTokenAmount}, shortfall: ${shortfall}`,
          };
        }

        // Also check SOL balance for transaction fees
        const solBalance = await connection.getBalance(publicKey, "confirmed");
        const estimatedFee = 5000; // Conservative fee estimate
        if (solBalance < estimatedFee) {
          return {
            sufficient: false,
            details: `Insufficient SOL for transaction fees. Current: ${(solBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL, required: ${(estimatedFee / LAMPORTS_PER_SOL).toFixed(6)} SOL`,
          };
        }
      }

      return { sufficient: true, details: "Sufficient balance" };
    } catch (error) {
      console.error("Error checking balance:", error);
      return { sufficient: false, details: "Failed to check balance" };
    }
  }, [phantomPublicKey, paymentToken, coinCalculator, connection]);

  const createPaymentTransaction = useCallback(async () => {
    if (!order || !phantomPublicKey || !paymentToken) {
      console.warn(
        "Missing required payment information",
        order,
        phantomPublicKey,
        paymentToken
      );
      return;
    }

    try {
      // Proactive balance check before creating transaction
      const balanceCheck = await checkBalance();
      if (!balanceCheck.sufficient) {
        throw new Error(balanceCheck.details);
      }
      let tx;

      if (!paymentToken.isNative) {
        // SPL token payment
        if (!paymentToken.tokenAddress) {
          throw new Error("Token address is required for SPL token payment");
        }
        if (!paymentToken.paymentAddress) {
          throw new Error("Payment address is required for SPL token payment");
        }
        if (!coinCalculator) {
          throw new Error("Coin calculator is required for SPL token payment");
        }

        tx = await createSPLTransferTransaction({
          from: phantomPublicKey,
          to: paymentToken.paymentAddress, //"9iusfh8hawwYU3iMW8UqNSR1wjbWTy6UkJKMZ8D65Fx3", //
          tokenAmount: coinCalculator.payTokenAmount,
          tokenAddress: paymentToken.tokenAddress,
          orderId: order.orderId,
        });
      } else {
        // SOL payment
        if (!paymentToken.paymentAddress) {
          throw new Error("Payment address is required for SOL payment");
        }
        if (!coinCalculator) {
          throw new Error("Coin calculator is required for SOL payment");
        }
        tx = await createSolTransferTransaction({
          from: phantomPublicKey,
          to: paymentToken.paymentAddress,
          tokenAmount: coinCalculator.payTokenAmount,
          orderId: order.orderId,
        });
      }

      return tx;
    } catch (err) {
      console.error("Error creating payment transaction:", err);
      throw err;
    }
  }, [order, phantomPublicKey, paymentToken, coinCalculator, checkBalance]);

  return {
    error,
    isPaying,
    createPaymentTransaction,
    checkBalance,
    setError,
    setIsPaying,
  };
};
