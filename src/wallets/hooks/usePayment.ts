import { useCallback, useState } from "react";
import { Transaction, PublicKey, SystemProgram } from "@solana/web3.js";
import { useWallet } from "./useWallet";
import { createSPLTransferTransaction } from "@/utils/transaction";
import { createMemoInstruction } from "@/utils/transaction";

interface PaymentState {
  processing: boolean;
  success: boolean;
  error: Error | null;
  txSignature: string | null;
}

interface PaymentActions {
  sendPayment: (params: {
    recipient: string;
    amount: bigint;
    tokenAddress?: string;
    memo?: string;
  }) => Promise<string>;
  resetPaymentState: () => void;
}

interface UsePaymentResult extends PaymentState, PaymentActions {}

/**
 * u652fu4ed8u76f8u5173u7684 React Hookuff0cu63d0u4f9bu652fu4ed8u4ea4u6613u7684u529fu80fd
 */
export function usePayment(): UsePaymentResult {
  const { connected, publicKey, signAndSendTransaction } = useWallet();

  const [state, setState] = useState<PaymentState>({
    processing: false,
    success: false,
    error: null,
    txSignature: null,
  });

  /**
   * 发送支付交易（支持 SOL/SPL Token，支持 memo）
   * @param params { recipient, amount, token, memo }
   * @returns 交易签名
   */
  const sendPayment = useCallback(
    async ({
      recipient,
      amount,
      tokenAddress,
      memo,
    }: {
      recipient: string;
      amount: bigint;
      tokenAddress?: string;
      memo?: string;
    }): Promise<string> => {
      if (!connected || !publicKey) {
        throw new Error("Wallet not connected");
      }
      try {
        setState((prev) => ({ ...prev, processing: true, error: null }));
        let transaction: Transaction;
        if (tokenAddress) {
          // SPL Token 支付
          transaction = await createSPLTransferTransaction({
            from: publicKey.toBase58(),
            to: recipient,
            tokenAmount: amount,
            tokenAddress,
            memo,
          });
        } else {
          // SOL 支付
          transaction = new Transaction();
          transaction.add(
            SystemProgram.transfer({
              fromPubkey: publicKey,
              toPubkey: new PublicKey(recipient),
              lamports: amount,
            })
          );
          // 添加 Memo 指令（如有）
          if (memo) {
            transaction.add(createMemoInstruction(memo, publicKey));
          }
        }
        const signature = await signAndSendTransaction(transaction, {
          skipPreflight: false,
          maxRetries: 3,
        });
        setState((prev) => ({
          ...prev,
          processing: false,
          success: true,
          txSignature: signature,
        }));
        return signature;
      } catch (error) {
        const err = error as Error;
        setState((prev) => ({
          ...prev,
          processing: false,
          success: false,
          error: err,
        }));
        throw err;
      }
    },
    [connected, publicKey, signAndSendTransaction]
  );

  /**
   * u91cdu7f6eu652fu4ed8u72b6u6001
   */
  const resetPaymentState = useCallback(() => {
    setState({
      processing: false,
      success: false,
      error: null,
      txSignature: null,
    });
  }, []);

  return {
    ...state,
    sendPayment,
    resetPaymentState,
  };
}
