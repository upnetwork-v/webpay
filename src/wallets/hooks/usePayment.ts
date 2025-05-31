import { useCallback, useState } from 'react';
import { Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useWallet } from './useWallet';

interface PaymentState {
  processing: boolean;
  success: boolean;
  error: Error | null;
  txSignature: string | null;
}

interface PaymentActions {
  sendPayment: (recipient: string, amount: number, memo?: string) => Promise<string>;
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
   * u53d1u9001u652fu4ed8u4ea4u6613
   * @param recipient u63a5u6536u65b9u5730u5740
   * @param amount u91d1u989duff08SOLuff09
   * @param memo u5907u6ce8u4fe1u606f
   * @returns u4ea4u6613u7b7eu540d
   */
  const sendPayment = useCallback(
    async (recipient: string, amount: number, memo?: string): Promise<string> => {
      if (!connected || !publicKey) {
        throw new Error('Wallet not connected');
      }
      
      try {
        setState(prev => ({ ...prev, processing: true, error: null }));
        
        // u521bu5efau4ea4u6613
        const transaction = new Transaction();
        
        // u6dfbu52a0u8f6cu8d26u6307u4ee4
        transaction.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(recipient),
            lamports: amount * LAMPORTS_PER_SOL,
          })
        );
        
        // u6dfbu52a0u5907u6ce8uff08u5982u679cu6709uff09
        if (memo) {
          // u5728u8fd9u91ccu6dfbu52a0u5907u6ce8u6307u4ee4uff0cu5982u679cu9700u8981u7684u8bdd
          // u9700u8981u5bfcu5165u5907u6ce8u7a0bu5e8fu5e76u6dfbu52a0u5230u4ea4u6613u4e2d
        }
        
        // u7b7eu540du5e76u53d1u9001u4ea4u6613
        const signature = await signAndSendTransaction(transaction, {
          skipPreflight: false,
          maxRetries: 3,
          commitment: 'confirmed',
        });
        
        setState(prev => ({
          ...prev,
          processing: false,
          success: true,
          txSignature: signature,
        }));
        
        return signature;
      } catch (error) {
        const err = error as Error;
        setState(prev => ({
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
