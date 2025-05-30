import { useState, useCallback } from "react";
import {
  createSolTransferTransaction,
  createSPLTransferTransaction,
} from "@/utils/transaction";
import type { Order, CoinCalculator, Token } from "@/types/payment";
import { parseUnits } from "viem";
import { useWallet } from "./useWallet";

interface UsePaymentProps {
  order: Order | null;
  paymentToken: Token | null;
  coinCalculator: CoinCalculator | null;
}

export const usePayment = ({
  order,
  paymentToken,
  coinCalculator,
}: UsePaymentProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const { wallet, account } = useWallet();

  const createPaymentTransaction = useCallback(async () => {
    if (!order || !account || !paymentToken) {
      console.warn("Missing required payment information");
      throw new Error("Wallet not connected or missing payment information");
    }

    try {
      setIsPaying(true);
      setError(null);

      if (!wallet) {
        throw new Error("Wallet not connected");
      }

      let tx;
      const fromAddress = account.address;

      if (!paymentToken.isNative) {
        // SPL token payment
        if (!paymentToken.tokenAddress) {
          throw new Error("Token address is required for SPL token payment");
        }
        if (!coinCalculator) {
          throw new Error("Coin calculator is required for SPL token payment");
        }
        
        tx = await createSPLTransferTransaction({
          from: fromAddress,
          to: order.merchantSolanaAddress,
          tokenAmount: parseUnits(
            coinCalculator.payTokenAmount,
            paymentToken.decimal
          ),
          tokenAddress: paymentToken.tokenAddress,
          orderId: order.orderId,
        });
      } else {
        // SOL payment
        if (!coinCalculator) {
          throw new Error("Coin calculator is required for SOL payment");
        }
        
        tx = await createSolTransferTransaction({
          from: fromAddress,
          to: order.merchantSolanaAddress,
          tokenAmount: parseUnits(
            coinCalculator.payTokenAmount,
            paymentToken.decimal
          ),
          orderId: order.orderId,
        });
      }

      // Send the transaction using the wallet
      const { signature } = await wallet.sendTransaction(tx);
      return { signature };
    } catch (err) {
      console.error("Error in payment process:", err);
      setError(err instanceof Error ? err.message : "Payment failed");
      throw err;
    } finally {
      setIsPaying(false);
    }
  }, [order, paymentToken, coinCalculator, wallet, account]);

  return {
    error,
    isPaying,
    createPaymentTransaction,
    setError,
    setIsPaying,
  };
};
