import { useState } from "react";
import {
  createSolTransferTransaction,
  createSPLTransferTransaction,
} from "@/utils/transaction";
import type { Order, CoinCalculator, Token } from "@/types/payment";
import { parseUnits } from "viem";

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

  const createPaymentTransaction = async () => {
    if (!order || !phantomPublicKey || !paymentToken) {
      throw new Error("Missing required payment information");
    }

    try {
      let tx;

      if (!paymentToken.isNative) {
        // SPL token payment
        if (!paymentToken.tokenAddress) {
          throw new Error("Token address is required for SPL token payment");
        }
        if (!coinCalculator) {
          throw new Error("Coin calculator is required for SPL token payment");
        }
        tx = await createSPLTransferTransaction({
          from: phantomPublicKey,
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
          from: phantomPublicKey,
          to: order.merchantSolanaAddress,
          tokenAmount: parseUnits(
            coinCalculator.payTokenAmount,
            paymentToken.decimal
          ),
          orderId: order.orderId,
        });
      }

      return tx;
    } catch (err) {
      console.error("Error creating payment transaction:", err);
      throw err;
    }
  };

  return {
    error,
    isPaying,
    createPaymentTransaction,
    setError,
    setIsPaying,
  };
};
