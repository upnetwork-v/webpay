import { useState } from "react";
import {
  createSolTransferTransaction,
  createSPLTransferTransaction,
} from "@/utils";
import type { Order, CoinCalculator, Token } from "@/types";

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
      console.warn(
        "Missing required payment information",
        order,
        phantomPublicKey,
        paymentToken
      );
      return;
    }

    try {
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
  };

  return {
    error,
    isPaying,
    createPaymentTransaction,
    setError,
    setIsPaying,
  };
};
