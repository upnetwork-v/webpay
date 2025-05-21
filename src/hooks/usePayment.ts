import { useState } from "react";
import {
  createSolTransferTransaction,
  createSPLTransferTransaction,
} from "@/utils/transaction";
import type { Order, CoinCalculator } from "@/types/payment";

interface UsePaymentProps {
  order: Order | null;
  paymentToken: any;
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
        if (!paymentToken.address) {
          throw new Error("Token address is required for SPL token payment");
        }
        tx = await createSPLTransferTransaction({
          from: phantomPublicKey,
          to: order.merchantSolanaAddress,
          tokenAmount: coinCalculator?.tokenAmount ?? "0",
          tokenAddress: paymentToken.address,
          orderId: order.orderId,
        });
      } else {
        tx = await createSolTransferTransaction({
          from: phantomPublicKey,
          to: order.merchantSolanaAddress,
          tokenAmount: coinCalculator?.tokenAmount ?? "0",
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
